import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api.v1 import auth, users, orders, deliveries, complaints, documents, admin, addresses
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.limiter import limiter
from app.models.order import Order, OrderStatus
from app.websocket.handler import manager

logger = logging.getLogger(__name__)

# ── 배송 지연 자동 감지 (5분마다 실행) ─────────────────────────────────────
DELAY_THRESHOLD_MINUTES = 45   # in_transit 후 45분 초과 시 지연 처리


async def _detect_delayed_orders() -> None:
    """in_transit 상태가 DELAY_THRESHOLD_MINUTES 초과된 주문을 delayed로 전환하고 관리자에게 WebSocket 알림."""
    threshold = datetime.now(timezone.utc) - timedelta(minutes=DELAY_THRESHOLD_MINUTES)
    today = date.today()

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Order).where(
                    Order.status == OrderStatus.in_transit,
                    Order.market_date == today,
                    Order.picked_up_at.isnot(None),
                    Order.picked_up_at < threshold,
                )
            )
            stale = result.scalars().all()

            if not stale:
                return

            for order in stale:
                order.status = OrderStatus.delayed
                logger.warning(
                    "delay_detected order_id=%s order_no=%s picked_up_at=%s",
                    order.id, order.order_no, order.picked_up_at,
                )

            await db.commit()

            # 관리자 WebSocket 알림
            await manager.broadcast("admin", {
                "type": "delay_alert",
                "count": len(stale),
                "order_ids": [o.id for o in stale],
                "order_nos": [o.order_no for o in stale],
                "message": f"{len(stale)}건의 배송이 {DELAY_THRESHOLD_MINUTES}분 초과로 지연 처리됐습니다.",
            })

        except Exception:
            logger.exception("delay detection failed")
            await db.rollback()


async def _delay_detection_loop() -> None:
    """앱 실행 중 5분마다 지연 감지 실행."""
    # 첫 실행은 5분 뒤 (서버 부팅 직후 오탐 방지)
    await asyncio.sleep(300)
    while True:
        await _detect_delayed_orders()
        await asyncio.sleep(300)   # 5분 간격


@asynccontextmanager
async def lifespan(_app: FastAPI):
    os.makedirs("photos", exist_ok=True)
    task = asyncio.create_task(_delay_detection_loop())
    logger.info("delay_detection_loop started")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("delay_detection_loop stopped")


# ── FastAPI 앱 ────────────────────────────────────────────────────────────
app = FastAPI(
    title="경안시장 집배송 서비스 API",
    description="경기도 광주시 경안시장 집배송 서비스 백엔드 API",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(deliveries.router, prefix="/api/v1")
app.include_router(complaints.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(addresses.router, prefix="/api/v1")

app.mount("/photos", StaticFiles(directory="photos"), name="photos")


@app.websocket("/ws/{room}")
async def websocket_endpoint(websocket: WebSocket, room: str, token: str = Query(default="")):
    from app.core.security import decode_token
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, room)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(room, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "경안시장 집배송 서비스"}
