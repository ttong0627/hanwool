from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AddressCache(Base):
    """Kakao 검색 결과 로컬 캐시 — 동·건물명·도로명주소·좌표 영구 저장"""

    __tablename__ = "address_cache"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    road_address: Mapped[str] = mapped_column(String, unique=True, index=True)
    normalized_query: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    jibun_address: Mapped[str | None] = mapped_column(String, nullable=True)
    building_name: Mapped[str | None] = mapped_column(String, nullable=True)
    dong_name: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String, default="kakao")
    adm_cd: Mapped[str | None] = mapped_column(String(10), nullable=True)
    rn_mgt_sn: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bd_mgt_sn: Mapped[str | None] = mapped_column(String(25), nullable=True)
    udrt_yn: Mapped[str | None] = mapped_column(String(1), nullable=True)
    buld_mnnm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    buld_slno: Mapped[int | None] = mapped_column(Integer, nullable=True)
    match_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    hit_count: Mapped[int] = mapped_column(default=0, server_default="0")    # 재활용 횟수
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
