import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, or_, select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

_KST = ZoneInfo("Asia/Seoul")

from app.core.security import encrypt_field, decrypt_field, hash_phone
from app.models.order import Order, OrderStatus
from app.models.order_history import OrderHistory
from app.schemas.order import OrderCreate
from app.utils.market_day import is_market_day, today_kst


def _generate_order_no(sequence: int) -> str:
    today = today_kst().strftime("%Y%m%d")
    return f"{today}-{sequence:04d}"


async def _next_sequence(db: AsyncSession) -> int:
    await db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": 2026052401})
    # KST 자정을 UTC로 변환해 비교 (created_at은 UTC 저장). naive 비교 시
    # KST 새벽(UTC 전날) 구간에서 오늘 주문이 누락돼 seq가 1로 고정되는 버그 방지.
    today_start = (
        datetime.combine(today_kst(), datetime.min.time())
        .replace(tzinfo=_KST)
        .astimezone(timezone.utc)
    )
    result = await db.execute(
        select(func.max(Order.sequence)).select_from(Order).where(Order.created_at >= today_start)
    )
    return (result.scalar() or 0) + 1


def _parse_extra_photos(raw: str | None) -> list[str]:
    """extra_photos(JSON 배열 문자열)를 파일명 리스트로 안전 파싱."""
    if not raw:
        return []
    try:
        import json
        data = json.loads(raw)
        return [str(p) for p in data if p] if isinstance(data, list) else []
    except Exception:
        return []


_GA1_RE = re.compile(r"^GA1-(\d+)$")


async def _next_item_code(db: AsyncSession) -> str:
    """직접입력 물품코드 GA1-#### 전역 일련번호 — 기존 최대 번호 + 1 (매번 0001로 리셋되지 않음)."""
    rows = (await db.execute(
        select(Order.item_code).where(Order.item_code.like("GA1-%"))
    )).all()
    mx = 0
    for (code,) in rows:
        m = _GA1_RE.match(code or "")
        if m:
            mx = max(mx, int(m.group(1)))
    return f"GA1-{mx + 1:04d}"


async def create_order(
    db: AsyncSession,
    data: OrderCreate,
    receiver_id: int,
    *,
    _pre_resolved=None,
    is_test: bool = False,
) -> Order:
    from app.services.customer_service import upsert_customer
    from app.services.address_resolver import (
        apply_resolution_to_order,
        log_address_resolution,
        resolve_address,
    )

    address_resolution = _pre_resolved or await resolve_address(data.delivery_address or "", db)
    resolved_dong = address_resolution.service_dong or data.dong

    # 전화번호가 있으면 고객 upsert (신규 생성 or 정보 업데이트)
    customer_id = data.customer_id
    if data.customer_phone:
        customer = await upsert_customer(
            db,
            name=data.customer_name or "",
            phone=data.customer_phone,
            dong=resolved_dong or "경안동",
            address=data.delivery_address or "",
            birth_year=getattr(data, "birth_year", None),
            is_test=is_test,
        )
        if customer and not customer_id:
            customer_id = customer.id

    seq = await _next_sequence(db)
    # 물품코드: 비어있거나 자동(GA1-####)이면 전역 일련번호로 (재)부여 — 마지막 번호에서 이어서 증가
    item_code = data.item_code
    if not item_code or _GA1_RE.match(item_code):
        item_code = await _next_item_code(db)
    today = today_kst()
    order = Order(
        order_no=_generate_order_no(seq),
        customer_id=customer_id,
        customer_name_enc=encrypt_field(data.customer_name),
        customer_phone_enc=encrypt_field(data.customer_phone),
        customer_phone_hash=hash_phone(data.customer_phone) if data.customer_phone else None,
        receiver_id=receiver_id,
        sequence=seq,
        delivery_address_enc=encrypt_field(data.delivery_address),
        dong=resolved_dong or data.dong,
        items_desc=data.items_desc,
        item_code=item_code,
        quantity=data.quantity,
        notes=data.notes,
        request=data.request,
        weight_estimate=data.weight_estimate,
        pickup_location=data.pickup_location,
        market_date=today if is_market_day(today) else None,
        is_test=is_test,
    )
    db.add(order)
    await db.flush()
    apply_resolution_to_order(order, address_resolution, fallback_dong=data.dong)
    await log_address_resolution(db, address_resolution, order_id=order.id)
    await db.flush()
    await log_order_history(
        db,
        order,
        event_type="created",
        to_status=order.status,
        actor_user_id=receiver_id,
        note="주문 접수",
    )
    return order


def decrypt_order(order: Order) -> dict:
    return {
        "id": order.id,
        "order_no": order.order_no,
        "customer_name": decrypt_field(order.customer_name_enc),
        "customer_phone": decrypt_field(order.customer_phone_enc),
        "customer_id": order.customer_id,
        "receiver_id": order.receiver_id,
        "driver_id": order.driver_id,
        "status": order.status,
        "sequence": order.sequence,
        "pickup_location": order.pickup_location,
        "delivery_address": decrypt_field(order.delivery_address_enc),
        "dong": order.dong,
        "raw_address": order.raw_address,
        "standard_road_address": order.standard_road_address,
        "jibun_address": order.jibun_address,
        "detail_address": order.detail_address,
        "legal_emd": order.legal_emd,
        "admin_emd": order.admin_emd,
        "service_dong": order.service_dong,
        "adm_cd": order.adm_cd,
        "rn_mgt_sn": order.rn_mgt_sn,
        "bd_mgt_sn": order.bd_mgt_sn,
        "udrt_yn": order.udrt_yn,
        "buld_mnnm": order.buld_mnnm,
        "buld_slno": order.buld_slno,
        "match_status": order.match_status,
        "match_score": order.match_score,
        "coord_source": order.coord_source,
        "address_verified_at": order.address_verified_at.isoformat() if order.address_verified_at else None,
        "lat": order.lat,
        "lng": order.lng,
        "items_desc": order.items_desc,
        "item_code": order.item_code,
        "quantity": order.quantity,
        "notes": order.notes,
        "request": order.request,
        "weight_estimate": order.weight_estimate,
        "delivery_photo_url": f"/photos/{order.delivery_photo_path}" if order.delivery_photo_path else None,
        "extra_photo_urls": [f"/photos/{p}" for p in _parse_extra_photos(order.extra_photos)],
        "delivery_signature_url": f"/photos/{order.delivery_signature_path}" if order.delivery_signature_path else None,
        "delivery_memo": order.delivery_memo,
        "received_by_security": bool(order.received_by_security),
        "pod_lat": order.pod_lat,
        "pod_lng": order.pod_lng,
        "coord_mismatch": order.coord_mismatch,
        "coord_distance_m": order.coord_distance_m,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "assigned_at": order.assigned_at.isoformat() if order.assigned_at else None,
        "picked_up_at": order.picked_up_at.isoformat() if order.picked_up_at else None,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
    }


async def attach_driver_info(db: AsyncSession, orders: list[dict]) -> list[dict]:
    driver_ids = sorted({order.get("driver_id") for order in orders if order.get("driver_id")})
    if not driver_ids:
        for order in orders:
            order["driver_name"] = None
            order["driver_phone"] = None
        return orders

    from app.models.user import User

    result = await db.execute(select(User).where(User.id.in_(driver_ids)))
    drivers = {
        driver.id: {
            "driver_name": decrypt_field(driver.name_enc) if driver.name_enc else "",
            "driver_phone": decrypt_field(driver.phone_enc) if driver.phone_enc else "",
        }
        for driver in result.scalars().all()
    }
    for order in orders:
        info = drivers.get(order.get("driver_id"), {})
        order["driver_name"] = info.get("driver_name")
        order["driver_phone"] = info.get("driver_phone")
    return orders


async def get_orders_today(db: AsyncSession, driver_id: Optional[int] = None) -> list:
    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(days=1)
    q = select(Order).where(
        or_(
            Order.market_date == today,
            and_(
                Order.market_date.is_(None),
                Order.created_at >= today_start_utc,
                Order.created_at < today_end_utc,
            ),
        )
    )
    if driver_id:
        q = q.where(Order.driver_id == driver_id)
    # 완료(delivered) 주문은 항상 맨 뒤로 — 활성 주문 사이에 섞여 순번 이동 시 함께 움직이는 것처럼 보이는 문제 방지
    q = q.order_by(case((Order.status == OrderStatus.delivered, 1), else_=0), Order.sequence, Order.created_at)
    result = await db.execute(q)
    return await attach_driver_info(db, [decrypt_order(o) for o in result.scalars().all()])


async def log_order_history(
    db: AsyncSession,
    order: Order,
    *,
    event_type: str,
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    actor_role: Optional[str] = None,
    driver_id: Optional[int] = None,
    note: Optional[str] = None,
) -> OrderHistory:
    history = OrderHistory(
        order_id=order.id,
        order_no=order.order_no,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        driver_id=driver_id if driver_id is not None else order.driver_id,
        note=note,
    )
    db.add(history)
    await db.flush()
    return history


def serialize_order_history(history: OrderHistory) -> dict:
    return {
        "id": history.id,
        "order_id": history.order_id,
        "order_no": history.order_no,
        "event_type": history.event_type,
        "from_status": history.from_status,
        "to_status": history.to_status,
        "actor_user_id": history.actor_user_id,
        "actor_role": history.actor_role,
        "driver_id": history.driver_id,
        "note": history.note,
        "created_at": history.created_at.isoformat() if history.created_at else None,
    }


# 허용되는 배송 상태 전이 (그 외 전환은 admin/super_admin만 강제 가능)
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.pending: {OrderStatus.assigned, OrderStatus.cancelled},
    OrderStatus.assigned: {OrderStatus.picked_up, OrderStatus.in_transit, OrderStatus.pending, OrderStatus.cancelled},
    OrderStatus.picked_up: {OrderStatus.in_transit, OrderStatus.delivered, OrderStatus.cancelled},
    OrderStatus.in_transit: {OrderStatus.delivered, OrderStatus.delayed, OrderStatus.cancelled},
    OrderStatus.delayed: {OrderStatus.in_transit, OrderStatus.delivered, OrderStatus.cancelled},
    OrderStatus.delivered: set(),
    OrderStatus.cancelled: set(),
}


async def update_order_status(
    db: AsyncSession,
    order_id: int,
    status: str,
    driver_id: Optional[int] = None,
    *,
    actor_user_id: Optional[int] = None,
    actor_role: Optional[str] = None,
    note: Optional[str] = None,
) -> Optional[Order]:
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        return None
    previous_status = order.status
    previous_driver_id = order.driver_id
    # 상태 전이 화이트리스트 검증 — 같은 상태 재설정은 허용(no-op), admin은 강제 전환 가능
    if status != previous_status and actor_role not in {"admin", "super_admin"}:
        if status not in ALLOWED_TRANSITIONS.get(previous_status, set()):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail=f"허용되지 않은 배송 상태 전환입니다: {previous_status} → {status}",
            )
    order.status = status
    if status == OrderStatus.assigned and driver_id:
        order.driver_id = driver_id
        order.assigned_at = datetime.now(timezone.utc)
    elif status == OrderStatus.picked_up:
        order.picked_up_at = datetime.now(timezone.utc)
    elif status == OrderStatus.delivered:
        order.delivered_at = datetime.now(timezone.utc)
    if previous_status != status or previous_driver_id != order.driver_id:
        event_type = "status_changed"
        if status == OrderStatus.assigned:
            event_type = "assigned"
        elif status == OrderStatus.delivered:
            event_type = "delivered"
        elif status == OrderStatus.cancelled:
            event_type = "cancelled"
        await log_order_history(
            db,
            order,
            event_type=event_type,
            from_status=previous_status,
            to_status=status,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            driver_id=order.driver_id,
            note=note,
        )
    return order
