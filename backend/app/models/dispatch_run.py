from datetime import date, datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DispatchRunStatus(str, PyEnum):
    draft = "draft"
    confirmed = "confirmed"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class DispatchRun(Base):
    """배차 실행 이력 — 누가 언제 어떤 기준으로 배차했는지"""

    __tablename__ = "dispatch_runs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    market_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    executed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    driver_count: Mapped[int] = mapped_column(Integer, default=0)
    order_count: Mapped[int] = mapped_column(Integer, default=0)
    is_auto: Mapped[bool] = mapped_column(Boolean, default=True)                 # True=자동배차, False=수동
    split_applied: Mapped[bool] = mapped_column(Boolean, default=False)          # 60건 초과 분리 적용 여부
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=DispatchRunStatus.draft)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DispatchRunItem(Base):
    """배차 실행 항목 — 주문별 배차 결과 스냅샷"""

    __tablename__ = "dispatch_run_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    dispatch_run_id: Mapped[int] = mapped_column(Integer, ForeignKey("dispatch_runs.id"), nullable=False, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    driver_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    service_dong: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sequence_source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # auto/manual/transfer
