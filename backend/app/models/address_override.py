from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AddressOverride(Base):
    """현장 수동 보정 DB — 법정동과 실제 배송 기준이 다른 경우 등록"""

    __tablename__ = "address_overrides"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    raw_pattern: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    standard_road_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    force_service_dong: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    force_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    force_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
