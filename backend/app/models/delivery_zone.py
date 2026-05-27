from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DeliveryZone(Base):
    """배송 구역/동 정책 DB — 코드 상수 대신 DB로 관리"""

    __tablename__ = "delivery_zones"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    zone_name: Mapped[str] = mapped_column(String(50), unique=True, index=True)   # 경안동
    legal_emd: Mapped[str] = mapped_column(String(50))                             # 법정동
    admin_emd: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)   # 행정동
    priority: Mapped[int] = mapped_column(Integer, default=99)                    # 정렬 순서
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    default_driver_count: Mapped[int] = mapped_column(Integer, default=1)
    threshold_request_driver: Mapped[int] = mapped_column(Integer, default=40)    # 이 이상이면 기사 추가 요청
    threshold_split_review: Mapped[int] = mapped_column(Integer, default=60)      # 이 이상이면 분리 검토
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
