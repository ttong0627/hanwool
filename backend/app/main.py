import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select, text

from app.api.v1 import auth, users, orders, deliveries, complaints, documents, admin, addresses, app_meta
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.limiter import limiter
from app.models.order import Order, OrderStatus
from app.utils.market_day import today_kst
from app.websocket.handler import manager

logger = logging.getLogger(__name__)

# ── 배송 지연 자동 감지 (5분마다 실행) ─────────────────────────────────────
DELAY_THRESHOLD_MINUTES = 45   # in_transit 후 45분 초과 시 지연 처리


async def _detect_delayed_orders() -> None:
    """in_transit 상태가 DELAY_THRESHOLD_MINUTES 초과된 주문을 delayed로 전환하고 관리자에게 WebSocket 알림."""
    threshold = datetime.now(timezone.utc) - timedelta(minutes=DELAY_THRESHOLD_MINUTES)
    today = today_kst()

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


os.makedirs("photos", exist_ok=True)  # StaticFiles 마운트 전 반드시 존재해야 함


@asynccontextmanager
async def lifespan(_app: FastAPI):
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
app.include_router(app_meta.router, prefix="/api/v1")

app.mount("/photos", StaticFiles(directory="photos"), name="photos")


def _websocket_auth_token(websocket: WebSocket, query_token: str) -> tuple[str, str | None]:
    if query_token:
        return query_token, None

    protocols = [
        protocol.strip()
        for protocol in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if protocol.strip()
    ]
    if len(protocols) >= 2 and protocols[0] == "access-token":
        return protocols[1], "access-token"

    return "", None


@app.websocket("/ws/{room}")
async def websocket_endpoint(websocket: WebSocket, room: str, token: str = Query(default="")):
    from app.core.security import decode_token

    auth_token, accept_subprotocol = _websocket_auth_token(websocket, token)
    payload = decode_token(auth_token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, room, subprotocol=accept_subprotocol)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(room, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "경안시장 집배송 서비스"}


@app.get("/health/ready")
async def health_ready():
    """의존성(DB·Redis) 준비 상태 — 컨테이너 healthcheck용.

    DB 연결 실패 시 503(컨테이너 unhealthy 표시). Redis는 캐시/세션이므로
    실패해도 degraded로 표시하되 200을 유지한다(DB가 핵심 의존성).
    """
    checks = {"db": "down", "redis": "down"}
    status_code = 200

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:  # noqa: BLE001
        logger.error("health_ready DB check failed: %s", exc)
        status_code = 503

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.REDIS_URL)
        await client.ping()
        await client.aclose()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning("health_ready Redis check failed: %s", exc)

    return JSONResponse(
        status_code=status_code,
        content={"status": "ok" if status_code == 200 else "degraded", **checks},
    )
