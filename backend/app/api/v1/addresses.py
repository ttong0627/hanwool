"""
주소 검색 API — nexus_address 로컬 DB → address_cache → Kakao API 순서

## 검색 전략 (속도 순)

1a. road_codes → buildings btree JOIN  (road_code+main_no 복합 인덱스, 최고속)
1b. road_codes → addresses btree JOIN  (동일 전략, addresses 보완)
2.  buildings full_key GIN 트라이그램  (공백 제거 후 ILIKE, 인덱스 사용)
3.  buildings building_name_key GIN    (건물명 직접 검색)
4.  jibun_addresses 지번 패턴 매칭
5.  address_cache  (이전 Kakao 검색 결과)
    Kakao API → 결과를 address_cache에 upsert

## 행안부 도로명주소 규격
- road_key   : 공백 제거 전체 주소 소문자  ex) 경기도광주시중앙로145번길22
- full_key   : road_key + 건물명 + 법정동   ex) 경기도광주시중앙로145번길22신원플러스타운경안동
- road_code  : 12자리 행정구역 코드          ex) 416104433419
- building_main_no / building_sub_no : 건물번호 정수
"""
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/addresses", tags=["주소"])

_GWANGJU_RECT = "127.10,37.30,127.60,37.65"
_PREFIX = "경기도 광주시 "

# 4개 배송 동 road_code prefix (경기도 광주시 행정동)
_DELIVERY_DONG_EMD = {"경안동", "송정동", "쌍령동", "탄벌동"}


# ─────────────────────────────────────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────────────────────────────────────

def _normalize(q: str) -> str:
    """공백·특수문자 제거 후 소문자 — full_key/road_key 검색용"""
    return re.sub(r"[\s\-–]", "", q.lower())


def _strip_prefix(q: str) -> str:
    """'경기도 광주시' 접두 제거"""
    q = q.strip()
    for pfx in ("경기도 광주시 ", "경기도 광주시", "경기도 ", "경기도", "경기 ", "경기"):
        if q.startswith(pfx):
            q = q[len(pfx):].strip()
    return q


def _parse_road_address(query: str) -> Optional[dict]:
    """
    도로명주소 파싱 → road_name + building_main_no

    "중앙로145번길 22"   → {road: "중앙로145번길", main: 22, sub: None}
    "중앙로145번길 3-14" → {road: "중앙로145번길", main:  3, sub: 14}
    "중앙로145번길"      → None  (건물번호 없음 → 도로 전체 조회)
    """
    m = re.match(r'^(.+?)\s+(\d+)(?:-(\d+))?$', query.strip())
    if not m:
        return None
    return {
        "road": m.group(1).strip(),
        "main": int(m.group(2)),
        "sub":  int(m.group(3)) if m.group(3) else None,
    }


def _make_result(
    road_address: str,
    legal_emd: Optional[str],
    building_name: Optional[str] = None,
    jibun_address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> dict:
    display = f"{road_address} ({building_name})" if building_name else road_address
    return {
        "address_name":  display,
        "road_address":  display,
        "jibun_address": jibun_address,
        "dong_name":     legal_emd,
        "lat":           lat,
        "lng":           lng,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 로컬 DB 검색
# ─────────────────────────────────────────────────────────────────────────────

async def _search_local(query: str, db: AsyncSession, limit: int) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    def add(r: dict) -> None:
        k = r["address_name"]
        if k and k not in seen:
            seen.add(k)
            results.append(r)

    clean = _strip_prefix(query)
    parsed = _parse_road_address(clean)
    norm = _normalize(clean)          # 공백 제거 — GIN full_key 검색용

    # ── 1a. road_codes JOIN buildings (btree, 최고속) ─────────────────────────
    if parsed:
        sub_clause = "AND b.building_sub_no = :sub " if parsed["sub"] is not None else ""
        params: dict = {
            "road": parsed["road"],
            "main": parsed["main"],
            "lim":  limit * 2,
        }
        if parsed["sub"] is not None:
            params["sub"] = parsed["sub"]
        try:
            rows = await db.execute(
                text(
                    "SELECT b.road_address, b.legal_emd, b.building_name "
                    "FROM nexus_address.buildings b "
                    "JOIN nexus_address.road_codes r ON b.road_code = r.road_code "
                    "WHERE r.road_name = :road "
                    "  AND b.building_main_no = :main "
                    f"  {sub_clause}"
                    "ORDER BY b.building_sub_no LIMIT :lim"
                ),
                params,
            )
            for r in rows.all():
                add(_make_result(r[0], r[1], r[2]))
        except Exception:
            pass

    if len(results) >= limit:
        return results[:limit]

    # ── 1b. road_codes JOIN addresses (보완, 동일 전략) ───────────────────────
    if parsed:
        sub_clause = "AND a.building_sub_no = :sub " if parsed["sub"] is not None else ""
        params = {
            "road": parsed["road"],
            "main": parsed["main"],
            "lim":  (limit - len(results)) * 2,
        }
        if parsed["sub"] is not None:
            params["sub"] = parsed["sub"]
        try:
            rows = await db.execute(
                text(
                    "SELECT a.road_address, a.legal_emd, a.building_name "
                    "FROM nexus_address.addresses a "
                    "JOIN nexus_address.road_codes r ON a.road_code = r.road_code "
                    "WHERE r.road_name = :road "
                    "  AND a.building_main_no = :main "
                    f"  {sub_clause}"
                    "  AND a.road_address != '' "
                    "ORDER BY a.building_sub_no LIMIT :lim"
                ),
                params,
            )
            for r in rows.all():
                add(_make_result(r[0], r[1], r[2]))
        except Exception:
            pass

    if len(results) >= limit:
        return results[:limit]

    # ── 2. buildings full_key GIN 트라이그램 ─────────────────────────────────
    # full_key = "경기도광주시중앙로145번길22신원플러스타운경안동" (공백 없음)
    # GIN trigram 인덱스 활용 → ILIKE '%norm%' 가능
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, legal_emd, building_name "
                "FROM nexus_address.buildings "
                "WHERE full_key ILIKE :pat "
                "ORDER BY "
                "  word_similarity(:norm, full_key) DESC, "
                "  building_main_no, building_sub_no "
                "LIMIT :lim"
            ),
            {"pat": f"%{norm}%", "norm": norm, "lim": (limit - len(results)) * 3},
        )
        for r in rows.all():
            add(_make_result(r[0], r[1], r[2]))
    except Exception:
        pass

    if len(results) >= limit:
        return results[:limit]

    # ── 3. buildings building_name_key GIN ───────────────────────────────────
    name_norm = _normalize(clean)
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, legal_emd, building_name "
                "FROM nexus_address.buildings "
                "WHERE building_name_key ILIKE :pat "
                "ORDER BY building_main_no, building_sub_no "
                "LIMIT :lim"
            ),
            {"pat": f"%{name_norm}%", "lim": (limit - len(results)) * 2},
        )
        for r in rows.all():
            add(_make_result(r[0], r[1], r[2]))
    except Exception:
        pass

    if len(results) >= limit:
        return results[:limit]

    # ── 4. jibun_addresses 지번 패턴 매칭 ────────────────────────────────────
    m_jibun = re.search(r"([가-힣]+[동면읍리])\s*(산\s*)?(\d+)(?:[-–](\d+))?", clean)
    if m_jibun:
        dong    = m_jibun.group(1)
        san     = "1" if m_jibun.group(2) else "0"
        main_no = int(m_jibun.group(3))
        try:
            rows = await db.execute(
                text(
                    "SELECT legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no, road_address "
                    "FROM nexus_address.jibun_addresses "
                    "WHERE legal_emd LIKE :dpat "
                    "  AND jibun_main_no = :main "
                    "  AND jibun_san_yn  = :san "
                    "ORDER BY jibun_sub_no LIMIT :lim"
                ),
                {"dpat": f"%{dong}%", "main": main_no, "san": san,
                 "lim": limit - len(results)},
            )
            for r in rows.all():
                emd, san_yn, main, sub, road_addr = r
                san_str = "산" if san_yn == "1" else ""
                sub_str = f"-{sub}" if sub > 0 else ""
                jibun = f"{_PREFIX}{emd} {san_str}{main}{sub_str}"
                road  = road_addr or ""
                add(_make_result(road or jibun, emd, None, jibun if road else None))
        except Exception:
            pass

    return results[:limit]


# ─────────────────────────────────────────────────────────────────────────────
# address_cache 검색 (이전 Kakao 결과)
# ─────────────────────────────────────────────────────────────────────────────

async def _search_cache(query: str, db: AsyncSession, limit: int) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    norm = _normalize(query.strip())
    pat  = f"%{norm}%"
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, jibun_address, building_name, dong_name, lat, lng "
                "FROM address_cache "
                "WHERE replace(lower(road_address),' ','') ILIKE :pat "
                "   OR replace(lower(building_name),' ','') ILIKE :pat "
                "   OR replace(lower(jibun_address),' ','') ILIKE :pat "
                "ORDER BY "
                "  CASE WHEN replace(lower(road_address),' ','') ILIKE :exact THEN 0 ELSE 1 END, "
                "  road_address "
                "LIMIT :lim"
            ),
            {"pat": pat, "exact": norm, "lim": limit},
        )
        for r in rows.all():
            road, jibun, bname, dong, lat, lng = r
            display = f"{road} ({bname})" if bname else road
            if display and display not in seen:
                seen.add(display)
                results.append({
                    "address_name":  display,
                    "road_address":  display,
                    "jibun_address": jibun,
                    "dong_name":     dong,
                    "lat":           lat,
                    "lng":           lng,
                })
    except Exception:
        pass
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Kakao API + 캐시 저장
# ─────────────────────────────────────────────────────────────────────────────

async def _save_to_cache(results: list[dict], db: AsyncSession) -> None:
    """Kakao 결과를 address_cache에 upsert (road_address 기준)"""
    for r in results:
        road = r.get("road_address") or r.get("address_name") or ""
        # display에서 건물명 괄호 분리
        bname: Optional[str] = None
        m = re.search(r'\(([^)]+)\)$', road)
        if m:
            bname = m.group(1)
            road  = road[:m.start()].strip()
        if not road:
            continue
        try:
            await db.execute(
                text(
                    "INSERT INTO address_cache "
                    "  (road_address, jibun_address, building_name, dong_name, lat, lng, source) "
                    "VALUES (:road, :jibun, :bname, :dong, :lat, :lng, 'kakao') "
                    "ON CONFLICT (road_address) DO UPDATE SET "
                    "  jibun_address = EXCLUDED.jibun_address, "
                    "  building_name = COALESCE(EXCLUDED.building_name, address_cache.building_name), "
                    "  dong_name     = COALESCE(EXCLUDED.dong_name,     address_cache.dong_name), "
                    "  lat           = COALESCE(EXCLUDED.lat,           address_cache.lat), "
                    "  lng           = COALESCE(EXCLUDED.lng,           address_cache.lng)"
                ),
                {
                    "road":  road,
                    "jibun": r.get("jibun_address"),
                    "bname": bname,
                    "dong":  r.get("dong_name"),
                    "lat":   r.get("lat"),
                    "lng":   r.get("lng"),
                },
            )
        except Exception:
            pass


async def _search_kakao(query: str, limit: int) -> list[dict]:
    """Kakao API — 로컬 DB + 캐시에 없을 때만 호출"""
    if not settings.KAKAO_REST_API_KEY:
        return []
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    results: list[dict] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=5.0) as client:
        for q in [query, f"경기도 광주시 {query}"]:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/address.json",
                    params={"query": q, "size": limit},
                    headers=headers,
                )
                if resp.status_code != 200:
                    continue
                for d in resp.json().get("documents", []):
                    addr_obj = d.get("address") or {}
                    road_obj = d.get("road_address") or {}
                    sg = (
                        addr_obj.get("region_2depth_name", "")
                        or road_obj.get("region_2depth_name", "")
                    )
                    if sg and "광주" not in sg:
                        continue
                    dong  = road_obj.get("region_3depth_name") or addr_obj.get("region_3depth_name")
                    road  = road_obj.get("address_name")
                    jibun = addr_obj.get("address_name")
                    name  = road or jibun or d.get("address_name", "")
                    if name and name not in seen:
                        seen.add(name)
                        results.append({
                            "address_name":  name,
                            "road_address":  road,
                            "jibun_address": jibun,
                            "dong_name":     dong,
                            "lat":           float(d["y"]) if d.get("y") else None,
                            "lng":           float(d["x"]) if d.get("x") else None,
                        })
                if results:
                    break
            except Exception:
                pass

        if not results:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/keyword.json",
                    params={
                        "query": f"경기 광주 {query}",
                        "rect":  _GWANGJU_RECT,
                        "size":  limit,
                    },
                    headers=headers,
                )
                if resp.status_code == 200:
                    for d in resp.json().get("documents", []):
                        road  = d.get("road_address_name") or ""
                        jibun = d.get("address_name") or ""
                        name  = road or jibun
                        if not name or name in seen:
                            continue
                        m = re.search(r"([가-힣]+[동면읍리])", jibun)
                        dong = m.group(1) if m else None
                        seen.add(name)
                        results.append({
                            "address_name":  name,
                            "road_address":  road or None,
                            "jibun_address": jibun or None,
                            "dong_name":     dong,
                            "lat":           float(d["y"]) if d.get("y") else None,
                            "lng":           float(d["x"]) if d.get("x") else None,
                        })
            except Exception:
                pass

    return results[:limit]


# ─────────────────────────────────────────────────────────────────────────────
# 엔드포인트
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/search")
async def search_addresses(
    query: str = Query(..., min_length=2, description="검색할 주소 (2자 이상)"),
    limit: int = Query(5, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    주소 검색
    1. nexus_address 로컬 DB (행안부 전국 주소)
    2. address_cache (누적 Kakao 결과)
    3. Kakao API → 결과 캐시 저장
    """
    results = await _search_local(query, db, limit)
    if results:
        return results[:limit]

    results = await _search_cache(query, db, limit)
    if results:
        return results[:limit]

    results = await _search_kakao(query, limit)
    if results:
        await _save_to_cache(results, db)

    return results[:limit]
