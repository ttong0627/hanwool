from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RouteMode(str):
    A = "A"  # 시장 → 배송 → 시장 귀환
    B = "B"  # 시장 → 배송 완료 후 즉시 귀환


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    route_mode: Mapped[str] = mapped_column(String(1), default="A")
    current_lat: Mapped[float] = mapped_column(Float, nullable=True)
    current_lng: Mapped[float] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
