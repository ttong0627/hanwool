from datetime import date, datetime
from typing import Optional

import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_admin_or_receiver, require_driver
from app.core.database import get_db
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.schemas.order import OrderCreate, OrderListOut, OrderOut, OrderUpdate
from app.services import order_service, sms_service

router = APIRouter(prefix="/orders", tags=["주문"])


@router.post("/", response_model=dict, status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_receiver),
):
    order = await order_service.create_order(db, data, current_user.id)
    return order_service.decrypt_order(order)


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
    _=Depends(require_admin_or_receiver),
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
async def get_order(order_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    return order_service.decrypt_order(order)


@router.put("/{order_id}/status")
async def update_status(
    order_id: int,
    status: str,
    driver_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "driver":
        driver_id = current_user.id
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
    _=Depends(require_admin_or_receiver),
):
    order = await order_service.update_order_status(db, order_id, OrderStatus.assigned, driver_id)
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    await sms_service.notify_order_status(order, OrderStatus.assigned)
    return order_service.decrypt_order(order)


@router.delete("/{order_id}")
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin_or_receiver)):
    order = await order_service.update_order_status(db, order_id, OrderStatus.cancelled)
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    await sms_service.notify_order_status(order, OrderStatus.cancelled)
    return {"message": "취소되었습니다."}


PHOTO_DIR = "photos"


@router.post("/{order_id}/photo")
async def upload_delivery_photo(
    order_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_driver),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")

    os.makedirs(PHOTO_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
    filename = f"{order.order_no}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(PHOTO_DIR, filename)

    async with aiofiles.open(filepath, "wb") as f:
        content = await file.read()
        await f.write(content)

    order.delivery_photo_path = filename
    await db.flush()

    return {
        "photo_url": f"/photos/{filename}",
        "order_no": order.order_no,
    }
