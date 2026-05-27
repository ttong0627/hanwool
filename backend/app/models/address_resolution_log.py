from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AddressResolutionLog(Base):
    """주소 자동 매칭 결과·실패 이력 — 왜 이 주소가 이 동으로 잡혔는지 추적"""

    __tablename__ = "address_resolution_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    raw_input: Mapped[str] = mapped_column(Text)          # 사용자 원문 입력
    matched_road_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    matched_legal_emd: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    matched_service_dong: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    match_source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)   # nexus/kakao/cache/manual
    match_status: Mapped[str] = mapped_column(String(20), default="not_found")       # matched/ambiguous/not_found/needs_review
    match_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # 0.0~1.0
    failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_manual_corrected: Mapped[bool] = mapped_column(Boolean, default=False)
    corrected_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
