from datetime import datetime

from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AddressCache(Base):
    """Kakao 검색 결과 로컬 캐시 — 동·건물명·도로명주소·좌표 영구 저장"""

    __tablename__ = "address_cache"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    road_address: Mapped[str] = mapped_column(String, unique=True, index=True)
    jibun_address: Mapped[str | None] = mapped_column(String, nullable=True)
    building_name: Mapped[str | None] = mapped_column(String, nullable=True)
    dong_name: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String, default="kakao")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
