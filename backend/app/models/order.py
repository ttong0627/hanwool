from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
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
    customer_phone_hash: Mapped[str] = mapped_column(String(64), nullable=True, index=True)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=OrderStatus.pending, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=True)
    pickup_location: Mapped[str] = mapped_column(String(200), default="경안시장")
    delivery_address_enc: Mapped[str] = mapped_column(String(1024))
    dong: Mapped[str] = mapped_column(String(20), index=True)
    items_desc: Mapped[str] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    request: Mapped[str] = mapped_column(Text, nullable=True)
    weight_estimate: Mapped[str] = mapped_column(String(50), nullable=True)
    item_code: Mapped[str] = mapped_column(String(50), nullable=True)
    dong_override: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    sequence_source: Mapped[str] = mapped_column(String(20), default='manual', nullable=True)
    delivery_photo_path: Mapped[str] = mapped_column(String(500), nullable=True)
    delivery_signature_path: Mapped[str] = mapped_column(String(500), nullable=True)
    pod_lat: Mapped[float] = mapped_column(Float, nullable=True)   # POD 촬영 위도
    pod_lng: Mapped[float] = mapped_column(Float, nullable=True)   # POD 촬영 경도
    market_date: Mapped[date] = mapped_column(Date, nullable=True, index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=True)
    lng: Mapped[float] = mapped_column(Float, nullable=True)
    # ── 행안부 표준 주소 키 (주소 정규화 후 저장) ─────────────────────────────
    raw_address: Mapped[str] = mapped_column(Text, nullable=True)
    standard_road_address: Mapped[str] = mapped_column(Text, nullable=True)
    jibun_address: Mapped[str] = mapped_column(Text, nullable=True)
    detail_address: Mapped[str] = mapped_column(Text, nullable=True)
    legal_emd: Mapped[str] = mapped_column(String(50), nullable=True, index=True)    # 법정동 (경안동 등)
    admin_emd: Mapped[str] = mapped_column(String(50), nullable=True)
    service_dong: Mapped[str] = mapped_column(String(50), nullable=True)             # 실제 배송동 (dong_override 반영)
    adm_cd: Mapped[str] = mapped_column(String(10), nullable=True)
    rn_mgt_sn: Mapped[str] = mapped_column(String(20), nullable=True)
    bd_mgt_sn: Mapped[str] = mapped_column(String(25), nullable=True)               # 건물관리번호 (행안부 PK)
    udrt_yn: Mapped[str] = mapped_column(String(1), nullable=True)
    buld_mnnm: Mapped[int] = mapped_column(Integer, nullable=True)
    buld_slno: Mapped[int] = mapped_column(Integer, nullable=True)
    match_status: Mapped[str] = mapped_column(String(20), nullable=True)             # matched/ambiguous/not_found/needs_review
    match_score: Mapped[float] = mapped_column(Float, nullable=True)                # 매칭 신뢰도 0~1
    coord_source: Mapped[str] = mapped_column(String(20), nullable=True)             # nexus/kakao/cache/manual
    address_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false', index=True)
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
