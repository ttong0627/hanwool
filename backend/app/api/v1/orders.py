from datetime import date, datetime, timezone
from io import BytesIO
from typing import Optional

import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    get_current_user,
    require_driver_or_above,
    require_receiver_or_above,
)
from app.core.database import get_db
from app.models.dispatch_request import DispatchRequest, DispatchRequestStatus
from app.models.dispatch_run import DispatchRun, DispatchRunItem, DispatchRunStatus
from app.models.order import Order, OrderStatus, OrderTransfer
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderEditRequest,
    OrderTransferOut,
    OrderTransferRequest,
    SingleOrderCreate,
)
from app.services import order_service, sms_service
from app.services.address_service import geocode_address as _geocode_address
from app.services.address_resolver import apply_resolution_to_order, log_address_resolution, resolve_address
from app.services.dispatch_service import DispatchOrder, group_summary, run_dispatch
from app.services.route_service import (
    analyze_sequence_quality,
    optimize_route,
)
from app.utils.market_day import is_market_day, is_reception_open
from app.websocket.handler import manager

router = APIRouter(prefix="/orders", tags=["주문"])

PHOTO_DIR = "photos"
AUTO_ASSIGN_LIMIT = 40
VALID_DONGS = {'경안동', '송정동', '쌍령동', '탄벌동'}
DRIVER_CAPABLE_ROLES = frozenset({"driver", "admin", "super_admin"})


def is_driver_capable(user) -> bool:
    """role이 driver이거나 is_driver 플래그가 부여된 사용자"""
    return user.role == "driver" or bool(getattr(user, "is_driver", False))


def _today_start() -> datetime:
    return datetime.combine(date.today(), datetime.min.time())


async def _get_today_orders_for_dispatch(db: AsyncSession) -> list[Order]:
    result = await db.execute(
        select(Order)
        .where(
            Order.created_at >= _today_start(),
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
        .order_by(Order.created_at.asc())
    )
    return list(result.scalars().all())


async def _push_route_to_drivers(today_orders: list[Order]) -> None:
    """배차/순번 계산 후 각 기사 WS 채널에 route_updated 푸시"""
    from app.core.security import decrypt_field

    driver_map: dict[int, list[dict]] = {}
    for o in today_orders:
        if not o.driver_id:
            continue
        driver_map.setdefault(o.driver_id, []).append({
            "id": o.id,
            "order_no": o.order_no,
            "customer_name": decrypt_field(o.customer_name_enc),
            "dong": o.dong,
            "delivery_address": decrypt_field(o.delivery_address_enc),
            "sequence": o.sequence,
            "status": o.status,
            "quantity": o.quantity,
            "lat": o.lat,
            "lng": o.lng,
        })

    for driver_id, orders_list in driver_map.items():
        await manager.broadcast(
            f"driver-{driver_id}",
            {
                "type": "route_updated",
                "orders": sorted(orders_list, key=lambda x: x.get("sequence") or 999),
            },
        )


async def _dispatch_today_orders(
    db: AsyncSession,
    driver_ids: list[int],
    executed_by_id: Optional[int] = None,
    is_auto: bool = True,
) -> dict:
    from app.core.security import decrypt_field

    if not driver_ids or not (1 <= len(driver_ids) <= 4):
        raise HTTPException(status_code=400, detail="기사는 1~4명까지 배정할 수 있습니다.")

    driver_result = await db.execute(
        select(User.id).where(
            User.id.in_(driver_ids),
            or_(User.role == "driver", User.is_driver == True),
            User.is_active == True,
            User.deleted_at == None,
        )
    )
    valid_driver_ids = {row[0] for row in driver_result.all()}
    if len(valid_driver_ids) != len(set(driver_ids)):
        raise HTTPException(status_code=400, detail="활성 기사만 배정할 수 있습니다.")

    today_orders = await _get_today_orders_for_dispatch(db)
    if not today_orders:
        return {"groups": [], "total": 0}

    for order in today_orders:
        if not order.lat or not order.lng:
            addr = decrypt_field(order.delivery_address_enc)
            address_resolution = await resolve_address(addr, db)
            apply_resolution_to_order(order, address_resolution, fallback_dong=order.dong)
            await log_address_resolution(db, address_resolution, order_id=order.id)

    dispatch_orders_list = [
        DispatchOrder(
            id=o.id,
            dong=o.dong,
            sequence=o.sequence,
            customer_name=decrypt_field(o.customer_name_enc),
            delivery_address=decrypt_field(o.delivery_address_enc),
            quantity=o.quantity or 1,
            status=o.status,
        )
        for o in today_orders
    ]

    groups = run_dispatch(dispatch_orders_list, driver_ids)
    dispatch_run = DispatchRun(
        market_date=date.today(),
        executed_by_id=executed_by_id,
        driver_count=len(driver_ids),
        order_count=len(today_orders),
        is_auto=is_auto,
        split_applied=len(today_orders) >= 60 and len(driver_ids) > 1,
        status=DispatchRunStatus.confirmed,
        notes=(
            f"{len(today_orders)}건을 {len(driver_ids)}명에게 배차"
            + ("; 60건 이상 분리 검토 적용" if len(today_orders) >= 60 else "")
        ),
    )
    db.add(dispatch_run)
    await db.flush()

    id_to_order = {o.id: o for o in today_orders}
    now = datetime.now(timezone.utc)
    for group in groups:
        for dispatch_item in group.orders:
            db_order = id_to_order.get(dispatch_item.id)
            if db_order:
                db_order.driver_id = group.driver_id
                db_order.sequence = dispatch_item.sequence
                db_order.sequence_source = "auto"
                if db_order.status == OrderStatus.pending:
                    db_order.status = OrderStatus.assigned
                    db_order.assigned_at = now
                db.add(
                    DispatchRunItem(
                        dispatch_run_id=dispatch_run.id,
                        order_id=db_order.id,
                        driver_id=group.driver_id,
                        sequence=dispatch_item.sequence,
                        service_dong=db_order.service_dong or db_order.dong,
                        lat=db_order.lat,
                        lng=db_order.lng,
                        sequence_source="auto",
                    )
                )

    await db.flush()
    await _push_route_to_drivers(today_orders)
    return {"groups": group_summary(groups), "total": len(today_orders), "dispatch_run_id": dispatch_run.id}


# ── 단건 자동저장 ────────────────────────────────────────────────────────────

@router.post("/single", response_model=dict, status_code=201)
async def create_single_order(
    data: SingleOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    """ManualTab/QR/Excel 단건 자동저장 — 행 완성 즉시 호출"""
    address_resolution = await resolve_address(data.delivery_address, db)
    effective_dong = address_resolution.service_dong or data.dong

    if effective_dong not in VALID_DONGS:
        if not data.dong_override:
            await log_address_resolution(db, address_resolution)
            raise HTTPException(status_code=400, detail=f"서비스 지역 외 배송동입니다: {effective_dong}")
        if current_user.role not in {"admin", "super_admin"}:
            raise HTTPException(status_code=403, detail="지역 외 배송은 관리자 이상만 강제 등록 가능합니다.")

    lat = data.lat or address_resolution.lat
    lng = data.lng or address_resolution.lng

    order_data = OrderCreate(
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        delivery_address=data.delivery_address,
        dong=effective_dong,
        items_desc=data.items_desc,
        item_code=data.item_code,
        quantity=data.quantity,
        request=data.request,
        dong_override=data.dong_override,
    )
    order = await order_service.create_order(db, order_data, current_user.id, _pre_resolved=address_resolution)
    if lat and lng:
        order.lat = lat
        order.lng = lng
    order.dong_override = data.dong_override
    await db.flush()

    result = order_service.decrypt_order(order)
    result.update({"lat": order.lat, "lng": order.lng})
    return result


@router.post("/", response_model=dict, status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security import decrypt_field

    # 장날·접수시간 서버 강제 검증 (admin/super_admin은 bypass)
    if current_user.role not in {"admin", "super_admin"}:
        if not is_market_day():
            raise HTTPException(status_code=400, detail="오늘은 장날이 아닙니다. 접수일: 매월 3·8·13·18·23·28일")
        if not is_reception_open():
            raise HTTPException(status_code=400, detail="접수 시간이 아닙니다. 접수 가능: 장날 오전 11시 ~ 오후 3시")

    if current_user.role == "customer":
        data.customer_id = current_user.id
        data.customer_name = decrypt_field(current_user.name_enc)
        data.customer_phone = decrypt_field(current_user.phone_enc)
    elif current_user.role not in {"receiver", "admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="주문 접수 권한이 없습니다.")

    order = await order_service.create_order(db, data, current_user.id)
    return order_service.decrypt_order(order)


@router.get("/my")
async def get_my_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """고객 본인 주문 내역 (최근 50건)"""
    q = (
        select(Order)
        .where(Order.customer_id == current_user.id)
        .order_by(Order.created_at.desc())
        .limit(50)
    )
    result = await db.execute(q)
    return [order_service.decrypt_order(o) for o in result.scalars().all()]


@router.get("/today")
async def get_today_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver_id = current_user.id if is_driver_capable(current_user) else None
    return await order_service.get_orders_today(db, driver_id)


@router.post("/dispatch/start-work")
async def start_driver_work(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_driver_capable(current_user):
        raise HTTPException(status_code=403, detail="기사 또는 기사 업무가 부여된 관리자만 배송업무를 시작할 수 있습니다.")

    today_start = _today_start()
    assigned_count = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.created_at >= today_start,
            Order.driver_id == current_user.id,
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
    )).scalar() or 0

    if assigned_count > 0:
        return {
            "status": "already_assigned",
            "assigned_count": assigned_count,
            "message": "이미 배정된 배송업무가 있습니다.",
        }

    total_active = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.created_at >= today_start,
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
    )).scalar() or 0
    pending_count = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.created_at >= today_start,
            Order.driver_id == None,
            Order.status == OrderStatus.pending,
        )
    )).scalar() or 0

    if total_active == 0:
        return {"status": "no_orders", "assigned_count": 0, "message": "오늘 배정할 주문이 없습니다."}

    if pending_count == 0:
        return {
            "status": "waiting_admin",
            "assigned_count": 0,
            "message": "총관리자 배정이 완료될 때까지 대기해 주세요.",
        }

    if total_active > AUTO_ASSIGN_LIMIT:
        existing = await db.execute(
            select(DispatchRequest).where(
                DispatchRequest.request_date == date.today(),
                DispatchRequest.status == DispatchRequestStatus.pending,
            )
        )
        request = existing.scalar_one_or_none()
        if not request:
            recommended = 2 if total_active <= 80 else 3
            request = DispatchRequest(
                request_date=date.today(),
                requested_by_driver_id=current_user.id,
                total_orders=total_active,
                pending_orders=pending_count,
                recommended_driver_count=recommended,
                status=DispatchRequestStatus.pending,
                message=(
                    f"오늘 배송 {total_active}건입니다. "
                    "40건을 초과하여 총관리자 배정 결정이 필요합니다."
                ),
            )
            db.add(request)
            await db.flush()
        return {
            "status": "admin_decision_required",
            "request_id": request.id,
            "total_orders": total_active,
            "pending_orders": pending_count,
            "recommended_driver_count": request.recommended_driver_count,
            "message": "배송 수량이 40건을 초과했습니다. 총관리자에게 기사 추가/분배 요청을 보냈습니다.",
        }

    dispatch_result = await _dispatch_today_orders(
        db,
        [current_user.id],
        executed_by_id=current_user.id,
        is_auto=True,
    )
    return {
        "status": "assigned",
        "assigned_count": dispatch_result["total"],
        "dispatch": dispatch_result,
        "message": f"{dispatch_result['total']}건이 배정되었습니다.",
    }


@router.post("/dispatch")
async def dispatch_orders_priority(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    driver_ids: list[int] = body.get("driver_ids", [])
    return await _dispatch_today_orders(
        db,
        driver_ids,
        executed_by_id=current_user.id,
        is_auto=False,
    )


@router.get("/")
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    dong: Optional[str] = None,
    driver_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    q = select(Order)
    if status:
        q = q.where(Order.status == status)
    if dong:
        q = q.where(Order.dong == dong)
    if driver_id:
        q = q.where(Order.driver_id == driver_id)
    if date_from:
        q = q.where(Order.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.where(Order.created_at <= datetime.fromisoformat(date_to))

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = [order_service.decrypt_order(o) for o in result.scalars().all()]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{order_id}")
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    if current_user.role == "customer" and order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")
    return order_service.decrypt_order(order)


@router.put("/{order_id}", response_model=dict)
async def edit_order(
    order_id: int,
    data: OrderEditRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """pending 상태 주문 수정 — 접수자·admin 이상"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="접수대기 상태의 주문만 수정할 수 있습니다.")

    from app.core.security import encrypt_field
    if data.delivery_address is not None:
        order.delivery_address_enc = encrypt_field(data.delivery_address)
        address_resolution = await resolve_address(data.delivery_address, db)
        apply_resolution_to_order(order, address_resolution, fallback_dong=data.dong or order.dong)
        await log_address_resolution(db, address_resolution, order_id=order.id)
    if data.dong is not None:
        order.dong = data.dong
    if data.items_desc is not None:
        order.items_desc = data.items_desc
    if data.item_code is not None:
        order.item_code = data.item_code
    if data.quantity is not None:
        order.quantity = data.quantity
    if data.notes is not None:
        order.notes = data.notes
    if data.request is not None:
        order.request = data.request

    await db.flush()
    return order_service.decrypt_order(order)


@router.put("/{order_id}/status")
async def update_status(
    order_id: int,
    status: str,
    driver_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if status not in {item.value for item in OrderStatus}:
        raise HTTPException(status_code=400, detail="유효하지 않은 주문 상태입니다.")

    result = await db.execute(select(Order).where(Order.id == order_id))
    existing_order = result.scalar_one_or_none()
    if not existing_order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    if current_user.role == "customer":
        raise HTTPException(status_code=403, detail="주문 상태 변경 권한이 없습니다.")

    if current_user.role == "driver":
        if existing_order.driver_id != current_user.id:
            raise HTTPException(status_code=403, detail="본인에게 배정된 주문만 변경할 수 있습니다.")
        driver_id = current_user.id
    elif current_user.role not in {"super_admin", "admin", "receiver"}:
        raise HTTPException(status_code=403, detail="주문 상태 변경 권한이 없습니다.")
    elif driver_id is not None:
        driver_result = await db.execute(
            select(User).where(User.id == driver_id, or_(User.role == "driver", User.is_driver == True), User.is_active == True)
        )
        if not driver_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="유효하지 않은 기사입니다.")
    order = await order_service.update_order_status(db, order_id, status, driver_id)
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    from app.core.security import decrypt_field
    customer_phone = decrypt_field(order.customer_phone_enc)
    customer_name = decrypt_field(order.customer_name_enc)
    sms_message = sms_service.get_sms_message(status, customer_name)

    result = order_service.decrypt_order(order)
    result["sms_to"] = customer_phone
    result["sms_message"] = sms_message
    return result


@router.put("/{order_id}/assign")
async def assign_driver(
    order_id: int,
    driver_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    order = await order_service.update_order_status(db, order_id, OrderStatus.assigned, driver_id)
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    await sms_service.notify_order_status(order, OrderStatus.assigned)
    return order_service.decrypt_order(order)


@router.post("/{order_id}/transfer", response_model=OrderTransferOut)
async def transfer_order(
    order_id: int,
    data: OrderTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """본인 배정 주문을 동료 기사에게 인계"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    is_admin = current_user.role in ("super_admin", "admin")
    if not is_admin and order.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인에게 배정된 주문만 인계할 수 있습니다.")

    if order.status in (OrderStatus.delivered, OrderStatus.cancelled):
        raise HTTPException(status_code=400, detail="완료·취소된 주문은 인계할 수 없습니다.")

    to_driver_result = await db.execute(
        select(User).where(User.id == data.to_driver_id, or_(User.role == "driver", User.is_driver == True), User.is_active == True)
    )
    to_driver = to_driver_result.scalar_one_or_none()
    if not to_driver:
        raise HTTPException(status_code=404, detail="대상 기사를 찾을 수 없습니다.")

    transfer = OrderTransfer(
        order_id=order_id,
        from_driver_id=current_user.id if not is_admin else (order.driver_id or current_user.id),
        to_driver_id=data.to_driver_id,
        reason=data.reason,
    )
    db.add(transfer)
    order.driver_id = data.to_driver_id
    await db.flush()
    return transfer


@router.get("/{order_id}/transfers", response_model=list[OrderTransferOut])
async def get_transfer_history(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_driver_or_above),
):
    """주문 인계 이력 조회"""
    result = await db.execute(
        select(OrderTransfer)
        .where(OrderTransfer.order_id == order_id)
        .order_by(OrderTransfer.transferred_at.asc())
    )
    return result.scalars().all()


@router.delete("/{order_id}")
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    order = await order_service.update_order_status(db, order_id, OrderStatus.cancelled)
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    await sms_service.notify_order_status(order, OrderStatus.cancelled)
    return {"message": "취소되었습니다."}


_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/{order_id}/photo")
async def upload_delivery_photo(
    order_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_driver_or_above),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    if current_user.role == "driver" and order.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인에게 배정된 주문 사진만 업로드할 수 있습니다.")

    raw_ext = os.path.splitext(file.filename or "")[1].lower()
    if raw_ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="jpg, jpeg, png, webp 파일만 업로드 가능합니다.")

    if file.content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="허용되지 않는 파일 형식입니다.")

    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기는 5MB를 초과할 수 없습니다.")

    try:
        Image.open(BytesIO(content)).verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="손상되었거나 지원하지 않는 이미지 파일입니다.")

    os.makedirs(PHOTO_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{raw_ext}"
    filepath = os.path.join(PHOTO_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)

    order.delivery_photo_path = filename
    await db.flush()

    return {
        "photo_url": f"/photos/{filename}",
        "order_no": order.order_no,
    }


@router.post("/sequence/auto")
async def auto_sequence(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """오늘 접수된 주문의 배송순번을 기사별로 자동 계산하고 저장 + WS 푸시"""
    today_start = datetime.combine(date.today(), datetime.min.time())
    q = select(Order).where(
        Order.created_at >= today_start,
        Order.driver_id.isnot(None),
        Order.status.notin_([OrderStatus.cancelled]),
    )
    result = await db.execute(q)
    today_orders = result.scalars().all()

    if not today_orders:
        return {"updated": 0, "quality": {"drivers": []}}

    from app.core.security import decrypt_field
    for order in today_orders:
        if not order.lat or not order.lng:
            addr = decrypt_field(order.delivery_address_enc)
            address_resolution = await resolve_address(addr, db)
            apply_resolution_to_order(order, address_resolution, fallback_dong=order.dong)
            await log_address_resolution(db, address_resolution, order_id=order.id)

    order_dicts = [
        {
            "id": o.id,
            "driver_id": o.driver_id,
            "dong": o.dong,
            "lat": o.lat,
            "lng": o.lng,
            "delivery_address": decrypt_field(o.delivery_address_enc),
            "order_no": o.order_no,
        }
        for o in today_orders
    ]

    optimized = optimize_route(order_dicts)
    seq_map = {item["id"]: item.get("sequence") for item in optimized}
    for order in today_orders:
        new_seq = seq_map.get(order.id)
        if new_seq is not None:
            order.sequence = new_seq
            order.sequence_source = "auto"

    await db.flush()
    await _push_route_to_drivers(list(today_orders))

    quality = analyze_sequence_quality(optimized)
    return {"updated": len(today_orders), "quality": quality}


@router.put("/resequence")
async def resequence_orders(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기사가 본인 배송 순번 수동 재정렬 (드래그 앤 드롭 결과 저장)"""
    sequences: list[dict] = body.get("sequences", [])
    if not sequences:
        raise HTTPException(status_code=400, detail="sequences 필드가 필요합니다.")

    order_ids = [s["order_id"] for s in sequences]
    result = await db.execute(select(Order).where(Order.id.in_(order_ids)))
    orders_map = {o.id: o for o in result.scalars().all()}

    for seq_item in sequences:
        oid = seq_item.get("order_id")
        seq = seq_item.get("sequence")
        order = orders_map.get(oid)
        if not order:
            continue
        if current_user.role == "driver" and order.driver_id != current_user.id:
            raise HTTPException(status_code=403, detail="본인에게 배정된 주문만 순번 변경 가능합니다.")
        order.sequence = seq
        order.sequence_source = "manual"

    await db.flush()
    return {"updated": len(sequences)}


@router.get("/geocode")
async def geocode_address_endpoint(
    address: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """주소 → 좌표 + 동 (로컬 DB 우선, Kakao 폴백)"""
    result = await _geocode_address(address, db)
    if not result:
        raise HTTPException(status_code=404, detail="주소를 찾을 수 없습니다.")
    return result


@router.post("/batch", status_code=201)
async def batch_create_orders(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    """복수 주문 일괄 등록 (QR / 엑셀 / 직접입력 공통 제출)"""
    rows = body.get("rows", [])
    if not rows:
        raise HTTPException(status_code=400, detail="등록할 주문이 없습니다.")

    results = []
    for row in rows:
        try:
            address = row.get("delivery_address", "")
            address_resolution = await resolve_address(address, db)
            dong = address_resolution.service_dong or row.get("dong", "경안동")
            dong_override = bool(row.get("dong_override", False))

            if dong not in VALID_DONGS and not dong_override:
                await log_address_resolution(db, address_resolution)
                results.append({"ok": False, "error": f"서비스 지역 외 배송동: {dong}"})
                continue
            if dong not in VALID_DONGS and dong_override:
                if current_user.role not in {"admin", "super_admin"}:
                    results.append({"ok": False, "error": "지역 외 배송은 관리자만 가능합니다."})
                    continue

            order_data = OrderCreate(
                customer_name=row.get("customer_name", ""),
                customer_phone=row.get("customer_phone", ""),
                delivery_address=address,
                dong=dong,
                items_desc=row.get("items_desc"),
                item_code=row.get("item_code"),
                quantity=int(row.get("quantity", 1)),
                request=row.get("request"),
                notes=row.get("notes"),
                dong_override=dong_override,
            )
            order = await order_service.create_order(db, order_data, current_user.id)
            if row.get("lat") and row.get("lng"):
                order.lat = float(row["lat"])
                order.lng = float(row["lng"])
                await db.flush()
            results.append({"ok": True, "order_no": order.order_no})
        except Exception as e:
            results.append({"ok": False, "error": str(e)})

    success = sum(1 for r in results if r.get("ok"))
    return {"total": len(rows), "success": success, "results": results}
