"""WebSocket 핸들러 - 실시간 주문 상태 및 기사 위치 브로드캐스트"""
import json
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        self.active.setdefault(room, []).append(websocket)

    def disconnect(self, websocket: WebSocket, room: str):
        if room in self.active:
            self.active[room] = [ws for ws in self.active[room] if ws != websocket]

    async def broadcast(self, room: str, data: dict):
        dead = []
        for ws in self.active.get(room, []):
            try:
                await ws.send_text(json.dumps(data, ensure_ascii=False, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, room)

    async def broadcast_all(self, data: dict):
        for room in list(self.active.keys()):
            await self.broadcast(room, data)


manager = ConnectionManager()
