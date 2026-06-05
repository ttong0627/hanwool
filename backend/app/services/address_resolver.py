from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.address_resolution_log import AddressResolutionLog
from app.services.route_service import get_kakao_coordinates

SERVICE_DONGS = {
    "경안동", "송정동", "쌍령동", "탄벌동",
    "고산동", "매산동", "목동", "목현동", "문형동", "삼동",
    "양벌동", "역동", "장지동", "중대동", "직동", "추자동", "태전동", "회덕동",
}
GWANGJU_PREFIX = "경기도 광주시"


@dataclass
class AddressResolution:
    raw_address: str
    standard_road_address: Optional[str] = None
    jibun_address: Optional[str] = None
    detail_address: Optional[str] = None
    legal_emd: Optional[str] = None
    admin_emd: Optional[str] = None
    service_dong: Optional[str] = None
    adm_cd: Optional[str] = None
    rn_mgt_sn: Optional[str] = None
    bd_mgt_sn: Optional[str] = None
    udrt_yn: Optional[str] = None
    buld_mnnm: Optional[int] = None
    buld_slno: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    coord_source: Optional[str] = None
    match_status: str = "not_found"
    match_score: Optional[float] = None
    match_source: Optional[str] = None
    match_message: Optional[str] = None

    def to_public_dict(self) -> dict:
        return asdict(self)


def normalize_address_key(value: str) -> str:
    if not value:
        return ""
    value = value.strip().lower()
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"[,\[\]{}]", " ", value)
    value = re.sub(r"\s+", "", value)
    return value


def _strip_gwangju_prefix(value: str) -> str:
    value = (value or "").strip()
    for prefix in ("경기도 광주시", "경기 광주시", "광주시"):
        if value.startswith(prefix):
            return value[len(prefix):].strip()
    return value


def _split_detail(value: str) -> tuple[str, Optional[str]]:
    value = (value or "").strip()
    if not value:
        return "", None
    parts = re.split(r"\s*,\s*", value, maxsplit=1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip() or None
    return value, None


def _parse_road(value: str) -> Optional[dict]:
    clean = _strip_gwangju_prefix(value)
    match = re.search(r"(.+?(?:대로|로|길)(?:\d+번길)?)\s+(\d+)(?:-(\d+))?", clean)
    if not match:
        return None
    return {
        "road_name": match.group(1).strip(),
        "main_no": int(match.group(2)),
        "sub_no": int(match.group(3)) if match.group(3) else 0,
        "underground": "1" if "지하" in clean else "0",
    }


def _parse_jibun(value: str) -> Optional[dict]:
    clean = _strip_gwangju_prefix(value)
    match = re.search(r"([가-힣]+[동읍면리])\s*(산\s*)?(\d+)(?:[-번지\s]+(\d+))?", clean)
    if not match:
        return None
    return {
        "dong": match.group(1),
        "san": "1" if match.group(2) else "0",
        "main_no": int(match.group(3)),
        "sub_no": int(match.group(4)) if match.group(4) else 0,
    }


async def _find_override(address: str, db: AsyncSession) -> Optional[AddressResolution]:
    row = (
        await db.execute(
            text(
                "SELECT standard_road_address, force_service_dong, force_lat, force_lng, memo "
                "FROM address_overrides "
                "WHERE :address ILIKE '%' || raw_pattern || '%' "
                "ORDER BY length(raw_pattern) DESC "
                "LIMIT 1"
            ),
            {"address": address},
        )
    ).first()
    if not row:
        return None
    return AddressResolution(
        raw_address=address,
        standard_road_address=row[0],
        service_dong=row[1],
        lat=row[2],
        lng=row[3],
        coord_source="manual" if row[2] and row[3] else None,
        match_status="matched",
        match_score=1.0,
        match_source="override",
        match_message=row[4] or "수동 보정 규칙으로 매칭했습니다.",
    )


async def _service_dong_for_legal(legal_emd: Optional[str], db: AsyncSession) -> Optional[str]:
    if not legal_emd:
        return None
    row = (
        await db.execute(
            text(
                "SELECT zone_name FROM delivery_zones "
                "WHERE is_active = true AND legal_emd = :legal "
                "ORDER BY priority LIMIT 1"
            ),
            {"legal": legal_emd},
        )
    ).first()
    if row:
        return row[0]
    return legal_emd if legal_emd in SERVICE_DONGS else None


async def _admin_emd_for_legal(legal_emd: Optional[str], db: AsyncSession) -> Optional[str]:
    if not legal_emd:
        return None
    row = (
        await db.execute(
            text(
                "SELECT admin_emd FROM nexus_address.admin_dong_map "
                "WHERE legal_emd = :legal ORDER BY admin_emd LIMIT 1"
            ),
            {"legal": legal_emd},
        )
    ).first()
    return row[0] if row else None


def _from_building_row(address: str, row) -> AddressResolution:
    road_address = row.road_address
    building_name = row.building_name
    if building_name and building_name not in road_address:
        road_address = f"{road_address} ({building_name})"
    rn_mgt_sn = row.road_code
    return AddressResolution(
        raw_address=address,
        standard_road_address=road_address,
        legal_emd=row.legal_emd,
        adm_cd=rn_mgt_sn[:10] if rn_mgt_sn else None,
        rn_mgt_sn=rn_mgt_sn,
        bd_mgt_sn=row.building_mgt_no,
        udrt_yn=row.underground_yn or "0",
        buld_mnnm=row.building_main_no,
        buld_slno=row.building_sub_no or 0,
        match_status="matched",
        match_score=0.98,
        match_source="nexus",
        coord_source=None,
    )


async def _resolve_by_road(address: str, db: AsyncSession) -> Optional[AddressResolution]:
    parsed = _parse_road(address)
    if not parsed:
        return None
    row = (
        await db.execute(
            text(
                "SELECT b.building_mgt_no, b.road_code, COALESCE(b.road_name, r.road_name) AS road_name, "
                "       b.road_address, b.building_name, b.legal_emd, b.building_main_no, "
                "       b.building_sub_no, COALESCE(a.underground_yn, '0') AS underground_yn "
                "FROM nexus_address.buildings b "
                "LEFT JOIN nexus_address.road_codes r ON b.road_code = r.road_code "
                "LEFT JOIN nexus_address.addresses a ON a.road_code = b.road_code "
                " AND a.building_main_no = b.building_main_no "
                " AND a.building_sub_no = b.building_sub_no "
                "WHERE COALESCE(b.road_name, r.road_name) = :road_name "
                "  AND b.building_main_no = :main_no "
                "  AND b.building_sub_no = :sub_no "
                "ORDER BY b.id LIMIT 1"
            ),
            parsed,
        )
    ).first()
    if row:
        return _from_building_row(address, row)

    fallback = (
        await db.execute(
            text(
                "SELECT b.building_mgt_no, b.road_code, COALESCE(b.road_name, r.road_name) AS road_name, "
                "       b.road_address, b.building_name, b.legal_emd, b.building_main_no, "
                "       b.building_sub_no, '0' AS underground_yn "
                "FROM nexus_address.buildings b "
                "LEFT JOIN nexus_address.road_codes r ON b.road_code = r.road_code "
                "WHERE COALESCE(b.road_name, r.road_name) = :road_name "
                "  AND b.building_main_no = :main_no "
                "ORDER BY ABS(b.building_sub_no - :sub_no), b.id LIMIT 1"
            ),
            parsed,
        )
    ).first()
    if fallback:
        result = _from_building_row(address, fallback)
        result.match_status = "needs_review"
        result.match_score = 0.82
        result.match_message = "건물 본번은 일치하지만 부번은 근사값으로 매칭했습니다."
        return result
    return None


async def _resolve_by_jibun(address: str, db: AsyncSession) -> Optional[AddressResolution]:
    parsed = _parse_jibun(address)
    if not parsed:
        return None
    row = (
        await db.execute(
            text(
                "SELECT legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no, road_address "
                "FROM nexus_address.jibun_addresses "
                "WHERE legal_emd = :dong "
                "  AND jibun_san_yn = :san "
                "  AND jibun_main_no = :main_no "
                "  AND jibun_sub_no = :sub_no "
                "ORDER BY id LIMIT 1"
            ),
            parsed,
        )
    ).first()
    if not row and parsed["sub_no"] > 0:
        row = (
            await db.execute(
                text(
                    "SELECT legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no, road_address "
                    "FROM nexus_address.jibun_addresses "
                    "WHERE legal_emd = :dong "
                    "  AND jibun_san_yn = :san "
                    "  AND jibun_main_no = :main_no "
                    "ORDER BY jibun_sub_no LIMIT 1"
                ),
                parsed,
            )
        ).first()
    if not row:
        return None

    san_text = "산 " if row.jibun_san_yn == "1" else ""
    sub_text = f"-{row.jibun_sub_no}" if row.jibun_sub_no else ""
    jibun = f"{GWANGJU_PREFIX} {row.legal_emd} {san_text}{row.jibun_main_no}{sub_text}"
    return AddressResolution(
        raw_address=address,
        standard_road_address=row.road_address,
        jibun_address=jibun,
        legal_emd=row.legal_emd,
        match_status="matched" if row.road_address else "needs_review",
        match_score=0.92 if row.road_address else 0.78,
        match_source="nexus_jibun",
        coord_source=None,
    )


async def _resolve_by_similarity(address: str, db: AsyncSession) -> Optional[AddressResolution]:
    key = normalize_address_key(_strip_gwangju_prefix(address))
    if len(key) < 4:
        return None
    row = (
        await db.execute(
            text(
                "SELECT building_mgt_no, road_code, road_name, road_address, building_name, legal_emd, "
                "       building_main_no, building_sub_no, '0' AS underground_yn, "
                "       word_similarity(:key, full_key) AS score "
                "FROM nexus_address.buildings "
                "WHERE full_key ILIKE '%' || :key || '%' OR word_similarity(:key, full_key) > 0.35 "
                "ORDER BY score DESC NULLS LAST, id LIMIT 1"
            ),
            {"key": key},
        )
    ).first()
    if not row:
        return None
    result = _from_building_row(address, row)
    score = float(row.score or 0.7)
    result.match_score = min(0.9, max(0.7, score))
    result.match_status = "matched" if result.match_score >= 0.86 else "needs_review"
    result.match_message = "정규화 문자열 유사도로 매칭했습니다."
    return result


async def _resolve_from_cache(address: str, db: AsyncSession) -> Optional[AddressResolution]:
    key = normalize_address_key(address)
    row = (
        await db.execute(
            text(
                "SELECT id, road_address, jibun_address, dong_name, lat, lng, source, "
                "       adm_cd, rn_mgt_sn, bd_mgt_sn, udrt_yn, buld_mnnm, buld_slno, "
                "       match_status, match_score, match_message "
                "FROM address_cache "
                "WHERE normalized_query = :key "
                "   OR replace(lower(road_address), ' ', '') ILIKE '%' || :key || '%' "
                "ORDER BY hit_count DESC, id DESC LIMIT 1"
            ),
            {"key": key},
        )
    ).first()
    if not row:
        return None
    await db.execute(
        text("UPDATE address_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = :id"),
        {"id": row.id},
    )
    return AddressResolution(
        raw_address=address,
        standard_road_address=row.road_address,
        jibun_address=row.jibun_address,
        legal_emd=row.dong_name,
        service_dong=row.dong_name if row.dong_name in SERVICE_DONGS else None,
        lat=row.lat,
        lng=row.lng,
        coord_source=row.source or "cache",
        adm_cd=row.adm_cd,
        rn_mgt_sn=row.rn_mgt_sn,
        bd_mgt_sn=row.bd_mgt_sn,
        udrt_yn=row.udrt_yn,
        buld_mnnm=row.buld_mnnm,
        buld_slno=row.buld_slno,
        match_status=row.match_status or "matched",
        match_score=row.match_score or 0.75,
        match_source="cache",
        match_message=row.match_message,
    )


async def _apply_kakao_coordinates(result: AddressResolution) -> None:
    if result.lat and result.lng:
        return
    query = result.standard_road_address or result.raw_address
    kakao = await get_kakao_coordinates(query)
    if not kakao:
        return
    result.lat = kakao.get("lat")
    result.lng = kakao.get("lng")
    result.coord_source = "kakao"
    if not result.legal_emd and kakao.get("dong_name"):
        result.legal_emd = kakao["dong_name"]


async def _save_cache(result: AddressResolution, db: AsyncSession) -> None:
    road = result.standard_road_address or result.raw_address
    if not road:
        return
    await db.execute(
        text(
            "INSERT INTO address_cache "
            "(road_address, normalized_query, jibun_address, dong_name, lat, lng, source, "
            " adm_cd, rn_mgt_sn, bd_mgt_sn, udrt_yn, buld_mnnm, buld_slno, "
            " match_status, match_score, match_message, hit_count, last_used_at) "
            "VALUES "
            "(:road_address, :normalized_query, :jibun_address, :dong_name, :lat, :lng, :source, "
            " :adm_cd, :rn_mgt_sn, :bd_mgt_sn, :udrt_yn, :buld_mnnm, :buld_slno, "
            " :match_status, :match_score, :match_message, 1, NOW()) "
            "ON CONFLICT (road_address) DO UPDATE SET "
            " normalized_query = COALESCE(EXCLUDED.normalized_query, address_cache.normalized_query), "
            " jibun_address = COALESCE(EXCLUDED.jibun_address, address_cache.jibun_address), "
            " dong_name = COALESCE(EXCLUDED.dong_name, address_cache.dong_name), "
            " lat = COALESCE(EXCLUDED.lat, address_cache.lat), "
            " lng = COALESCE(EXCLUDED.lng, address_cache.lng), "
            " source = COALESCE(EXCLUDED.source, address_cache.source), "
            " adm_cd = COALESCE(EXCLUDED.adm_cd, address_cache.adm_cd), "
            " rn_mgt_sn = COALESCE(EXCLUDED.rn_mgt_sn, address_cache.rn_mgt_sn), "
            " bd_mgt_sn = COALESCE(EXCLUDED.bd_mgt_sn, address_cache.bd_mgt_sn), "
            " udrt_yn = COALESCE(EXCLUDED.udrt_yn, address_cache.udrt_yn), "
            " buld_mnnm = COALESCE(EXCLUDED.buld_mnnm, address_cache.buld_mnnm), "
            " buld_slno = COALESCE(EXCLUDED.buld_slno, address_cache.buld_slno), "
            " match_status = COALESCE(EXCLUDED.match_status, address_cache.match_status), "
            " match_score = COALESCE(EXCLUDED.match_score, address_cache.match_score), "
            " match_message = COALESCE(EXCLUDED.match_message, address_cache.match_message), "
            " hit_count = address_cache.hit_count + 1, "
            " last_used_at = NOW()"
        ),
        {
            "road_address": road,
            "normalized_query": normalize_address_key(result.raw_address),
            "jibun_address": result.jibun_address,
            "dong_name": result.legal_emd,
            "lat": result.lat,
            "lng": result.lng,
            "source": result.coord_source or result.match_source or "nexus",
            "adm_cd": result.adm_cd,
            "rn_mgt_sn": result.rn_mgt_sn,
            "bd_mgt_sn": result.bd_mgt_sn,
            "udrt_yn": result.udrt_yn,
            "buld_mnnm": result.buld_mnnm,
            "buld_slno": result.buld_slno,
            "match_status": result.match_status,
            "match_score": result.match_score,
            "match_message": result.match_message,
        },
    )


async def log_address_resolution(
    db: AsyncSession,
    result: AddressResolution,
    order_id: Optional[int] = None,
    corrected_by_id: Optional[int] = None,
) -> None:
    db.add(
        AddressResolutionLog(
            order_id=order_id,
            raw_input=result.raw_address,
            matched_road_address=result.standard_road_address,
            matched_legal_emd=result.legal_emd,
            matched_service_dong=result.service_dong,
            match_source=result.match_source,
            match_status=result.match_status,
            match_score=result.match_score,
            failure_reason=result.match_message if result.match_status in {"not_found", "needs_review"} else None,
            is_manual_corrected=bool(corrected_by_id),
            corrected_by_id=corrected_by_id,
        )
    )


async def resolve_address(address: str, db: AsyncSession, *, use_kakao: bool = True) -> AddressResolution:
    base_address, detail = _split_detail(address)
    raw_address = address.strip()
    result = await _find_override(raw_address, db)
    if not result:
        result = await _resolve_by_road(base_address, db)
    if not result:
        result = await _resolve_by_jibun(base_address, db)
    if not result:
        result = await _resolve_by_similarity(base_address, db)
    if not result:
        result = await _resolve_from_cache(base_address, db)
    if not result:
        result = AddressResolution(
            raw_address=raw_address,
            match_status="not_found",
            match_score=0.0,
            match_message="로컬 주소 DB와 캐시에서 일치 주소를 찾지 못했습니다.",
        )

    result.raw_address = raw_address
    result.detail_address = detail
    result.admin_emd = result.admin_emd or await _admin_emd_for_legal(result.legal_emd, db)
    result.service_dong = result.service_dong or await _service_dong_for_legal(result.legal_emd, db)
    if result.legal_emd and not result.service_dong:
        result.match_status = "needs_review"
        result.match_message = "서비스 배송동에 포함되지 않은 법정동입니다."

    if use_kakao:
        await _apply_kakao_coordinates(result)
    if result.lat and result.lng and not result.coord_source:
        result.coord_source = "cache"
    if result.match_status == "matched" and (not result.lat or not result.lng):
        result.match_status = "needs_review"
        result.match_message = result.match_message or "주소는 매칭됐지만 지도 좌표가 없어 확인이 필요합니다."

    await _save_cache(result, db)
    return result


def apply_resolution_to_order(order, result: AddressResolution, *, fallback_dong: Optional[str] = None) -> None:
    order.raw_address = result.raw_address
    order.standard_road_address = result.standard_road_address
    order.jibun_address = result.jibun_address
    order.detail_address = result.detail_address
    order.legal_emd = result.legal_emd
    order.admin_emd = result.admin_emd
    order.service_dong = result.service_dong or fallback_dong
    order.adm_cd = result.adm_cd
    order.rn_mgt_sn = result.rn_mgt_sn
    order.bd_mgt_sn = result.bd_mgt_sn
    order.udrt_yn = result.udrt_yn
    order.buld_mnnm = result.buld_mnnm
    order.buld_slno = result.buld_slno
    order.match_status = result.match_status
    order.match_score = result.match_score
    order.coord_source = result.coord_source
    order.address_verified_at = datetime.now(timezone.utc)
    if result.lat and result.lng:
        order.lat = result.lat
        order.lng = result.lng
    if result.service_dong:
        order.dong = result.service_dong
