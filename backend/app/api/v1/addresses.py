"""
주소 검색 API — 카카오 로컬 API 기반 표준 주소 목록 반환
"""
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query

from app.api.v1.deps import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/addresses", tags=["주소"])

# 경기도 광주시 경계 bbox (lng_min,lat_min,lng_max,lat_max)
_GWANGJU_RECT = "127.10,37.30,127.60,37.65"


def _extract_dong(address_obj: Optional[dict]) -> Optional[str]:
    if not address_obj:
        return None
    return address_obj.get("region_3depth_name") or None


def _build_result(d: dict) -> dict:
    addr = d.get("address") or {}
    road = d.get("road_address") or {}
    dong = _extract_dong(road) or _extract_dong(addr)
    road_addr = road.get("address_name") if road else None
    jibun_addr = addr.get("address_name") if addr else None
    return {
        "address_name": road_addr or jibun_addr or d.get("address_name", ""),
        "road_address": road_addr,
        "jibun_address": jibun_addr,
        "dong_name": dong,
        "lat": float(d["y"]) if d.get("y") else None,
        "lng": float(d["x"]) if d.get("x") else None,
    }


def _is_gwangju(d: dict) -> bool:
    addr = d.get("address") or {}
    road = d.get("road_address") or {}
    for obj in (addr, road):
        sg = obj.get("region_2depth_name", "")
        if sg and "광주" in sg:
            return True
    return False


@router.get("/search")
async def search_addresses(
    query: str = Query(..., min_length=2, description="검색할 주소 (2자 이상)"),
    limit: int = Query(5, ge=1, le=10),
    _=Depends(get_current_user),
):
    """
    주소 검색 — 카카오 주소 검색 API 결과를 표준 주소 목록으로 반환.
    1차: search/address.json (원본 → '경기도 광주시 ' 접두)
    2차: search/keyword.json (광주시 bbox 제한)
    """
    if not settings.KAKAO_REST_API_KEY:
        return []

    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    results: list[dict] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(timeout=5.0) as client:
        # ── 1차: 주소 검색 ──────────────────────────────────────────────────
        for q in [query, f"경기도 광주시 {query}"]:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/address.json",
                    params={"query": q, "size": limit},
                    headers=headers,
                )
                if resp.status_code != 200:
                    continue
                docs = resp.json().get("documents", [])
                for d in docs:
                    if not _is_gwangju(d):
                        continue
                    row = _build_result(d)
                    key = row["address_name"]
                    if key and key not in seen:
                        seen.add(key)
                        results.append(row)
            except Exception:
                pass

            if len(results) >= limit:
                break

        # ── 2차: 키워드 검색 (폴백) ────────────────────────────────────────
        if len(results) < limit:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/keyword.json",
                    params={
                        "query": f"경기 광주 {query}",
                        "rect": _GWANGJU_RECT,
                        "size": limit,
                    },
                    headers=headers,
                )
                if resp.status_code == 200:
                    docs = resp.json().get("documents", [])
                    for d in docs:
                        road_addr = d.get("road_address_name") or ""
                        jibun_addr = d.get("address_name") or ""
                        display = road_addr or jibun_addr
                        if not display or display in seen:
                            continue

                        m = re.search(r"([가-힣]+[동면읍리])", jibun_addr)
                        dong = m.group(1) if m else None

                        seen.add(display)
                        results.append({
                            "address_name": display,
                            "road_address": road_addr or None,
                            "jibun_address": jibun_addr or None,
                            "dong_name": dong,
                            "lat": float(d["y"]) if d.get("y") else None,
                            "lng": float(d["x"]) if d.get("x") else None,
                        })
                        if len(results) >= limit:
                            break
            except Exception:
                pass

    return results[:limit]
