import json
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis

from app.api.v1.deps import get_current_user, require_admin_or_receiver
from app.core.config import settings
from app.core.database import get_db
from app.models.delivery import Delivery
from app.models.user import User
from app.services.order_service import get_orders_today
from app.services.route_service import optimize_route
from app.websocket.handler import manager

router = APIRouter(prefix="/deliveries", tags=["배송"])

# 기사 실시간 위치 — 휘발성 데이터라 Redis에 저장(TTL). 폰 시계 문제를 피하려고 서버 시각으로 기록.
DRIVER_LOC_PREFIX = "driver:loc:"
DRIVER_LOC_TTL = 120  # 초 — 이 시간 동안 신호 없으면 자동 만료

# 이벤트 루프 전역에서 재사용하는 Redis 클라이언트(매 요청 풀 생성으로 인한 소켓 누수 방지)
_redis_client = None


def _redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


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


class DriverLocationIn(BaseModel):
    lat: float
    lng: float


@router.post("/driver-location")
async def report_driver_location(
    body: DriverLocationIn,
    current_user: User = Depends(get_current_user),
):
    """기사 앱(포그라운드/백그라운드)이 주기적으로 호출.
    서버 시각으로 기록해 폰 시계 오차 문제를 제거하고, Redis 저장 + 관리자 실시간 브로드캐스트."""
    ts = int(time.time() * 1000)
    r = _redis()
    await r.setex(
        f"{DRIVER_LOC_PREFIX}{current_user.id}",
        DRIVER_LOC_TTL,
        json.dumps({"driver_id": current_user.id, "lat": body.lat, "lng": body.lng, "ts": ts}),
    )
    await manager.broadcast("driver-location", {
        "type": "location",
        "driver_id": current_user.id,
        "lat": body.lat,
        "lng": body.lng,
        "timestamp": ts,
    })
    return {"ok": True, "timestamp": ts}


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
async def get_all_driver_locations(_=Depends(require_admin_or_receiver)):
    """관리자 대시보드 진입 시 백필용 — Redis에 저장된 마지막 위치를 반환.
    age_seconds(서버 기준 경과초)를 함께 줘서 폰/PC 시계와 무관하게 온라인 판정이 가능하다."""
    r = _redis()
    now_ms = int(time.time() * 1000)
    locations = []
    async for key in r.scan_iter(match=f"{DRIVER_LOC_PREFIX}*", count=100):
        raw = await r.get(key)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            continue
        ts = int(data.get("ts") or now_ms)
        locations.append({
            "driver_id": data.get("driver_id"),
            "lat": data.get("lat"),
            "lng": data.get("lng"),
            "age_seconds": max(0.0, (now_ms - ts) / 1000),
        })
    return locations
