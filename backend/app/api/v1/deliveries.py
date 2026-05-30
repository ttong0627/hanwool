from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin_or_receiver
from app.core.database import get_db
from app.models.delivery import Delivery
from app.models.order import Order
from app.models.user import User
from app.services.order_service import get_orders_today
from app.services.route_service import optimize_route

router = APIRouter(prefix="/deliveries", tags=["배송"])


@router.get("/route")
async def get_optimized_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    driver_id = current_user.id if (current_user.role == "driver" or bool(getattr(current_user, "is_driver", False))) else None
    orders = await get_orders_today(db, driver_id)

    # 저장된 lat/lng 직접 사용 — N+1 geocode 루프 제거
    # 좌표 없는 주문은 경안시장 좌표로 폴백 (관리자가 regeocode-unresolved로 처리 가능)
    enriched = [
        {
            **order,
            "lat": order.get("lat") or 37.4292,
            "lng": order.get("lng") or 127.2551,
        }
        for order in orders
    ]

    # 저장된 순번(수동 조정 포함)이 있으면 그대로 사용 — 매번 재최적화하면 수동 이동이 덮어써짐.
    # 순번이 전혀 없을 때(미배차 등)만 최적화.
    if any(o.get("sequence") is not None for o in enriched):
        return sorted(enriched, key=lambda o: (o.get("sequence") is None, o.get("sequence") or 9999))
    return optimize_route(enriched)


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
