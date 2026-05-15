from datetime import datetime, date
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_field, decrypt_field, hash_phone
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.schemas.order import OrderCreate, OrderUpdate


def _generate_order_no(sequence: int) -> str:
    today = date.today().strftime("%Y%m%d")
    return f"{today}-{sequence:04d}"


async def _next_sequence(db: AsyncSession) -> int:
    today_start = datetime.combine(date.today(), datetime.min.time())
    result = await db.execute(
        select(func.count()).select_from(Order).where(Order.created_at >= today_start)
    )
    return (result.scalar() or 0) + 1


async def create_order(db: AsyncSession, data: OrderCreate, receiver_id: int) -> Order:
    seq = await _next_sequence(db)
    order = Order(
        order_no=_generate_order_no(seq),
        customer_id=data.customer_id,
        customer_name_enc=encrypt_field(data.customer_name),
        customer_phone_enc=encrypt_field(data.customer_phone),
        receiver_id=receiver_id,
        delivery_address_enc=encrypt_field(data.delivery_address),
        delivery_address_plain=data.delivery_address,
        dong=data.dong,
        items_desc=data.items_desc,
        quantity=data.quantity,
        notes=data.notes,
        request=data.request,
        weight_estimate=data.weight_estimate,
        pickup_location=data.pickup_location,
    )
    db.add(order)
    await db.flush()
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


async def update_order_status(db: AsyncSession, order_id: int, status: str, driver_id: Optional[int] = None) -> Optional[Order]:
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        return None
    order.status = status
    if status == OrderStatus.assigned and driver_id:
        order.driver_id = driver_id
        order.assigned_at = datetime.utcnow()
    elif status == OrderStatus.picked_up:
        order.picked_up_at = datetime.utcnow()
    elif status == OrderStatus.delivered:
        order.delivered_at = datetime.utcnow()
    return order
