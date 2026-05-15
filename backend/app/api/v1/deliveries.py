from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin_or_receiver
from app.core.database import get_db
from app.models.delivery import Delivery
from app.models.order import Order
from app.models.user import User
from app.services.order_service import decrypt_order, get_orders_today
from app.services.route_service import optimize_route, get_kakao_coordinates

router = APIRouter(prefix="/deliveries", tags=["배송"])


@router.get("/route")
async def get_optimized_route(
    route_mode: str = "A",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver_id = current_user.id if current_user.role == "driver" else None
    orders = await get_orders_today(db, driver_id)

    enriched = []
    for order in orders:
        lat, lng = None, None
        addr = order.get("delivery_address", "")
        coords = await get_kakao_coordinates(addr) if addr else None
        enriched.append({
            **order,
            "lat": coords["lat"] if coords else 37.4292,
            "lng": coords["lng"] if coords else 127.2551,
        })

    return optimize_route(enriched, route_mode)


@router.post("/{order_id}/location")
async def update_driver_location(
    order_id: int,
    lat: float,
    lng: float,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Delivery).where(Delivery.order_id == order_id, Delivery.driver_id == current_user.id))
    delivery = result.scalar_one_or_none()
    if not delivery:
        delivery = Delivery(order_id=order_id, driver_id=current_user.id)
        db.add(delivery)
    delivery.current_lat = lat
    delivery.current_lng = lng
    await db.flush()
    return {"lat": lat, "lng": lng}


@router.get("/drivers/locations")
async def get_all_driver_locations(db: AsyncSession = Depends(get_db), _=Depends(require_admin_or_receiver)):
    result = await db.execute(
        select(Delivery, Order)
        .join(Order, Delivery.order_id == Order.id)
        .where(Order.status.in_(["assigned", "picked_up", "in_transit"]))
    )
    locations = []
    for delivery, order in result.all():
        locations.append({
            "driver_id": delivery.driver_id,
            "order_id": delivery.order_id,
            "order_no": order.order_no,
            "dong": order.dong,
            "lat": delivery.current_lat,
            "lng": delivery.current_lng,
            "updated_at": delivery.updated_at.isoformat() if delivery.updated_at else None,
        })
    return locations
