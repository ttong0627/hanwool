"""
경기도 광주시 주소 검색 서비스
- 로컬 nexus_address DB 우선 검색 → Kakao API 폴백
- 지원: 도로명 주소, 지번 주소, 행정동→법정동 자동 변환
- dong_name(법정 읍면동) 반환이 주목적
"""
import re
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.route_service import get_kakao_coordinates

_ROAD_SUFFIXES = ("대로", "로", "길")


def _normalize_key(value: str) -> str:
    """road_key/full_key와 동일한 정규화"""
    if not value:
        return ""
    s = value.strip().lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[,\[\]{}]", " ", s)
    s = re.sub(r"\s+", "", s)
    return s


def _parse_road(value: str) -> Optional[dict]:
    """도로명 + 건물번호 파싱. "광주대로 123-4" → {road_name, main_no, sub_no, underground}"""
    if not value:
        return None
    underground = "1" if "지하" in value else "0"
    for suffix in _ROAD_SUFFIXES:
        m = re.search(rf"(\S+{suffix})\s*(\d+)(?:-(\d+))?", value)
        if m:
            return {
                "road_name": m.group(1),
                "main_no": int(m.group(2)),
                "sub_no": int(m.group(3)) if m.group(3) else 0,
                "underground": underground,
            }
    return None


def _parse_jibun(value: str) -> Optional[dict]:
    """
    지번 주소 파싱.
    "경안동 134", "탄벌동 산45-2", "경안1동 200" → {dong, san, main_no, sub_no}
    """
    if not value:
        return None
    # 동/읍/면/리 이름 + 산(선택) + 본번[-부번]
    m = re.search(
        r"([가-힣]+[동면읍리])\s*(산\s*)?(\d+)(?:[–\-](\d+))?",
        value
    )
    if m:
        return {
            "dong": m.group(1),
            "san": "1" if m.group(2) else "0",
            "main_no": int(m.group(3)),
            "sub_no": int(m.group(4)) if m.group(4) else 0,
        }
    return None


# ──────────────────────────────────────────────
# DB 검색 함수들
# ──────────────────────────────────────────────

async def _resolve_admin_to_legal(admin_dong: str, db: AsyncSession) -> Optional[str]:
    """행정동 이름 → 법정동 이름 변환 (admin_dong_map 테이블 사용)"""
    try:
        result = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.admin_dong_map "
                "WHERE admin_emd = :d LIMIT 1"
            ),
            {"d": admin_dong},
        )
        row = result.first()
        return row[0] if row else None
    except Exception:
        return None


async def _search_by_road_number(address: str, db: AsyncSession) -> Optional[str]:
    """도로명코드 → 주소 정확 조회 → legal_emd 반환"""
    parsed = _parse_road(address)
    if not parsed:
        return None

    try:
        rc_result = await db.execute(
            text(
                "SELECT road_code FROM nexus_address.road_codes "
                "WHERE road_name = :rn LIMIT 10"
            ),
            {"rn": parsed["road_name"]},
        )
        road_codes = [row[0] for row in rc_result.all()]
        if not road_codes:
            return None

        # 정확 번지 매칭
        exact = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.addresses "
                "WHERE road_code = ANY(:codes) "
                "  AND building_main_no = :main "
                "  AND building_sub_no = :sub "
                "  AND underground_yn = :ug "
                "LIMIT 1"
            ),
            {
                "codes": road_codes,
                "main": parsed["main_no"],
                "sub": parsed["sub_no"],
                "ug": parsed["underground"],
            },
        )
        row = exact.first()
        if row and row[0]:
            return row[0]

        # 번지 근사 매칭 (같은 도로에서 가장 가까운 번지)
        fallback = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.addresses "
                "WHERE road_code = ANY(:codes) "
                "  AND legal_emd IS NOT NULL "
                "ORDER BY ABS(building_main_no - :main) "
                "LIMIT 1"
            ),
            {"codes": road_codes, "main": parsed["main_no"]},
        )
        row = fallback.first()
        return row[0] if row and row[0] else None
    except Exception:
        return None


async def _search_by_jibun(address: str, db: AsyncSession) -> Optional[str]:
    """
    지번 주소 파싱 → (행정동→법정동 변환) → jibun_addresses 조회 → legal_emd 반환
    """
    parsed = _parse_jibun(address)
    if not parsed:
        return None

    dong_input = parsed["dong"]

    # 행정동이면 법정동으로 변환
    legal_dong = await _resolve_admin_to_legal(dong_input, db)
    search_dong = legal_dong or dong_input

    try:
        result = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.jibun_addresses "
                "WHERE legal_emd = :dong "
                "  AND jibun_main_no = :main "
                "  AND jibun_sub_no = :sub "
                "  AND jibun_san_yn = :san "
                "LIMIT 1"
            ),
            {
                "dong": search_dong,
                "main": parsed["main_no"],
                "sub": parsed["sub_no"],
                "san": parsed["san"],
            },
        )
        row = result.first()
        if row and row[0]:
            return row[0]

        # sub_no 없이 main_no만으로 재시도
        if parsed["sub_no"] > 0:
            result2 = await db.execute(
                text(
                    "SELECT legal_emd FROM nexus_address.jibun_addresses "
                    "WHERE legal_emd = :dong "
                    "  AND jibun_main_no = :main "
                    "  AND jibun_san_yn = :san "
                    "LIMIT 1"
                ),
                {"dong": search_dong, "main": parsed["main_no"], "san": parsed["san"]},
            )
            row2 = result2.first()
            if row2 and row2[0]:
                return row2[0]

        # legal_emd LIKE (부분 이름 매칭: "경안동" → "경기도광주시경안동" 등 처리)
        result3 = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.jibun_addresses "
                "WHERE legal_emd LIKE :dong_pat "
                "  AND jibun_main_no = :main "
                "  AND jibun_san_yn = :san "
                "LIMIT 1"
            ),
            {
                "dong_pat": f"%{search_dong}%",
                "main": parsed["main_no"],
                "san": parsed["san"],
            },
        )
        row3 = result3.first()
        return row3[0] if row3 and row3[0] else None
    except Exception:
        return None


async def _search_by_key_similarity(address: str, db: AsyncSession) -> Optional[str]:
    """road_key LIKE 또는 pg_trgm word_similarity로 주소 유사도 검색"""
    key = _normalize_key(address)
    if len(key) < 3:
        return None

    try:
        result = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.addresses "
                "WHERE road_key LIKE '%' || :k || '%' "
                "  AND legal_emd IS NOT NULL "
                "LIMIT 1"
            ),
            {"k": key},
        )
        row = result.first()
        if row and row[0]:
            return row[0]

        result2 = await db.execute(
            text(
                "SELECT legal_emd, word_similarity(:k, road_key) AS sim "
                "FROM nexus_address.addresses "
                "WHERE word_similarity(:k, road_key) > 0.35 "
                "  AND legal_emd IS NOT NULL "
                "ORDER BY sim DESC "
                "LIMIT 1"
            ),
            {"k": key},
        )
        row = result2.first()
        return row[0] if row and row[0] else None
    except Exception:
        return None


async def _search_building_name(address: str, db: AsyncSession) -> Optional[str]:
    """건물명으로 법정동 검색 (롯데마트, 아파트 등)"""
    key = _normalize_key(address)
    if len(key) < 2:
        return None

    try:
        result = await db.execute(
            text(
                "SELECT legal_emd FROM nexus_address.buildings "
                "WHERE building_name_key LIKE '%' || :k || '%' "
                "  AND legal_emd IS NOT NULL "
                "LIMIT 1"
            ),
            {"k": key},
        )
        row = result.first()
        return row[0] if row and row[0] else None
    except Exception:
        return None


# ──────────────────────────────────────────────
# 공개 API
# ──────────────────────────────────────────────

async def search_local_address(address: str, db: AsyncSession) -> Optional[str]:
    """
    로컬 nexus_address DB에서 법정동(legal_emd) 조회.
    우선순위:
      1. 도로명+건물번호 정확 매칭 (addresses)
      2. 지번 주소 매칭 (jibun_addresses) + 행정동→법정동 변환
      3. road_key LIKE / pg_trgm 유사도 (addresses)
      4. 건물명 키워드 (buildings)
    """
    dong = await _search_by_road_number(address, db)
    if dong:
        return dong

    dong = await _search_by_jibun(address, db)
    if dong:
        return dong

    dong = await _search_by_key_similarity(address, db)
    if dong:
        return dong

    return await _search_building_name(address, db)


async def geocode_address(
    address: str,
    db: Optional[AsyncSession] = None,
) -> Optional[dict]:
    """
    주소 → 좌표+동 변환.
    - 로컬 DB로 dong_name 먼저 결정 (정확도 우선)
    - Kakao API로 lat/lng 취득
    - 로컬 DB dong이 있으면 Kakao dong을 덮어씀
    """
    local_dong: Optional[str] = None
    if db is not None:
        try:
            local_dong = await search_local_address(address, db)
        except Exception:
            local_dong = None

    kakao_result = await get_kakao_coordinates(address)

    if kakao_result:
        if local_dong:
            kakao_result["dong_name"] = local_dong
        return kakao_result

    if local_dong:
        return {
            "lat": None,
            "lng": None,
            "address_name": address,
            "dong_name": local_dong,
        }

    return None
