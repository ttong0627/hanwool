"""
주소 검색 API — nexus_address 로컬 DB 기본, 결과 없을 시 Kakao 폴백
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
        "lat": None,
        "lng": None,
    }


async def _search_local(query: str, db: AsyncSession, limit: int) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    def add(row: dict) -> None:
        key = row["address_name"]
        if key and key not in seen:
            seen.add(key)
            results.append(row)

    q = query.strip()
    # 검색어에 "경기도 광주시"가 붙어있으면 제거
    q_clean = q.replace("경기도 광주시", "").replace("경기", "").strip()
    search_q = q_clean if q_clean else q

    # ── 1. addresses — road_address LIKE (도로명+번지 직접 매칭) ──────────────
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, legal_emd, building_name "
                "FROM nexus_address.addresses "
                "WHERE road_address ILIKE :pat "
                "  AND road_address != '' "
                "ORDER BY LENGTH(road_address) "
                "LIMIT :lim"
            ),
            {"pat": f"%{search_q}%", "lim": limit * 2},
        )
        for r in rows.all():
            add(_row_to_result(r[0], r[1], r[2]))
    except Exception:
        pass

    if len(results) >= limit:
        return results[:limit]

    # ── 2. buildings — 건물명 또는 도로명 주소 검색 ───────────────────────────
    remaining = limit - len(results)
    try:
        rows = await db.execute(
            text(
                "SELECT road_address, legal_emd, building_name "
                "FROM nexus_address.buildings "
                "WHERE (building_name ILIKE :pat OR road_address ILIKE :pat) "
                "  AND road_address != '' "
                "ORDER BY "
                "  CASE WHEN building_name ILIKE :pat THEN 0 ELSE 1 END, "
                "  LENGTH(road_address) "
                "LIMIT :lim"
            ),
            {"pat": f"%{search_q}%", "lim": remaining * 2},
        )
        for r in rows.all():
            add(_row_to_result(r[0], r[1], r[2]))
    except Exception:
        pass

    if len(results) >= limit:
        return results[:limit]

    # ── 3. jibun_addresses — 지번 주소 검색 ──────────────────────────────────
    remaining = limit - len(results)
    m = re.search(r"([가-힣]+[동면읍리])\s*(산\s*)?(\d+)(?:[-–](\d+))?", search_q)
    if m:
        dong = m.group(1)
        san = "1" if m.group(2) else "0"
        main_no = int(m.group(3))
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

    # ── 4. pg_trgm 유사도 폴백 (road_key) ────────────────────────────────────
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


async def _search_kakao(query: str, limit: int) -> list[dict]:
    """카카오 폴백 — 로컬 DB 결과 없을 때만 사용"""
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
    주소 검색 — nexus_address 로컬 DB 우선, 결과 없을 시 Kakao API 폴백.
    """
    results = await _search_local(query, db, limit)
    if not results:
        results = await _search_kakao(query, limit)
    return results
