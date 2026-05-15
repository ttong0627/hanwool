import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import auth, users, orders, deliveries, complaints, documents, admin
from app.core.config import settings
from app.websocket.handler import manager

app = FastAPI(
    title="경안시장 집배송 서비스 API",
    description="경기도 광주시 경안시장 집배송 서비스 백엔드 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def websocket_endpoint(websocket: WebSocket, room: str):
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
