import os

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1 import auth, users, orders, deliveries, complaints, documents, admin
from app.core.config import settings
from app.core.limiter import limiter
from app.websocket.handler import manager

app = FastAPI(
    title="경안시장 집배송 서비스 API",
    description="경기도 광주시 경안시장 집배송 서비스 백엔드 API",
    version="1.0.0",
    # 운영환경에서 Swagger/ReDoc 비활성화
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# slowapi 레이트 리미터 등록
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

os.makedirs("photos", exist_ok=True)
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
