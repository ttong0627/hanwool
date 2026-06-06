"""
경안시장 배송 경로 최적화 서비스
- 방향 동선: 경안시장 출발 → 좌우 스윕(부스트로피돈) → 성남 방향 종료
- Kakao Geocoding / Mobility API 연동
"""
import math
import re
from typing import Optional

import httpx

from app.core.config import settings

# 경안시장 (배송 출발점) — 경기도 광주시 경안동 33-16 (Nominatim 검증 좌표)
MARKET_LOCATION = {"lat": 37.4090, "lng": 127.2574}

# 성남 방향 기준점 (성남시청 인근) — 시장→성남 진행축을 정의한다.
# 배송 순번은 시장에서 출발해 좌우로 쓸며 성남 방향에서 종료(기사 퇴근 동선 단축).
SOUTH_ANCHOR = {"lat": 37.4200, "lng": 127.1267}

JUMP_THRESHOLD_M = 300
WALK_THRESHOLD_M = 120


# ──────────────────────────────────────────────
# 기본 거리 계산 (Haversine)
# ──────────────────────────────────────────────

def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 간 거리(미터)"""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _has_coord(p: dict) -> bool:
    return bool(p.get("lat")) and bool(p.get("lng"))


# ──────────────────────────────────────────────
# 메인 배송순번 최적화
# ──────────────────────────────────────────────

def _to_local_xy(lat: float, lng: float, ref_lat: float) -> tuple[float, float]:
    """위경도를 ref_lat 기준 평면 미터 좌표로 근사 (x=동서, y=남북)."""
    return (lng * 111_320 * math.cos(math.radians(ref_lat)), lat * 110_540)


def _optimize_directional(
    driver_orders: list[dict], start_lat: float, start_lng: float
) -> list[dict]:
    """시장 출발 → 좌우 스윕 → 성남 방향 종료 경로.

    시장→성남(SOUTH_ANCHOR) 진행축으로 주문을 밴드로 나누고, 각 밴드 안에서
    좌우(진행축에 수직)로 정렬하되 밴드마다 방향을 교대(부스트로피돈)한다.
    가장 성남에 가까운 밴드가 마지막이 되어 퇴근 동선이 성남 방향으로 빠진다.
    좌표 없는 주문은 누락 없이 맨 뒤에 붙인다.
    """
    coord_orders = [o for o in driver_orders if _has_coord(o)]
    no_coord = [o for o in driver_orders if not _has_coord(o)]
    if not coord_orders:
        return no_coord

    ref = start_lat
    sx, sy = _to_local_xy(start_lat, start_lng, ref)
    ax, ay = _to_local_xy(SOUTH_ANCHOR["lat"], SOUTH_ANCHOR["lng"], ref)
    ux, uy = ax - sx, ay - sy
    ulen = math.hypot(ux, uy) or 1.0
    ux, uy = ux / ulen, uy / ulen      # 진행축 단위벡터 (시장→성남)
    vx, vy = -uy, ux                   # 좌우축 (진행축에 수직)

    def _proj(o: dict) -> tuple[float, float]:
        px, py = _to_local_xy(o["lat"], o["lng"], ref)
        dx, dy = px - sx, py - sy
        return (dx * ux + dy * uy, dx * vx + dy * vy)  # (진행도, 좌우)

    items = [(o, *_proj(o)) for o in coord_orders]
    a_values = [a for _, a, _ in items]
    a_min, a_max = min(a_values), max(a_values)
    span = (a_max - a_min) or 1.0

    n_bands = max(1, round(math.sqrt(len(items))))
    band_w = span / n_bands

    bands: dict[int, list] = {}
    for o, a, b in items:
        idx = min(n_bands - 1, int((a - a_min) / band_w))
        bands.setdefault(idx, []).append((o, b))

    ordered: list[dict] = []
    for i in range(n_bands):
        grp = bands.get(i)
        if not grp:
            continue
        # 밴드마다 좌우 방향 교대 → 좌에서 우로, 다음 밴드는 우에서 좌로 쓸기
        grp.sort(key=lambda x: x[1], reverse=(i % 2 == 1))
        ordered.extend(o for o, _ in grp)

    ordered.extend(no_coord)
    return ordered


def optimize_route(orders: list[dict]) -> list[dict]:
    """
    기사별로 독립적으로 순번 계산. 동 우선순위 없이 순수 거리(지도) 기반.
    orders: [{"id": int, "driver_id": int, "dong": str, "lat": float, "lng": float,
              "delivery_address": str, ...}, ...]
    반환: sequence 필드가 부여된 동일 orders 리스트
    """
    if not orders:
        return []

    # 기사별 그룹화
    driver_groups: dict[int, list[dict]] = {}
    unassigned: list[dict] = []
    for o in orders:
        did = o.get("driver_id")
        if did:
            driver_groups.setdefault(did, []).append(o)
        else:
            unassigned.append(o)

    result: list[dict] = []
    for driver_id, driver_orders in driver_groups.items():
        start_lat = MARKET_LOCATION["lat"]
        start_lng = MARKET_LOCATION["lng"]

        ordered = _optimize_directional(driver_orders, start_lat, start_lng)

        for i, o in enumerate(ordered):
            o["sequence"] = i + 1

        result.extend(ordered)

    for o in unassigned:
        o["sequence"] = None

    return result


# ──────────────────────────────────────────────
# 순번 품질 분석
# ──────────────────────────────────────────────

def analyze_sequence_quality(orders: list[dict]) -> dict:
    """
    기사별 순번 품질 분석
    - jump: 인접 순번 간 300m 이상
    - walkable: 인접 순번 간 120m 이하
    - no_coord: 좌표 없음
    """
    driver_groups: dict[int, list[dict]] = {}
    for o in sorted(orders, key=lambda x: (x.get("driver_id") or 0, x.get("sequence") or 999)):
        did = o.get("driver_id") or 0
        driver_groups.setdefault(did, []).append(o)

    report: list[dict] = []
    for driver_id, group in driver_groups.items():
        seq_orders = [o for o in group if o.get("sequence") is not None]
        seq_orders.sort(key=lambda x: x.get("sequence") or 0)

        dists: list[float] = []
        jumps: list[dict] = []
        walkable: list[dict] = []
        no_coord: list[dict] = []

        for i in range(len(seq_orders) - 1):
            a, b = seq_orders[i], seq_orders[i + 1]
            if not _has_coord(a) or not _has_coord(b):
                no_coord.append({"from": a.get("order_no"), "to": b.get("order_no")})
                continue
            d = haversine(a["lat"], a["lng"], b["lat"], b["lng"])
            dists.append(d)
            if d >= JUMP_THRESHOLD_M:
                jumps.append({"from": a.get("order_no"), "to": b.get("order_no"), "dist_m": round(d)})
            elif d <= WALK_THRESHOLD_M:
                walkable.append({"from": a.get("order_no"), "to": b.get("order_no"), "dist_m": round(d)})

        avg_dist = round(sum(dists) / len(dists)) if dists else 0
        max_dist = round(max(dists)) if dists else 0

        # 예상 정확도 (100점 기준)
        accuracy = 100
        accuracy -= len(jumps) * 10
        accuracy -= len(no_coord) * 5
        accuracy += len(walkable) * 2
        accuracy = max(0, min(100, accuracy))

        report.append({
            "driver_id": driver_id,
            "total": len(seq_orders),
            "jumps": jumps,
            "walkable_count": len(walkable),
            "no_coord_count": len(no_coord),
            "avg_dist_m": avg_dist,
            "max_dist_m": max_dist,
            "estimated_accuracy": accuracy,
        })

    return {"drivers": report}


# ──────────────────────────────────────────────
# Kakao API 연동
# ──────────────────────────────────────────────

async def get_kakao_coordinates(address: str) -> Optional[dict]:
    """주소 → 좌표 변환 (Kakao 로컬 API)

    전략 1: address.json 정확 검색 (원본 → '경기도 광주시 ' 접두 붙여서)
    전략 2: keyword.json 키워드 검색 fallback (도로명 약식 입력 대응)
    """
    if not settings.KAKAO_REST_API_KEY:
        return None

    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}

    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=3.0)) as client:
        # ── 전략 1: 주소 검색 (원본 + 광주시 접두) ─────────────────────────
        for query in [address, f"경기도 광주시 {address}"]:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/address.json",
                    params={"query": query},
                    headers=headers,
                )
                if resp.status_code == 200:
                    docs = resp.json().get("documents", [])
                    if docs:
                        d = docs[0]
                        # 도로명 주소에는 동 이름이 없으므로 region_3depth_name 별도 추출
                        dong_name = None
                        if d.get("road_address"):
                            dong_name = d["road_address"].get("region_3depth_name")
                        if not dong_name and d.get("address"):
                            dong_name = d["address"].get("region_3depth_name")
                        return {
                            "lat": float(d["y"]),
                            "lng": float(d["x"]),
                            "address_name": d.get("address_name", query),
                            "dong_name": dong_name,
                        }
            except Exception:
                pass

        # ── 전략 2: 키워드 검색 fallback (도로명 약식 주소 대응) ────────────
        for query in [f"광주시 {address}", address]:
            try:
                resp = await client.get(
                    "https://dapi.kakao.com/v2/local/search/keyword.json",
                    params={
                        "query": query,
                        # 경기도 광주시 근방 bbox (lng_min,lat_min,lng_max,lat_max)
                        "rect": "127.10,37.30,127.60,37.65",
                    },
                    headers=headers,
                )
                if resp.status_code == 200:
                    docs = resp.json().get("documents", [])
                    if docs:
                        d = docs[0]
                        addr_name = (d.get("road_address_name") or d.get("address_name") or query)
                        # keyword 검색: address_name = 지번(동 이름 포함)
                        jibun = d.get("address_name", "")
                        m = re.search(r'([가-힣]+동)', jibun)
                        dong_name = m.group(1) if m else None
                        return {
                            "lat": float(d["y"]),
                            "lng": float(d["x"]),
                            "address_name": addr_name,
                            "dong_name": dong_name,
                        }
            except Exception:
                pass

    return None


async def get_kakao_route_distance(
    origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float
) -> Optional[float]:
    """Kakao Mobility API로 실제 차량 경로 거리(미터) 조회"""
    if not settings.KAKAO_REST_API_KEY:
        return None
    url = "https://apis-navi.kakaomobility.com/v1/directions"
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    params = {
        "origin": f"{origin_lng},{origin_lat}",
        "destination": f"{dest_lng},{dest_lat}",
        "priority": "RECOMMEND",
        "summary": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=3.0)) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                if routes and routes[0].get("result_code") == 0:
                    return routes[0]["summary"]["distance"]
    except Exception:
        pass
    return None
