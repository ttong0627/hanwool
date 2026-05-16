from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, PyEnum):
    super_admin = "super_admin"
    admin = "admin"
    receiver = "receiver"
    driver = "driver"
    customer = "customer"


class DongArea(str, PyEnum):
    gyeongan = "경안동"
    songjeong = "송정동"
    ssangnyeong = "쌍령동"
    tanbul = "탄벌동"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name_enc: Mapped[str] = mapped_column(String(512))
    phone_enc: Mapped[str] = mapped_column(String(512))
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.customer)
    dong: Mapped[str] = mapped_column(String(20), nullable=True)
    address_enc: Mapped[str] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
