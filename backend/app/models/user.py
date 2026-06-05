from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# birth_year_enc: AES-256 암호화된 출생연도 (65세 이상 검증용)


class UserRole(str, PyEnum):
    super_admin = "super_admin"
    admin = "admin"
    receiver = "receiver"
    driver = "driver"
    customer = "customer"


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
    birth_year_enc: Mapped[str] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_driver: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false', index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
