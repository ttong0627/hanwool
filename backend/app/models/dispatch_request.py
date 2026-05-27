from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DispatchRequestStatus:
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class DispatchRequest(Base):
    __tablename__ = "dispatch_requests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    request_date: Mapped[date] = mapped_column(Date, index=True)
    requested_by_driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    total_orders: Mapped[int] = mapped_column(Integer, nullable=False)
    pending_orders: Mapped[int] = mapped_column(Integer, nullable=False)
    recommended_driver_count: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=DispatchRequestStatus.pending, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=True)
    resolved_by_admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_driver_ids: Mapped[str] = mapped_column(String(100), nullable=True)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
