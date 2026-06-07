from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserActivityLog(Base):
    """사용자 활동 로그 — 로그인 등 이용 현황 추적용.
    주문 관련 행동은 order_histories(actor_user_id)에 이미 기록되므로,
    여기서는 로그인/로그아웃 등 계정 활동을 남긴다."""
    __tablename__ = "user_activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # login, logout
    detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
