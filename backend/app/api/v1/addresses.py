"""
주소 검색 API — nexus_address 로컬 DB → address_cache → Kakao API 순서

검색 전략 (순서):
  1a. addresses: road_name + building_main_no 정확 매칭
  1b. buildings: road_name + building_main_no 정확 매칭
  2.  addresses: road_name ILIKE (같은 도로 주소 제안)
  3.  buildings: 건물명 ILIKE or road_name ILIKE
  4.  jibun_addresses: 지번 주소 패턴 매칭
  5.  pg_trgm: road_key 유사도 폴백
  6.  address_cache: 이전 Kakao 검색 결과 캐시
  Kakao API: 캐시에도 없을 때만 — 결과는 캐시에 저장
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

_PREFIX = "경기도 광주시 "
_GWANGJU_RECT = "127.10,37.30,127.60,37.65"


def _row_to_result(
    road_address: str,
    legal_emd: Optional[str],
    building_name: Optional[str] = None,
    jibun_address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> dict:
    """DB 행 → 응답 딕셔너리"""
    display = road_address
    if building_name:
        display = f"{road_address} ({building_name})"
    return {
        "address_name": display,
        "road_address": display,
        "jibun_address": jibun_address,
        "dong_name": legal_emd,
        "lat": lat,
        "lng": lng,
    }


def _parse_road_address(query: str) -> Optional[dict]:
    """
    도로명주소를 도로명 + 건물번호로 파싱.
    "중앙로145번길 22"    → {road: "중앙로145번길", main: 22, sub: None}
    "중앙로145번길 3-14"  → {road: "중앙로145번길", main: 3,  sub: 14}
    "중앙로145번길"       → None (건물번호 없음)
    """
    m = re.match(r'^(.+?)\s+(\d+)(?:-(\d+))?$', query.strip())
    if not m:
        return None
    road = m.group(1).strip()
    main_no = int(m.group(2))
    sub_no = int(m.group(3)) if m.group(3) else None
    return {"road": road, "main": main_no, "sub": sub_no}


async def _search_local(query: str, db: AsyncSession, limit: int) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    def add(row: dict) -> None:
        key = row["address_name"]
        if key and key not in seen:
            seen.add(key)
            results.append(row)

    q = query.strip()
    q_clean = q.replace("경기도 광주시", "").replace("경기도", "").replace("경기", "").strip()
    search_q = q_clean if q_clean else q

    parsed = _parse_road_address(search_q)
    road_q = parsed["road"] if parsed else search_q

    # ── 1a. addresses: road_name + building_main_no 정확 매칭 ─────────────────
    if parsed:
        try:
            sub_clause = "AND building_sub_no = :sub " if parsed["sub"] is not None else ""
            rows = await db.execute(
                text(
                    "SELECT road_address, legal_emd, building_name "
                    "FROM nexus_address.addresses "
                    "WHERE road_name ILIKE :road "
                    "  AND building_main_no = :main "
                    f"  {sub_clause}"
                    "  AND road_address != '' "
                    "ORDER BY building_sub_no "
                    "LIMIT :lim"
                ),
                {
                    "road": f"%{parsed['road']}%",
                    "main": parsed["main"],
                    **({"sub": parsed["sub"]} if parsed["sub"] is not None else {}),
                    "lim": limit * 2,
                },
            )
            for r in rows.all():
                add(_row_to_result(r[0], r[1], r[2]))
        except Exception:
            pass

    if len(results) >= limit:
        return results[:limit]

    # ── 1b. buildings: road_name + building_main_no 정확 매칭 ────────────────
    if parsed:
        remaining = limit - len(results)
        try:
            sub_clause = "AND building_sub_no = :sub " if parsed["sub"] is not None else ""
            rows = await db.execute(
                text(
                    "SELECT road_address, legal_emd, building_name "
                    "FROM nexus_address.buildings "
                    "WHERE road_name ILIKE :road "
                    "  AND building_main_no = :main "
                    f"  {sub_clause}"
                    "  AND road_address != '' "
                    "ORDER BY building_sub_no "
                    "LIMIT :lim"
                ),
                {
                    "road": f"%{parsed['road']}%",
                    "main": parsed["main"],
                    **({"sub": parsed["sub"]} if parsed["sub"] is not None else {}),
                    "lim": remaining * 2,
                },
            )
            for r in rows.all():
                add(_row_to_result(r[0], r[1], r[2]))
        except Exception:
            pass

    if len(results) >= limit:
        return results[:limit]

    # ── 2. addresses: road_name ILIKE (같은 도로의 주소 제안) ─────────────────
    remaining = limit - len(results)
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, legal_emd, building_name "
                "FROM nexus_address.addresses "
                "WHERE road_name ILIKE :road "
                "  AND road_address != '' "
                "ORDER BY building_main_no, building_sub_no "
                "LIMIT :lim"
            ),
            {"road": f"%{road_q}%", "lim": remaining * 2},
        )
        for r in rows.all():
            add(_row_to_result(r[0], r[1], r[2]))
    except Exception:
        pass

    if len(results) >= limit:
        return results[:limit]

    # ── 3. buildings: 건물명 ILIKE 또는 road_name ILIKE ───────────────────────
    remaining = limit - len(results)
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, legal_emd, building_name "
                "FROM nexus_address.buildings "
                "WHERE (building_name ILIKE :name_pat OR road_name ILIKE :road) "
                "  AND road_address != '' "
                "ORDER BY "
                "  CASE WHEN building_name ILIKE :name_pat THEN 0 ELSE 1 END, "
                "  building_main_no, building_sub_no "
                "LIMIT :lim"
            ),
            {"name_pat": f"%{search_q}%", "road": f"%{road_q}%", "lim": remaining * 2},
        )
        for r in rows.all():
            add(_row_to_result(r[0], r[1], r[2]))
    except Exception:
        pass

    if len(results) >= limit:
        return results[:limit]

    # ── 4. jibun_addresses: 지번 주소 패턴 매칭 ─────────────────────────────
    remaining = limit - len(results)
    m_jibun = re.search(r"([가-힣]+[동면읍리])\s*(산\s*)?(\d+)(?:[-–](\d+))?", search_q)
    if m_jibun:
        dong = m_jibun.group(1)
        san = "1" if m_jibun.group(2) else "0"
        main_no = int(m_jibun.group(3))
        try:
            rows = await db.execute(
                text(
                    "SELECT legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no, road_address "
                    "FROM nexus_address.jibun_addresses "
                    "WHERE legal_emd LIKE :dpat "
                    "  AND jibun_main_no = :main "
                    "  AND jibun_san_yn = :san "
                    "ORDER BY jibun_sub_no "
                    "LIMIT :lim"
                ),
                {"dpat": f"%{dong}%", "main": main_no, "san": san, "lim": remaining},
            )
            for r in rows.all():
                legal_emd, san_yn, main, sub, road_addr = r
                san_str = "산" if san_yn == "1" else ""
                sub_str = f"-{sub}" if sub > 0 else ""
                jibun = f"{_PREFIX}{legal_emd} {san_str}{main}{sub_str}"
                road = road_addr or ""
                add(_row_to_result(road or jibun, legal_emd, None, jibun if road else None))
        except Exception:
            pass

    if len(results) >= limit:
        return results[:limit]

    # ── 5. pg_trgm 유사도 폴백 (road_key) ────────────────────────────────────
    remaining = limit - len(results)
    if remaining > 0:
        norm = re.sub(r"\s+", "", search_q.lower())
        try:
            rows = await db.execute(
                text(
                    "SELECT road_address, legal_emd, building_name "
                    "FROM nexus_address.addresses "
                    "WHERE word_similarity(:k, road_key) > 0.3 "
                    "  AND road_address != '' "
                    "ORDER BY word_similarity(:k, road_key) DESC "
                    "LIMIT :lim"
                ),
                {"k": norm, "lim": remaining},
            )
            for r in rows.all():
                add(_row_to_result(r[0], r[1], r[2]))
        except Exception:
            pass

    return results[:limit]


async def _search_cache(query: str, db: AsyncSession, limit: int) -> list[dict]:
    """address_cache 테이블에서 이전 Kakao 검색 결과 조회"""
    results: list[dict] = []
    seen: set[str] = set()
    q = query.strip()
    pat = f"%{q}%"
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, jibun_address, building_name, dong_name, lat, lng "
                "FROM address_cache "
                "WHERE road_address ILIKE :pat "
                "   OR building_name ILIKE :pat "
                "   OR jibun_address ILIKE :pat "
                "ORDER BY "
                "  CASE WHEN road_address ILIKE :exact THEN 0 ELSE 1 END, "
                "  road_address "
                "LIMIT :lim"
            ),
            {"pat": pat, "exact": q, "lim": limit},
        )
        for r in rows.all():
            road, jibun, bname, dong, lat, lng = r
            display = f"{road} ({bname})" if bname else road
            key = display
            if key and key not in seen:
                seen.add(key)
                results.append({
                    "address_name": display,
                    "road_address": display,
                    "jibun_address": jibun,
                    "dong_name": dong,
                    "lat": lat,
                    "lng": lng,
                })
    except Exception:
        pass
    return results


async def _save_to_cache(results: list[dict], db: AsyncSession) -> None:
    """Kakao 검색 결과를 address_cache에 저장 (road_address 기준 upsert)"""
    for r in results:
        road = r.get("road_address") or r.get("address_name")
        if not road:
            continue
        # building_name 추출 (display에서 괄호 제거)
        bname = None
        m = re.search(r'\(([^)]+)\)$', road)
        if m:
            bname = m.group(1)
            road = road[:m.start()].strip()

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
                    "bname": bname or None,
                    "dong":  r.get("dong_name"),
                    "lat":   r.get("lat"),
                    "lng":   r.get("lng"),
                },
            )
        except Exception:
            pass


async def _search_kakao(query: str, limit: int) -> list[dict]:
    """카카오 폴백 — 로컬 DB + 캐시에 결과 없을 때만 사용"""
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
                    sg = addr_obj.get("region_2depth_name", "") or road_obj.get("region_2depth_name", "")
                    if sg and "광주" not in sg:
                        continue
                    dong = road_obj.get("region_3depth_name") or addr_obj.get("region_3depth_name")
                    road = road_obj.get("address_name")
                    jibun = addr_obj.get("address_name")
                    name = road or jibun or d.get("address_name", "")
                    if name and name not in seen:
                        seen.add(name)
                        results.append({
                            "address_name": name,
                            "road_address": road,
                            "jibun_address": jibun,
                            "dong_name": dong,
                            "lat": float(d["y"]) if d.get("y") else None,
                            "lng": float(d["x"]) if d.get("x") else None,
                        })
                if results:
                    break
            except Exception:
                pass

        if not results:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/keyword.json",
                    params={"query": f"경기 광주 {query}", "rect": _GWANGJU_RECT, "size": limit},
                    headers=headers,
                )
                if resp.status_code == 200:
                    for d in resp.json().get("documents", []):
                        road = d.get("road_address_name") or ""
                        jibun = d.get("address_name") or ""
                        name = road or jibun
                        if not name or name in seen:
                            continue
                        m = re.search(r"([가-힣]+[동면읍리])", jibun)
                        dong = m.group(1) if m else None
                        seen.add(name)
                        results.append({
                            "address_name": name,
                            "road_address": road or None,
                            "jibun_address": jibun or None,
                            "dong_name": dong,
                            "lat": float(d["y"]) if d.get("y") else None,
                            "lng": float(d["x"]) if d.get("x") else None,
                        })
            except Exception:
                pass

    return results[:limit]


@router.get("/search")
async def search_addresses(
    query: str = Query(..., min_length=2, description="검색할 주소 (2자 이상)"),
    limit: int = Query(5, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    주소 검색 — 로컬 DB → address_cache → Kakao API 순서.
    Kakao 결과는 address_cache에 자동 저장.
    """
    # 1. 로컬 nexus_address DB
    results = await _search_local(query, db, limit)
    if results:
        return results[:limit]

    # 2. 이전 Kakao 검색 캐시
    results = await _search_cache(query, db, limit)
    if results:
        return results[:limit]

    # 3. Kakao API (결과 캐시 저장)
    results = await _search_kakao(query, limit)
    if results:
        await _save_to_cache(results, db)

    return results[:limit]
