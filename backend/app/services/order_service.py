from datetime import datetime, date, timezone
from typing import Optional

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_field, decrypt_field, hash_phone
from app.models.order import Order, OrderStatus
from app.models.order_history import OrderHistory
from app.schemas.order import OrderCreate
from app.utils.market_day import is_market_day


def _generate_order_no(sequence: int) -> str:
    today = date.today().strftime("%Y%m%d")
    return f"{today}-{sequence:04d}"


async def _next_sequence(db: AsyncSession) -> int:
    await db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": 2026052401})
    today_start = datetime.combine(date.today(), datetime.min.time())
    result = await db.execute(
        select(func.count()).select_from(Order).where(Order.created_at >= today_start)
    )
    return (result.scalar() or 0) + 1


async def create_order(
    db: AsyncSession,
    data: OrderCreate,
    receiver_id: int,
    *,
    _pre_resolved=None,
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
        )
        if customer and not customer_id:
            customer_id = customer.id

    seq = await _next_sequence(db)
    today = date.today()
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
        item_code=data.item_code,
        quantity=data.quantity,
        notes=data.notes,
        request=data.request,
        weight_estimate=data.weight_estimate,
        pickup_location=data.pickup_location,
        market_date=today if is_market_day(today) else None,
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
        "quantity": order.quantity,
        "notes": order.notes,
        "request": order.request,
        "weight_estimate": order.weight_estimate,
        "delivery_photo_url": f"/photos/{order.delivery_photo_path}" if order.delivery_photo_path else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "assigned_at": order.assigned_at.isoformat() if order.assigned_at else None,
        "picked_up_at": order.picked_up_at.isoformat() if order.picked_up_at else None,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
    }


async def get_orders_today(db: AsyncSession, driver_id: Optional[int] = None) -> list:
    today_start = datetime.combine(date.today(), datetime.min.time())
    q = select(Order).where(Order.created_at >= today_start)
    if driver_id:
        q = q.where(Order.driver_id == driver_id)
    q = q.order_by(Order.sequence, Order.created_at)
    result = await db.execute(q)
    return [decrypt_order(o) for o in result.scalars().all()]


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
