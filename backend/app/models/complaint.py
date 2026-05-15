from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ComplaintStatus(str):
    received = "received"
    processing = "processing"
    resolved = "resolved"


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=True)
    customer_name_enc: Mapped[str] = mapped_column(String(512))
    customer_phone_enc: Mapped[str] = mapped_column(String(512))
    channel: Mapped[str] = mapped_column(String(20), default="phone")
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="received", index=True)
    handler_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    result: Mapped[str] = mapped_column(Text, nullable=True)
    result_channel: Mapped[str] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
