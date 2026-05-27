from datetime import datetime
from io import BytesIO
from typing import Optional

import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    get_current_user,
    require_driver_or_above,
    require_receiver_or_above,
)
from app.core.database import get_db
from app.models.order import Order, OrderStatus, OrderTransfer
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderEditRequest,
    OrderTransferOut,
    OrderTransferRequest,
)
from app.services import order_service, sms_service
from app.services.dispatch_service import DispatchOrder, group_summary, run_dispatch
from app.services.route_service import (
    analyze_sequence_quality,
    get_kakao_coordinates,
    optimize_route,
)
from app.utils.market_day import is_market_day, is_reception_open

router = APIRouter(prefix="/orders", tags=["주문"])

PHOTO_DIR = "photos"


@router.post("/", response_model=dict, status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security import decrypt_field

    # 장날·접수시간 서버 강제 검증 (admin/super_admin은 bypass — 비장날 테스트·긴급 접수 허용)
    if current_user.role not in {"admin", "super_admin"}:
        if not is_market_day():
            raise HTTPException(status_code=400, detail="오늘은 장날이 아닙니다. 접수일: 매월 3·8·13·18·23·28일")
        if not is_reception_open():
            raise HTTPException(status_code=400, detail="접수 시간이 아닙니다. 접수 가능: 장날 오전 11시 ~ 오후 3시")

    # 고객이 직접 접수하는 경우 본인 정보 자동 주입
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
    driver_id = current_user.id if current_user.role == "driver" else None
    return await order_service.get_orders_today(db, driver_id)


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
    if data.dong is not None:
        order.dong = data.dong
    if data.items_desc is not None:
        order.items_desc = data.items_desc
    if data.quantity is not None:
        order.quantity = data.quantity
    if data.notes is not None:
        order.notes = data.notes
    if data.request is not None:
        order.request = data.request
    if data.weight_estimate is not None:
        order.weight_estimate = data.weight_estimate

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
            select(User).where(User.id == driver_id, User.role == "driver", User.is_active == True)
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
        select(User).where(User.id == data.to_driver_id, User.role == "driver", User.is_active == True)
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

    # 확장자 화이트리스트
    if current_user.role == "driver" and order.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인에게 배정된 주문 사진만 업로드할 수 있습니다.")

    raw_ext = os.path.splitext(file.filename or "")[1].lower()
    if raw_ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="jpg, jpeg, png, webp 파일만 업로드 가능합니다.")

    # MIME 타입 검증
    if file.content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="허용되지 않는 파일 형식입니다.")

    # 파일 크기 제한 (5MB)
    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기는 5MB를 초과할 수 없습니다.")

    # UUID 기반 안전한 파일명 생성 (원본 파일명 사용 안 함)
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
    """
    오늘 접수된 주문의 배송순번을 기사별로 자동 계산하고 저장합니다.
    - 도로명 정보가 있으면 roadAwareTSP
    - 없으면 nearestNeighborTSP (좌표 기반)
    - 좌표 없는 주문은 Kakao API로 실시간 geocoding 시도
    """
    from datetime import date

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

    # 좌표 없는 주문은 Kakao geocoding 시도
    from app.core.security import decrypt_field
    for order in today_orders:
        if not order.lat or not order.lng:
            addr = decrypt_field(order.delivery_address_enc)
            coord = await get_kakao_coordinates(addr)
            if coord:
                order.lat = coord["lat"]
                order.lng = coord["lng"]

    # optimize_route용 dict 변환
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

    # sequence 저장
    seq_map = {item["id"]: item.get("sequence") for item in optimized}
    for order in today_orders:
        new_seq = seq_map.get(order.id)
        if new_seq is not None:
            order.sequence = new_seq

    await db.flush()

    quality = analyze_sequence_quality(optimized)
    return {"updated": len(today_orders), "quality": quality}


@router.post("/dispatch")
async def dispatch_orders(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """
    기사 배차 + 배송순번 일괄 할당

    body: { "driver_ids": [int, ...] }  — 1~4명
    규칙:
      1명: 경안동→송정동→쌍령동→탄벌동 순
      2명: [경안동+쌍령동] / [송정동+탄벌동]
      3명: 수량 최소 2개동 묶어 1명, 나머지 각 1명
      4명: 동별 1:1, 불균형 시 이관 허용 플래그
    """
    from datetime import date
    from app.core.security import decrypt_field

    driver_ids: list[int] = body.get("driver_ids", [])
    if not driver_ids or not (1 <= len(driver_ids) <= 4):
        raise HTTPException(status_code=400, detail="driver_ids는 1~4명이어야 합니다.")

    today_start = datetime.combine(date.today(), datetime.min.time())
    q = select(Order).where(
        Order.created_at >= today_start,
        Order.status.notin_([OrderStatus.cancelled]),
    )
    result = await db.execute(q)
    today_orders = result.scalars().all()

    if not today_orders:
        return {"groups": [], "total": 0}

    # 좌표 없는 주문 geocoding
    for order in today_orders:
        if not order.lat or not order.lng:
            addr = decrypt_field(order.delivery_address_enc)
            coord = await get_kakao_coordinates(addr)
            if coord:
                order.lat = coord["lat"]
                order.lng = coord["lng"]

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

    # driver_id + sequence DB 저장
    id_to_order = {o.id: o for o in today_orders}
    for g in groups:
        for dispatch_item in g.orders:
            db_order = id_to_order.get(dispatch_item.id)
            if db_order:
                db_order.driver_id = g.driver_id
                db_order.sequence = dispatch_item.sequence
                if db_order.status == OrderStatus.pending:
                    db_order.status = OrderStatus.assigned

    await db.flush()

    return {"groups": group_summary(groups), "total": len(today_orders)}


@router.post("/{order_id}/transfer")
async def transfer_order(
    order_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """단건 주문 이관 — 기사 간 재배정 (4명 모드 불균형 조정)"""
    raw_to = body.get("to_driver_id")
    if not isinstance(raw_to, (int, str)) or not raw_to:
        raise HTTPException(status_code=400, detail="to_driver_id 필수")
    to_driver_id: int = int(raw_to)
    reason: str = body.get("reason", "배송 부하 조정")

    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    if order.status in {OrderStatus.delivered, OrderStatus.cancelled}:
        raise HTTPException(status_code=400, detail="완료·취소된 주문은 이관할 수 없습니다.")

    from_driver_id: int = order.driver_id or 0
    order.driver_id = to_driver_id

    transfer = OrderTransfer(
        order_id=order_id,
        from_driver_id=from_driver_id,
        to_driver_id=to_driver_id,
        reason=reason,
    )
    db.add(transfer)
    await db.flush()

    return {"ok": True, "order_id": order_id, "to_driver_id": to_driver_id}
