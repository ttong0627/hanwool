from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OrderStatus(str, PyEnum):
    pending = "pending"
    assigned = "assigned"
    picked_up = "picked_up"
    in_transit = "in_transit"
    delivered = "delivered"
    cancelled = "cancelled"
    delayed = "delayed"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_no: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    customer_name_enc: Mapped[str] = mapped_column(String(512))
    customer_phone_enc: Mapped[str] = mapped_column(String(512))
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=OrderStatus.pending, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=True)
    pickup_location: Mapped[str] = mapped_column(String(200), default="경안시장")
    delivery_address_enc: Mapped[str] = mapped_column(String(1024))
    delivery_address_plain: Mapped[str] = mapped_column(String(500))
    dong: Mapped[str] = mapped_column(String(20), index=True)
    items_desc: Mapped[str] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    request: Mapped[str] = mapped_column(Text, nullable=True)
    weight_estimate: Mapped[str] = mapped_column(String(50), nullable=True)
    delivery_photo_path: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    picked_up_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class OrderTransfer(Base):
    """기사 간 주문 인계 이력 — 누가 왜 언제 넘겼는지 추적"""
    __tablename__ = "order_transfers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    from_driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    to_driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    transferred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
