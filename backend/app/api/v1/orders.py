from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Optional
from zoneinfo import ZoneInfo

import os
import uuid
import base64
import logging

_KST = ZoneInfo("Asia/Seoul")
logger = logging.getLogger("hanwool.orders")

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    get_current_user,
    require_admin_or_above,
    require_driver_or_above,
    require_receiver_or_above,
    require_super_admin,
)
from app.core.database import AsyncSessionLocal, get_db
from app.models.address_resolution_log import AddressResolutionLog
from app.models.complaint import Complaint
from app.models.delivery import Delivery
from app.models.dispatch_run import DispatchRun, DispatchRunItem, DispatchRunStatus
from app.models.order import Order, OrderStatus, OrderTransfer
from app.models.order_history import OrderHistory
from app.models.user import User
from app.models.address_override import AddressOverride
from app.schemas.order import (
    AddressConfirmRequest,
    BatchCreateRequest,
    DispatchByDriversRequest,
    DispatchByDongRequest,
    DispatchByDongMultiRequest,
    OrderCreate,
    OrderEditRequest,
    OrderTransferOut,
    OrderTransferRequest,
    ResequenceRequest,
    SignatureUploadRequest,
    SingleOrderCreate,
)
from app.services import order_service, sms_service
from app.services.address_service import geocode_address as _geocode_address
from app.services.address_resolver import apply_resolution_to_order, log_address_resolution, resolve_address, SERVICE_DONGS
from app.services.dispatch_service import DispatchOrder, group_summary, recommended_dong_groups, run_dispatch
from app.services.route_service import (
    analyze_sequence_quality,
    get_kakao_coordinates,
    optimize_route,
    optimize_route_with_kakao_matrix,
)
from app.utils.market_day import is_market_day, is_reception_open, today_kst
from app.websocket.handler import manager

router = APIRouter(prefix="/orders", tags=["주문"])

PHOTO_DIR = "photos"
VALID_DONGS = SERVICE_DONGS  # 배송 허용동 단일 소스 (address_resolver.SERVICE_DONGS, 18개 동)
DRIVER_CAPABLE_ROLES = frozenset({"driver", "admin", "super_admin"})


def is_driver_capable(user) -> bool:
    """role이 driver이거나 is_driver 플래그가 부여된 사용자"""
    return user.role == "driver" or bool(getattr(user, "is_driver", False))


def _enforce_reception_window(role: str) -> None:
    """장날·접수시간 서버 강제 검증. admin/super_admin은 예외(상시 등록 가능)."""
    if role in {"admin", "super_admin"}:
        return
    if not is_market_day():
        raise HTTPException(status_code=400, detail="오늘은 장날이 아닙니다. 접수일: 매월 3·8·13·18·23·28일")
    if not is_reception_open():
        raise HTTPException(status_code=400, detail="접수 시간이 아닙니다. 접수 가능: 장날 오전 11시 ~ 오후 3시")


def _today_start() -> datetime:
    return datetime.combine(today_kst(), datetime.min.time())


async def _get_today_orders_for_dispatch(
    db: AsyncSession, include_in_transit: bool = False
) -> list[Order]:
    statuses = [OrderStatus.pending, OrderStatus.assigned]
    if include_in_transit:
        statuses.append(OrderStatus.in_transit)
    today = today_kst()
    # market_date가 null인 주문 포용: 오늘(KST) 생성된 주문을 UTC 범위로 포함
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    result = await db.execute(
        select(Order)
        .where(
            or_(
                Order.market_date == today,
                and_(
                    Order.market_date.is_(None),
                    Order.created_at >= today_start_utc,
                    Order.created_at < today_end_utc,
                ),
            ),
            Order.status.in_(statuses),
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
    include_in_transit: bool = False,
    dong_groups: Optional[list[list[str]]] = None,
) -> dict:
    from app.core.security import decrypt_field

    if not driver_ids or not (1 <= len(driver_ids) <= 18):
        raise HTTPException(status_code=400, detail="기사는 1~18명까지 배정할 수 있습니다.")

    # 동시 배차 직렬화 — 트랜잭션 advisory lock으로 이중 배차(같은 주문 중복 배정) 방지.
    # 다른 배차 요청은 이 트랜잭션이 끝날 때까지 대기한다.
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 2026060601})

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

    today_orders = await _get_today_orders_for_dispatch(db, include_in_transit=include_in_transit)
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

    groups = run_dispatch(dispatch_orders_list, driver_ids, dong_groups=dong_groups)

    # 배차 결과(driver_id 배정)를 토대로 geo-최적화 순번 재계산
    order_driver_map: dict[int, int] = {
        item.id: group.driver_id
        for group in groups
        for item in group.orders
    }
    geo_order_dicts = [
        {
            "id": o.id,
            "driver_id": order_driver_map.get(o.id),
            "dong": o.dong,
            "service_dong": o.service_dong or o.dong,
            "lat": o.lat,
            "lng": o.lng,
            "delivery_address": decrypt_field(o.delivery_address_enc),
            "order_no": o.order_no,
        }
        for o in today_orders
        if order_driver_map.get(o.id)
    ]
    if geo_order_dicts:
        geo_optimized = await optimize_route_with_kakao_matrix(geo_order_dicts)
        geo_seq_map: dict[int, int] = {
            item["id"]: item["sequence"]
            for item in geo_optimized
            if item.get("sequence") is not None
        }
        geo_source_map: dict[int, str] = {
            item["id"]: item.get("sequence_source") or ("auto" if is_auto else "manual")
            for item in geo_optimized
        }
        id_to_dispatch_item: dict[int, DispatchOrder] = {
            item.id: item
            for group in groups
            for item in group.orders
        }
        for oid, geo_seq in geo_seq_map.items():
            if oid in id_to_dispatch_item:
                id_to_dispatch_item[oid].sequence = geo_seq

    dispatch_run = DispatchRun(
        market_date=today_kst(),
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
                previous_status = db_order.status
                previous_driver_id = db_order.driver_id
                db_order.driver_id = group.driver_id
                db_order.sequence = dispatch_item.sequence
                db_order.sequence_source = geo_source_map.get(db_order.id) or ("auto" if is_auto else "manual")
                if db_order.status in {OrderStatus.pending, OrderStatus.assigned}:
                    db_order.assigned_at = now
                    if is_auto:
                        # 기사가 직접 시작 요청 — 즉시 배송중 전환, picked_up_at 기록
                        db_order.status = OrderStatus.in_transit
                        if not db_order.picked_up_at:
                            db_order.picked_up_at = now
                    else:
                        # 관리자 배차 — 기사가 픽업 확인 후 직접 시작하도록 assigned 상태 유지
                        db_order.status = OrderStatus.assigned
                # in_transit 주문 재배차: 상태는 유지, 기사·순번만 변경
                dispatch_item.status = db_order.status
                if previous_status != db_order.status or previous_driver_id != group.driver_id:
                    if db_order.status == OrderStatus.in_transit and previous_driver_id != group.driver_id:
                        note_base = "관리자 재배차 → 배송중 기사 변경"
                    elif is_auto:
                        note_base = "자동 배차 → 배송중 전환"
                    else:
                        note_base = "관리자 배차 → 배정 대기"
                    await order_service.log_order_history(
                        db,
                        db_order,
                        event_type="dispatched",
                        from_status=previous_status,
                        to_status=db_order.status,
                        actor_user_id=executed_by_id,
                        actor_role="system" if is_auto else None,
                        driver_id=group.driver_id,
                        note=(
                            note_base
                            + (f" / 기사 변경: {previous_driver_id} → {group.driver_id}" if previous_driver_id and previous_driver_id != group.driver_id else "")
                        ),
                    )
                db.add(
                    DispatchRunItem(
                        dispatch_run_id=dispatch_run.id,
                        order_id=db_order.id,
                        driver_id=group.driver_id,
                        sequence=dispatch_item.sequence,
                        service_dong=db_order.service_dong or db_order.dong,
                        lat=db_order.lat,
                        lng=db_order.lng,
                        sequence_source=db_order.sequence_source,
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
    _enforce_reception_window(current_user.role)
    address_resolution = await resolve_address(data.delivery_address, db)

    # 사용자가 명시적으로 선택한 dong이 유효하면 최우선 사용 (address_resolution이 다른 동을 반환해도 무시)
    if data.dong in VALID_DONGS:
        effective_dong = data.dong
    else:
        effective_dong = address_resolution.service_dong or data.dong

    # 동 지역 외여도 저장 허용 (경고는 프론트에서 표시)
    lat = data.lat or address_resolution.lat
    lng = data.lng or address_resolution.lng

    # ── 멱등 처리: 같은 행(client_row_id)이 이미 미배차(pending)로 저장돼 있으면
    #    새 주문을 만들지 말고 그 주문을 갱신한다 → 오타/영문 수정 시 중복 등록 방지
    if data.client_row_id:
        existing = (
            await db.execute(
                select(Order)
                .where(
                    Order.client_row_id == data.client_row_id,
                    Order.receiver_id == current_user.id,
                    Order.status == OrderStatus.pending.value,
                )
                .order_by(Order.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing:
            from app.core.security import encrypt_field, hash_phone
            from app.services.customer_service import upsert_customer

            existing.customer_name_enc = encrypt_field(data.customer_name)
            existing.customer_phone_enc = encrypt_field(data.customer_phone)
            existing.customer_phone_hash = hash_phone(data.customer_phone) if data.customer_phone else None
            existing.delivery_address_enc = encrypt_field(data.delivery_address)
            existing.items_desc = data.items_desc
            existing.quantity = data.quantity
            existing.request = data.request
            existing.dong_override = data.dong_override
            existing.dong = effective_dong
            if data.detail_address is not None:
                existing.detail_address = data.detail_address or None
            apply_resolution_to_order(existing, address_resolution, fallback_dong=effective_dong)
            if lat and lng:
                existing.lat = lat
                existing.lng = lng
            if data.customer_phone:
                await upsert_customer(
                    db, name=data.customer_name or "", phone=data.customer_phone,
                    dong=effective_dong or "경안동", address=data.delivery_address or "",
                )
            await db.flush()
            result = order_service.decrypt_order(existing)
            result.update({"lat": existing.lat, "lng": existing.lng})
            return result

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
    order.client_row_id = data.client_row_id
    if lat and lng:
        order.lat = lat
        order.lng = lng
    order.dong_override = data.dong_override
    if data.detail_address:
        order.detail_address = data.detail_address
    await db.flush()

    result = order_service.decrypt_order(order)
    result.update({"lat": order.lat, "lng": order.lng})
    return result


@router.post("", response_model=dict, status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security import decrypt_field

    # 장날·접수시간 서버 강제 검증 (admin/super_admin은 bypass)
    _enforce_reception_window(current_user.role)

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


@router.get("/today/overview")
async def get_today_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """관리자/접수자용 — 오늘 전체 배송 현황 (배송확인 화면). 기사·완료사진·완료시각 포함."""
    return await order_service.get_orders_today(db, None)


@router.post("/dispatch/start-work")
async def start_driver_work(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_driver_capable(current_user):
        raise HTTPException(status_code=403, detail="기사 또는 기사 업무가 부여된 관리자만 배송업무를 시작할 수 있습니다.")

    today = today_kst()
    # 목록 화면(get_orders_today)과 동일 기준: market_date==today 또는 (market_date 없고 created_at이 KST 오늘)
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    today_filter = or_(
        Order.market_date == today,
        and_(
            Order.market_date.is_(None),
            Order.created_at >= today_start_utc,
            Order.created_at < today_end_utc,
        ),
    )

    active_orders_result = await db.execute(
        select(Order).where(
            today_filter,
            Order.driver_id == current_user.id,
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
    )
    my_active_orders = active_orders_result.scalars().all()
    assigned_count = len(my_active_orders)

    if assigned_count > 0:
        # 배정(assigned) + 픽업완료(picked_up) 주문을 배송중으로 전환 (업무 시작 = 전체 출발)
        pre_assigned = [o for o in my_active_orders if o.status in (OrderStatus.assigned, OrderStatus.picked_up)]
        if pre_assigned:
            now_utc = datetime.now(timezone.utc)
            for order in pre_assigned:
                prev_status = order.status
                order.status = OrderStatus.in_transit
                if order.picked_up_at is None:
                    order.picked_up_at = now_utc
                await order_service.log_order_history(
                    db, order,
                    event_type="started",
                    from_status=prev_status,
                    to_status=OrderStatus.in_transit,
                    actor_user_id=current_user.id,
                    actor_role="driver",
                    note="기사 업무 시작 — 배송중 전환",
                )
            await db.flush()
            await _push_route_to_drivers(pre_assigned)
            sms_jobs = sms_service.build_departure_messages(pre_assigned)
            return {
                "status": "assigned",
                "assigned_count": len(pre_assigned),
                "message": f"오늘 배송 {len(pre_assigned)}건을 시작합니다.",
                "sms_jobs": sms_jobs,
            }
        return {
            "status": "already_assigned",
            "assigned_count": assigned_count,
            "message": "이미 모두 배송 중입니다.",
        }

    # 기사 자가배정 없음 — 무조건 '최고관리자 배정'이 업무 시작점이다.
    # 배정된 주문이 없으면 관리자 배정을 기다린다.
    total_active = (await db.execute(
        select(func.count()).select_from(Order).where(
            today_filter,
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
    )).scalar() or 0
    if total_active == 0:
        return {"status": "no_orders", "assigned_count": 0, "message": "오늘 배정할 주문이 없습니다."}
    return {
        "status": "waiting_admin",
        "assigned_count": 0,
        "message": "총관리자가 기사 배정을 하면 배송이 시작됩니다. 배정되면 목록에 자동 표시됩니다.",
    }


@router.get("/dispatch/today-status")
async def get_today_dispatch_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)

    # market_date 기준 + null market_date는 created_at KST 범위로 폴백
    _order_today_cond = or_(
        Order.market_date == today,
        and_(Order.market_date.is_(None), Order.created_at >= today_start_utc, Order.created_at < today_end_utc),
    )
    status_rows = await db.execute(
        select(Order.status, func.count().label("cnt"))
        .where(_order_today_cond, Order.status != OrderStatus.cancelled)
        .group_by(Order.status)
    )
    by_status = {row.status: row.cnt for row in status_rows}

    dong_rows = await db.execute(
        select(Order.dong, func.count().label("cnt"))
        .where(
            _order_today_cond,
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
        .group_by(Order.dong)
    )
    by_dong = {row.dong: row.cnt for row in dong_rows}

    runs_result = await db.execute(
        select(DispatchRun)
        .where(DispatchRun.market_date == today)
        .order_by(DispatchRun.executed_at.asc())
    )
    runs = runs_result.scalars().all()

    return {
        "total": sum(by_status.values()),
        "by_status": {
            "pending":    by_status.get("pending", 0),
            "assigned":   by_status.get("assigned", 0),
            "picked_up":  by_status.get("picked_up", 0),
            "in_transit": by_status.get("in_transit", 0),
            "delivered":  by_status.get("delivered", 0),
            "delayed":    by_status.get("delayed", 0),
        },
        "by_dong": by_dong,
        "dispatch_runs": [
            {
                "id": r.id,
                "driver_count": r.driver_count,
                "order_count": r.order_count,
                "is_auto": r.is_auto,
                "notes": r.notes,
                "executed_at": r.executed_at.isoformat() if r.executed_at else None,
            }
            for r in runs
        ],
    }


@router.get("/dispatch/recommendation")
async def get_dispatch_recommendation(
    driver_count: int = Query(2, ge=1, le=18),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    today_status = await get_today_dispatch_status(db=db, _=_)
    dong_groups = recommended_dong_groups(driver_count)
    by_dong = today_status.get("by_dong", {})

    return {
        "driver_count": driver_count,
        "dong_groups": dong_groups,
        "groups": [
            {
                "index": idx + 1,
                "dongs": group,
                "order_count": sum(int(by_dong.get(dong, 0)) for dong in group),
            }
            for idx, group in enumerate(dong_groups)
        ],
        "uncovered_dongs": sorted(set(by_dong) - {dong for group in dong_groups for dong in group}),
    }


@router.get("/dispatch/dong-status")
async def get_dong_dispatch_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """동(洞)별 오늘 배송 현황 — 동 단위 배정 화면용.
    각 동: 총 건수 / 미배정 / 배정된 기사별 건수. (취소·완료 제외)"""
    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    today_filter = or_(
        Order.market_date == today,
        and_(Order.market_date.is_(None), Order.created_at >= today_start_utc, Order.created_at < today_end_utc),
    )
    rows = (await db.execute(
        select(Order.dong, Order.driver_id, func.count().label("cnt"))
        .where(today_filter, Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]))
        .group_by(Order.dong, Order.driver_id)
    )).all()

    dong_map: dict[str, dict] = {}
    for dong, driver_id, cnt in rows:
        d = dong_map.setdefault(dong or "미지정", {"dong": dong or "미지정", "total": 0, "unassigned": 0, "drivers": {}})
        d["total"] += cnt
        if driver_id is None:
            d["unassigned"] += cnt
        else:
            d["drivers"][driver_id] = d["drivers"].get(driver_id, 0) + cnt

    result = []
    for d in dong_map.values():
        result.append({
            "dong": d["dong"],
            "total": d["total"],
            "unassigned": d["unassigned"],
            "drivers": [{"driver_id": k, "count": v} for k, v in d["drivers"].items()],
        })
    # 미배정 많은 동 우선 정렬
    result.sort(key=lambda x: (-x["unassigned"], -x["total"]))
    total_unassigned = sum(x["unassigned"] for x in result)
    return {"dongs": result, "total_unassigned": total_unassigned, "unassigned_dong_count": sum(1 for x in result if x["unassigned"] > 0)}


@router.post("/dispatch/by-dong")
async def dispatch_by_dong(
    body: DispatchByDongRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """선택한 동들의 오늘 주문(준비 단계: pending/assigned)을 한 기사에게 배정/재배정.
    배송중·완료 주문은 건드리지 않는다. 배정 후 해당 기사 순번 자동 재계산."""
    driver = (await db.execute(
        select(User).where(
            User.id == body.driver_id,
            or_(User.role == "driver", User.is_driver == True),
            User.is_active == True,
            User.deleted_at == None,
        )
    )).scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=400, detail="유효한 기사가 아닙니다.")

    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    today_filter = or_(
        Order.market_date == today,
        and_(Order.market_date.is_(None), Order.created_at >= today_start_utc, Order.created_at < today_end_utc),
    )
    result = await db.execute(
        select(Order).where(
            today_filter,
            Order.dong.in_(body.dongs),
            Order.status.in_([OrderStatus.pending, OrderStatus.assigned]),
        )
    )
    orders = list(result.scalars().all())
    now = datetime.now(timezone.utc)
    affected_drivers: set[int] = {body.driver_id}
    for o in orders:
        if o.driver_id and o.driver_id != body.driver_id:
            affected_drivers.add(o.driver_id)
        prev_status = o.status
        prev_driver = o.driver_id
        o.driver_id = body.driver_id
        if o.status == OrderStatus.pending:
            o.status = OrderStatus.assigned
            o.assigned_at = now
        await order_service.log_order_history(
            db, o,
            event_type="dispatched",
            from_status=prev_status,
            to_status=o.status,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            driver_id=body.driver_id,
            note=f"동 배정: {o.dong}" + (f" (기사 {prev_driver}→{body.driver_id})" if prev_driver and prev_driver != body.driver_id else ""),
        )
    await db.flush()

    # 배정받은 기사 + 주문을 잃은 기사 모두 순번 재계산
    for did in affected_drivers:
        await _auto_sequence_for_driver(db, did)

    return {
        "assigned": len(orders),
        "dongs": sorted({o.dong for o in orders}),
        "dong_count": len({o.dong for o in orders}),
        "driver_id": body.driver_id,
    }


@router.post("/dispatch/by-dong-multi")
async def dispatch_by_dong_multi(
    body: DispatchByDongMultiRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """선택한 동들을 선택한 여러 기사에게 균등 분배(같은 동=같은 기사). 준비단계(pending/assigned)만 이동, 배정 후 순번 자동."""
    valid_rows = (await db.execute(
        select(User.id).where(
            User.id.in_(body.driver_ids),
            or_(User.role == "driver", User.is_driver == True),
            User.is_active == True,
            User.deleted_at == None,
        )
    )).scalars().all()
    valid_set = set(valid_rows)
    driver_ids = [d for d in body.driver_ids if d in valid_set]
    if not driver_ids:
        raise HTTPException(status_code=400, detail="유효한 기사가 없습니다.")
    if len(driver_ids) > 18:
        raise HTTPException(status_code=400, detail="기사는 1~18명까지 배정할 수 있습니다.")

    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    today_filter = or_(
        Order.market_date == today,
        and_(Order.market_date.is_(None), Order.created_at >= today_start_utc, Order.created_at < today_end_utc),
    )
    orders = list((await db.execute(
        select(Order).where(
            today_filter,
            Order.dong.in_(body.dongs),
            Order.status.in_([OrderStatus.pending, OrderStatus.assigned]),
        )
    )).scalars().all())
    if not orders:
        return {"assigned": 0, "dongs": [], "driver_count": len(driver_ids), "message": "배정할 주문이 없습니다."}

    # 동별 그룹 → 주문 많은 동부터 최소부하 기사에 배정(같은 동=같은 기사)
    by_dong: dict[str, list] = {}
    for o in orders:
        by_dong.setdefault(o.dong, []).append(o)
    load = {d: 0 for d in driver_ids}
    order_target: dict[int, int] = {}
    for dong in sorted(by_dong, key=lambda d: -len(by_dong[d])):
        target = min(driver_ids, key=lambda d: load[d])
        for o in by_dong[dong]:
            order_target[o.id] = target
        load[target] += len(by_dong[dong])

    now = datetime.now(timezone.utc)
    affected: set[int] = set(driver_ids)
    for o in orders:
        did = order_target[o.id]
        if o.driver_id and o.driver_id != did:
            affected.add(o.driver_id)
        prev_status = o.status
        o.driver_id = did
        if o.status == OrderStatus.pending:
            o.status = OrderStatus.assigned
            o.assigned_at = now
        await order_service.log_order_history(
            db, o,
            event_type="dispatched",
            from_status=prev_status,
            to_status=o.status,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            driver_id=did,
            note=f"동 분배 배정: {o.dong}",
        )
    await db.flush()
    for did in affected:
        await _auto_sequence_for_driver(db, did)

    return {
        "assigned": len(orders),
        "dongs": sorted(by_dong.keys()),
        "dong_count": len(by_dong),
        "driver_count": len(driver_ids),
        "per_driver": load,
    }


@router.post("/dispatch/resequence-all")
async def resequence_all_drivers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """오늘 배정된 모든 기사의 배송 순번을 거리 기반으로 다시 계산 (순번 오류 복구용)."""
    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    today_filter = or_(
        Order.market_date == today,
        and_(Order.market_date.is_(None), Order.created_at >= today_start_utc, Order.created_at < today_end_utc),
    )
    rows = (await db.execute(
        select(Order.driver_id)
        .where(
            today_filter,
            Order.driver_id.isnot(None),
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
        .distinct()
    )).all()
    driver_ids = [r[0] for r in rows if r[0]]
    for did in driver_ids:
        await _auto_sequence_for_driver(db, did)
    return {"drivers": len(driver_ids), "message": f"{len(driver_ids)}명 기사의 배송 순번을 다시 계산했습니다."}


@router.post("/dispatch")
async def dispatch_orders_priority(
    body: DispatchByDriversRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    return await _dispatch_today_orders(
        db,
        body.driver_ids,
        executed_by_id=current_user.id,
        is_auto=False,
        include_in_transit=True,
        dong_groups=body.dong_groups,
    )


@router.get("")
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
        statuses = [s.strip() for s in status.split(',') if s.strip()]
        if len(statuses) == 1:
            q = q.where(Order.status == statuses[0])
        else:
            q = q.where(Order.status.in_(statuses))
    if dong:
        q = q.where(Order.dong == dong)
    if driver_id:
        q = q.where(Order.driver_id == driver_id)
    if date_from:
        from datetime import date as _date
        d_from = _date.fromisoformat(date_from[:10])
        # market_date 우선 필터 (KST 기준 장날), null인 경우 created_at 폴백
        kst_from_utc = datetime.combine(d_from, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
        q = q.where(or_(
            Order.market_date >= d_from,
            and_(Order.market_date.is_(None), Order.created_at >= kst_from_utc),
        ))
    if date_to:
        from datetime import date as _date
        d_to = _date.fromisoformat(date_to[:10])
        kst_to_utc = datetime.combine(d_to + timedelta(days=1), datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
        q = q.where(or_(
            Order.market_date <= d_to,
            and_(Order.market_date.is_(None), Order.created_at < kst_to_utc),
        ))

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.order_by(Order.id.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = await order_service.attach_driver_info(db, [order_service.decrypt_order(o) for o in result.scalars().all()])
    return {"items": items, "total": total, "page": page, "page_size": page_size}


_REVIEW_STATUSES = ("not_found", "needs_review")


def _address_review_filter():
    """담당자 확인이 필요한 주문 조건: 미매칭/저신뢰 + 미확정 + 진행중(취소 제외)."""
    return and_(
        Order.match_status.in_(_REVIEW_STATUSES),
        Order.address_reviewed_at.is_(None),
        Order.status != OrderStatus.cancelled.value,
        Order.is_test.is_(False),
    )


@router.get("/address-review")
async def list_address_review_queue(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    """주소 확인 대기 큐 — 로컬·Kakao 모두 정확 매칭 못 한 주문을 담당자가 확정하도록 모은다."""
    q = (
        select(Order)
        .where(_address_review_filter())
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    items = [order_service.decrypt_order(o) for o in result.scalars().all()]
    total = (
        await db.execute(select(func.count()).select_from(
            select(Order).where(_address_review_filter()).subquery()
        ))
    ).scalar()
    return {"items": items, "total": total}


@router.get("/address-review/count")
async def address_review_count(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    """사이드바 배지용 — 주소 확인 대기 건수만 가볍게 반환."""
    total = (
        await db.execute(select(func.count()).select_from(
            select(Order.id).where(_address_review_filter()).subquery()
        ))
    ).scalar()
    return {"count": total or 0}


@router.post("/{order_id:int}/address-confirm")
async def confirm_order_address(
    order_id: int,
    body: AddressConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    """담당자가 미매칭 주문의 정확 주소를 확정한다.
    주문을 갱신하고, 같은 입력이 다음에 자동 매칭되도록 address_overrides에 보정 규칙을 저장한다."""
    from app.core.security import decrypt_field

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    now = datetime.now(timezone.utc)
    order.standard_road_address = body.standard_road_address.strip()
    if body.jibun_address:
        order.jibun_address = body.jibun_address.strip()
    if body.legal_emd:
        order.legal_emd = body.legal_emd.strip()
    if body.detail_address is not None:
        order.detail_address = body.detail_address.strip() or None
    # 배송동 자동 매칭: 담당자가 동을 고르지 않아도 표준주소에서 자동 판별한다(로컬 DB 우선).
    dong = (body.service_dong or "").strip()
    if not dong:
        try:
            res = await resolve_address(order.standard_road_address, db, use_kakao=False)
            dong = (res.service_dong or res.legal_emd or "").strip()
        except Exception:
            dong = ""
    if not dong:
        raise HTTPException(
            status_code=400,
            detail="배송동을 자동 판별하지 못했습니다. 주소를 다시 검색해 선택하세요.",
        )
    order.service_dong = dong
    order.dong = dong

    # 좌표 미제공(로컬 매칭 선택 등) 시 표준주소로 지오코딩
    lat, lng = body.lat, body.lng
    if lat is None or lng is None:
        try:
            kakao = await get_kakao_coordinates(order.standard_road_address)
            if kakao:
                lat = kakao.get("lat")
                lng = kakao.get("lng")
        except Exception:
            pass
    if lat is None or lng is None:
        raise HTTPException(
            status_code=400,
            detail="좌표를 확인하지 못했습니다. 주소를 다시 검색해 선택하세요.",
        )
    order.lat = lat
    order.lng = lng
    order.coord_source = "manual"
    order.match_status = "matched"
    order.match_score = 1.0
    order.address_verified_at = now
    order.address_reviewed_at = now
    order.address_reviewed_by_id = current_user.id

    # 같은 주소가 다음부터 자동 매칭되도록 보정 규칙 저장 (resolve_address가 1순위로 조회)
    if body.save_override:
        raw_pattern = (order.raw_address or decrypt_field(order.delivery_address_enc) or "").strip()[:500]
        if raw_pattern:
            existing = (
                await db.execute(
                    select(AddressOverride).where(AddressOverride.raw_pattern == raw_pattern)
                )
            ).scalar_one_or_none()
            if existing:
                existing.standard_road_address = order.standard_road_address
                existing.force_service_dong = order.service_dong
                existing.force_lat = lat
                existing.force_lng = lng
                existing.memo = body.memo or existing.memo
                existing.created_by_id = current_user.id
            else:
                db.add(AddressOverride(
                    raw_pattern=raw_pattern,
                    standard_road_address=order.standard_road_address,
                    force_service_dong=order.service_dong,
                    force_lat=lat,
                    force_lng=lng,
                    memo=body.memo or "담당자 주소 확인으로 등록",
                    created_by_id=current_user.id,
                ))

    await db.commit()
    await db.refresh(order)
    return order_service.decrypt_order(order)


@router.get("/history/by-order-no/{order_no}")
async def get_order_history_by_order_no(
    order_no: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    result = await db.execute(
        select(OrderHistory)
        .where(OrderHistory.order_no == order_no)
        .order_by(OrderHistory.created_at.asc(), OrderHistory.id.asc())
    )
    return [order_service.serialize_order_history(row) for row in result.scalars().all()]


@router.get("/{order_id:int}")
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


@router.get("/{order_id}/history")
async def get_order_history(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    order_result = await db.execute(select(Order.order_no).where(Order.id == order_id))
    order_no = order_result.scalar_one_or_none()
    if not order_no:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    result = await db.execute(
        select(OrderHistory)
        .where(or_(OrderHistory.order_id == order_id, OrderHistory.order_no == order_no))
        .order_by(OrderHistory.created_at.asc(), OrderHistory.id.asc())
    )
    return [order_service.serialize_order_history(row) for row in result.scalars().all()]


@router.put("/{order_id:int}", response_model=dict)
async def edit_order(
    order_id: int,
    data: OrderEditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    """주문 수정 — pending: 접수자 이상 / assigned·picked_up: 관리자 이상(픽업·배정 자동 취소) / in_transit+: 잠금"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    is_admin_plus = current_user.role in {"admin", "super_admin"}
    # admin+: 모든 상태 수정 가능 / 그 외: pending만
    if not is_admin_plus and order.status != OrderStatus.pending:
        raise HTTPException(status_code=403, detail="접수대기(pending) 상태 주문만 수정할 수 있습니다.")

    status_reset_message: Optional[str] = None
    if is_admin_plus and order.status in {OrderStatus.assigned, OrderStatus.picked_up}:
        prev_status = order.status
        label = "픽업" if prev_status == OrderStatus.picked_up else "배정"
        await order_service.log_order_history(
            db, order,
            event_type="status_changed",
            from_status=prev_status,
            to_status=OrderStatus.pending,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            note=f"수정으로 인한 {label} 취소 및 접수대기 초기화",
        )
        order.status = OrderStatus.pending
        order.driver_id = None
        order.picked_up_at = None
        status_reset_message = f"{label}이 취소되고 접수대기 상태로 초기화되었습니다."

    from app.core.security import encrypt_field
    addr_match_warning: Optional[str] = None
    if data.delivery_address is not None:
        order.delivery_address_enc = encrypt_field(data.delivery_address)
        address_resolution = await resolve_address(data.delivery_address, db)
        apply_resolution_to_order(order, address_resolution, fallback_dong=data.dong or order.dong)
        await log_address_resolution(db, address_resolution, order_id=order.id)
        if address_resolution.match_status == "not_found":
            addr_match_warning = "입력한 주소를 찾을 수 없습니다. 좌표 정보가 설정되지 않았습니다."
        elif address_resolution.match_status == "needs_review":
            addr_match_warning = "주소 매칭이 불완전합니다. 배송 동을 확인해 주세요."
    if data.detail_address is not None:
        order.detail_address = data.detail_address
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
    result_data = order_service.decrypt_order(order)
    if addr_match_warning:
        result_data["address_warning"] = addr_match_warning
    if status_reset_message:
        result_data["status_reset_message"] = status_reset_message
    return result_data


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
        if current_user.role != "super_admin":
            raise HTTPException(status_code=403, detail="기사 배정은 최고관리자만 가능합니다.")
        driver_result = await db.execute(
            select(User).where(User.id == driver_id, or_(User.role == "driver", User.is_driver == True), User.is_active == True)
        )
        if not driver_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="유효하지 않은 기사입니다.")
    order = await order_service.update_order_status(
        db,
        order_id,
        status,
        driver_id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        note="주문 상태 변경",
    )
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    # 최고관리자가 기사를 배정한 경우 → 해당 기사의 오늘 주문 순번을 기사별로 자동 재계산(1번부터)
    if current_user.role == "super_admin" and driver_id is not None:
        await _auto_sequence_for_driver(db, driver_id)

    from app.core.security import decrypt_field
    customer_phone = decrypt_field(order.customer_phone_enc)
    customer_name = decrypt_field(order.customer_name_enc)
    eta = sms_service.eta_text(order.sequence) if status == OrderStatus.in_transit else "30분 이내"
    sms_message = sms_service.get_sms_message(status, customer_name, eta=eta)

    # 완료 사진은 기사 앱이 MMS 파일로 직접 첨부 발송한다(sendMmsWithPhoto).
    # 링크(URL)는 보이스피싱으로 오인돼 고객이 누르지 않으므로 문자 본문에 넣지 않는다.

    result = order_service.decrypt_order(order)
    # 발송할 문자가 있는 상태(예: 완료)에서만 수신정보를 내려보낸다.
    # 출발(in_transit) 등 빈 템플릿은 문자를 발송하지 않는다(완료 문자만).
    if sms_message:
        sms_to, sms_message = sms_service.resolve_sms_recipient(customer_phone, sms_message)
        result["sms_to"] = sms_to
        result["sms_message"] = sms_message
    else:
        result["sms_to"] = None
        result["sms_message"] = None
    return result


async def _auto_sequence_for_driver(db: AsyncSession, driver_id: int) -> None:
    """특정 기사에게 배정된 '오늘 활성 주문'의 배송 순번을 거리 기반으로 자동 재계산.
    개별 기사 배정 시 호출 — 새로 배정된 주문이 최적 경로 순서에 맞게 끼워진다."""
    from app.core.security import decrypt_field

    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    result = await db.execute(
        select(Order).where(
            or_(
                Order.market_date == today,
                and_(Order.market_date.is_(None), Order.created_at >= today_start_utc, Order.created_at < today_end_utc),
            ),
            Order.driver_id == driver_id,
            Order.status.notin_([OrderStatus.cancelled, OrderStatus.delivered]),
        )
    )
    orders = list(result.scalars().all())
    if not orders:
        return

    for o in orders:
        if not o.lat or not o.lng:
            addr = decrypt_field(o.delivery_address_enc)
            resolution = await resolve_address(addr, db)
            apply_resolution_to_order(o, resolution, fallback_dong=o.dong)
            await log_address_resolution(db, resolution, order_id=o.id)

    order_dicts = [
        {
            "id": o.id,
            "driver_id": o.driver_id,
            "dong": o.dong,
            "service_dong": o.service_dong or o.dong,
            "lat": o.lat,
            "lng": o.lng,
            "delivery_address": decrypt_field(o.delivery_address_enc),
            "order_no": o.order_no,
        }
        for o in orders
    ]
    optimized = await optimize_route_with_kakao_matrix(order_dicts)
    seq_map = {item["id"]: item.get("sequence") for item in optimized}
    source_map = {item["id"]: item.get("sequence_source") or "auto" for item in optimized}
    for o in orders:
        new_seq = seq_map.get(o.id)
        if new_seq is not None:
            o.sequence = new_seq
            o.sequence_source = source_map.get(o.id) or "auto"
    await db.flush()
    await _push_route_to_drivers(orders)


@router.put("/{order_id}/assign")
async def assign_driver(
    order_id: int,
    driver_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    order = await order_service.update_order_status(
        db,
        order_id,
        OrderStatus.assigned,
        driver_id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        note="기사 배정",
    )
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    # 배정 즉시 해당 기사의 오늘 주문 순번을 거리 기반으로 자동 지정
    await _auto_sequence_for_driver(db, driver_id)
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

    is_admin = current_user.role == "super_admin"
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
    previous_driver_id = order.driver_id
    order.driver_id = data.to_driver_id
    await order_service.log_order_history(
        db,
        order,
        event_type="transferred",
        from_status=order.status,
        to_status=order.status,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        driver_id=data.to_driver_id,
        note=f"기사 인계: {previous_driver_id or '-'} -> {data.to_driver_id}"
        + (f" / 사유: {data.reason}" if data.reason else ""),
    )
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


@router.delete("/{order_id}/hard")
async def hard_delete_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    """주문 DB 완전 삭제 — pending·assigned: admin 이상 / picked_up: 최고관리자만 / in_transit+: 잠금"""
    if current_user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="관리자 이상만 완전 삭제 가능합니다.")

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    # admin+ 이면 모든 상태 삭제 가능 (중복·오류 데이터 정리 목적)

    # 외래키 참조 레코드 먼저 정리 (CASCADE 없으므로 수동 삭제)
    await order_service.log_order_history(
        db,
        order,
        event_type="hard_deleted",
        from_status=order.status,
        to_status=None,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        driver_id=order.driver_id,
        note="주문 완전 삭제",
    )

    await db.execute(
        AddressResolutionLog.__table__.delete().where(AddressResolutionLog.order_id == order_id)
    )
    await db.execute(
        DispatchRunItem.__table__.delete().where(DispatchRunItem.order_id == order_id)
    )
    await db.execute(
        OrderTransfer.__table__.delete().where(OrderTransfer.order_id == order_id)
    )
    await db.execute(
        Delivery.__table__.delete().where(Delivery.order_id == order_id)
    )
    # 민원은 order_id만 NULL 처리 (민원 기록 자체는 유지)
    await db.execute(
        Complaint.__table__.update().where(Complaint.order_id == order_id).values(order_id=None)
    )

    await db.delete(order)
    return {"message": "주문이 완전히 삭제되었습니다."}


@router.delete("/{order_id:int}")
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    order = await order_service.update_order_status(
        db,
        order_id,
        OrderStatus.cancelled,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        note="주문 취소",
    )
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    await sms_service.notify_order_status(order, OrderStatus.cancelled)
    return {"message": "취소되었습니다."}


_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# 흐림(초점) 검사 — 1024px 다운스케일 후 라플라시안 분산. 미만이면 흐린 사진으로 간주.
# 실측 기준: 흔들린 사진 ~80~190, 선명한 사진 ~230~770 → 임계값 200으로 분리.
_LAP_KERNEL = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1)
BLUR_VAR_THRESHOLD = 45.0  # 아주 흐릴 때만 경고(민감도 낮춤) — 평상시 손촬영은 통과


def _photo_sharpness(content: bytes):
    """이미지 선명도(라플라시안 분산)를 반환. 분석 불가 시 None(차단하지 않음)."""
    try:
        gray = Image.open(BytesIO(content)).convert("L")
        gray.thumbnail((1024, 1024))
        return ImageStat.Stat(gray.filter(_LAP_KERNEL)).var[0]
    except Exception:
        return None


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 간 거리(미터). 배송지-기사 GPS 오차 판정용."""
    from math import radians, sin, cos, asin, sqrt
    r = 6371000.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * r * asin(sqrt(a))


COORD_MISMATCH_THRESHOLD_M = 30.0


@router.post("/blur-check")
async def blur_check(
    file: UploadFile = File(...),
    _: User = Depends(require_driver_or_above),
):
    """촬영 직후 흐림 검사 — 저장하지 않고 선명도만 판정해 흐리면 재촬영을 유도한다.
    (앱 내 WebView 검사는 실기기에서 불안정해 서버 PIL 측정으로 일원화)"""
    content = await file.read()
    var = _photo_sharpness(content)
    if var is None:
        return {"sharp": True, "sharpness": None}  # 분석 불가 시 통과(차단 방지)
    return {"sharp": var >= BLUR_VAR_THRESHOLD, "sharpness": round(var, 1)}


@router.post("/{order_id}/photo")
async def upload_delivery_photo(
    order_id: int,
    file: UploadFile = File(...),
    pod_lat: Optional[float] = Form(None),
    pod_lng: Optional[float] = Form(None),
    force: bool = Form(False),
    memo: Optional[str] = Form(None),
    received_by_security: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_driver_or_above),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    if current_user.role == "driver" and order.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인에게 배정된 주문 사진만 업로드할 수 있습니다.")

    # 배송완료 부가정보(메모·경비실 수령) 저장
    if memo is not None:
        order.delivery_memo = (memo.strip() or None)
    order.received_by_security = bool(received_by_security)

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
    if pod_lat is not None:
        order.pod_lat = pod_lat
    if pod_lng is not None:
        order.pod_lng = pod_lng

    # 기사 GPS와 배송지 좌표 거리 검증 (둘 다 좌표가 있을 때만)
    distance_m = None
    if pod_lat is not None and pod_lng is not None and order.lat is not None and order.lng is not None:
        distance_m = round(_haversine_m(pod_lat, pod_lng, order.lat, order.lng), 1)
        order.coord_distance_m = distance_m
        if distance_m > COORD_MISMATCH_THRESHOLD_M:
            order.coord_mismatch = True
            if force:
                await order_service.log_order_history(
                    db, order,
                    event_type="force_completed",
                    actor_user_id=current_user.id,
                    actor_role=current_user.role,
                    note=f"좌표 불일치 강제완료 — 배송지에서 {distance_m}m 떨어진 위치",
                )
        else:
            order.coord_mismatch = False
    await db.flush()

    return {
        "photo_url": f"/photos/{filename}",
        "order_no": order.order_no,
        "pod_lat": order.pod_lat,
        "pod_lng": order.pod_lng,
        "coord_distance_m": distance_m,
        "coord_mismatch": order.coord_mismatch,
    }


@router.post("/{order_id}/photo/extra")
async def upload_extra_photo(
    order_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_driver_or_above),
):
    """배송완료 추가 사진(최대 2장) 업로드. 메인 사진과 동일 검증·권한."""
    import json
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    if current_user.role == "driver" and order.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인에게 배정된 주문 사진만 업로드할 수 있습니다.")

    existing = []
    if order.extra_photos:
        try:
            existing = json.loads(order.extra_photos)
        except Exception:
            existing = []
    if not isinstance(existing, list):
        existing = []
    if len(existing) >= 2:
        raise HTTPException(status_code=400, detail="추가 사진은 최대 2장까지 가능합니다.")

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
    async with aiofiles.open(os.path.join(PHOTO_DIR, filename), "wb") as f:
        await f.write(content)
    existing.append(filename)
    order.extra_photos = json.dumps(existing)
    await db.flush()
    return {"extra_photo_urls": [f"/photos/{p}" for p in existing], "count": len(existing)}


@router.post("/{order_id}/signature")
async def upload_delivery_signature(
    order_id: int,
    body: SignatureUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_driver_or_above),
):
    """수령인 서명(PNG base64)을 저장 — 배송 완료 시 선택. 사진 업로드와 동일 권한."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    if current_user.role == "driver" and order.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="본인에게 배정된 주문만 서명 등록할 수 있습니다.")

    raw = (body.image_base64 or "").strip()
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        content = base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="서명 이미지 형식이 올바르지 않습니다.")
    if not content:
        raise HTTPException(status_code=400, detail="서명 데이터가 비어 있습니다.")
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="서명 파일 크기는 5MB를 초과할 수 없습니다.")
    try:
        Image.open(BytesIO(content)).verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="손상되었거나 지원하지 않는 이미지입니다.")

    os.makedirs(PHOTO_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.png"
    filepath = os.path.join(PHOTO_DIR, filename)
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)

    order.delivery_signature_path = filename
    await db.flush()
    return {"signature_url": f"/photos/{filename}", "order_no": order.order_no}


@router.post("/sequence/auto")
async def auto_sequence(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """오늘 접수된 주문의 배송순번을 기사별로 자동 계산하고 저장 + WS 푸시"""
    today_start = (
        datetime.combine(today_kst(), datetime.min.time())
        .replace(tzinfo=_KST)
        .astimezone(timezone.utc)
    )
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
            "service_dong": o.service_dong or o.dong,
            "lat": o.lat,
            "lng": o.lng,
            "delivery_address": decrypt_field(o.delivery_address_enc),
            "order_no": o.order_no,
        }
        for o in today_orders
    ]

    optimized = await optimize_route_with_kakao_matrix(order_dicts)
    seq_map = {item["id"]: item.get("sequence") for item in optimized}
    changed_count = 0
    for order in today_orders:
        new_seq = seq_map.get(order.id)
        if new_seq is not None:
            if order.sequence != new_seq:
                changed_count += 1
            order.sequence = new_seq
            optimized_item = next((item for item in optimized if item["id"] == order.id), None)
            order.sequence_source = (optimized_item or {}).get("sequence_source") or "auto"

    await db.flush()
    await _push_route_to_drivers(list(today_orders))

    quality = analyze_sequence_quality(optimized)
    return {"updated": len(today_orders), "changed": changed_count, "quality": quality}


@router.put("/resequence")
async def resequence_orders(
    body: ResequenceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """기사가 본인 배송 순번 수동 재정렬 (드래그 앤 드롭 결과 저장)"""
    sequences = body.sequences

    order_ids = [s.order_id for s in sequences]
    result = await db.execute(select(Order).where(Order.id.in_(order_ids)))
    orders_map = {o.id: o for o in result.scalars().all()}

    for seq_item in sequences:
        order = orders_map.get(seq_item.order_id)
        if not order:
            continue
        if current_user.role == "driver" and order.driver_id != current_user.id:
            raise HTTPException(status_code=403, detail="본인에게 배정된 주문만 순번 변경 가능합니다.")
        order.sequence = seq_item.sequence
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


# ── 좌표 재매칭 (Kakao API) ──────────────────────────────────────────────────

async def _geocode_orders_background(order_ids: list[int]) -> None:
    """백그라운드 좌표 재매칭: 자체 세션으로 처리 (요청 세션과 독립)"""
    from app.core.security import decrypt_field
    async with AsyncSessionLocal() as db:
        for order_id in order_ids:
            try:
                result = await db.execute(select(Order).where(Order.id == order_id))
                order = result.scalar_one_or_none()
                if not order:
                    continue
                address = decrypt_field(order.delivery_address_enc)
                resolution = await resolve_address(address, db)
                apply_resolution_to_order(order, resolution, fallback_dong=order.dong)
                await log_address_resolution(db, resolution, order_id=order.id)
            except Exception:
                pass
        try:
            await db.commit()
        except Exception:
            await db.rollback()


@router.post("/{order_id}/regeocode")
async def regeocode_single_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """단건 좌표 재매칭 — Kakao API로 lat/lng 재취득 후 match_status 갱신"""
    from app.core.security import decrypt_field

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    address = decrypt_field(order.delivery_address_enc)
    resolution = await resolve_address(address, db)
    apply_resolution_to_order(order, resolution, fallback_dong=order.dong)
    await log_address_resolution(db, resolution, order_id=order.id)
    await db.flush()

    return {
        "matched": resolution.match_status == "matched",
        "lat": order.lat,
        "lng": order.lng,
        "match_status": order.match_status,
        "service_dong": order.service_dong,
        "standard_road_address": order.standard_road_address,
    }


@router.post("/regeocode-unresolved")
async def regeocode_unresolved_orders(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_receiver_or_above),
):
    """오늘 좌표 미확인 주문 전체를 백그라운드에서 재매칭 — 즉시 반환"""
    today_start = (
        datetime.combine(today_kst(), datetime.min.time())
        .replace(tzinfo=_KST)
        .astimezone(timezone.utc)
    )
    result = await db.execute(
        select(Order.id).where(
            Order.created_at >= today_start,
            or_(
                Order.lat.is_(None),
                Order.match_status.in_(["needs_review", "not_found"]),
            ),
        )
    )
    order_ids = [row[0] for row in result.all()]
    if order_ids:
        background_tasks.add_task(_geocode_orders_background, order_ids)
    return {"queued": len(order_ids)}


@router.post("/batch", status_code=201)
async def batch_create_orders(
    body: BatchCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    """복수 주문 일괄 등록 (QR / 엑셀 / 직접입력 공통 제출)"""
    rows = body.rows

    # 테스트 모드: True면 생성되는 주문·신규 고객을 is_test=True로 표시
    is_test = body.is_test

    # 실데이터 등록은 장날·접수시간 강제(테스트 등록은 예외)
    if not is_test:
        _enforce_reception_window(current_user.role)

    results = []
    for row in rows:
        try:
            address = row.get("delivery_address", "")
            address_resolution = await resolve_address(address, db)
            dong = address_resolution.service_dong or row.get("dong", "경안동")
            dong_override = bool(row.get("dong_override", False))

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
            order = await order_service.create_order(db, order_data, current_user.id, is_test=is_test)
            if row.get("lat") and row.get("lng"):
                order.lat = float(row["lat"])
                order.lng = float(row["lng"])
                await db.flush()
            results.append({"ok": True, "order_no": order.order_no})
        except HTTPException as e:
            results.append({"ok": False, "error": e.detail})
        except Exception:
            logger.exception("batch order row failed")
            results.append({"ok": False, "error": "주문 등록 중 오류가 발생했습니다."})

    success = sum(1 for r in results if r.get("ok"))
    return {"total": len(rows), "success": success, "results": results}
