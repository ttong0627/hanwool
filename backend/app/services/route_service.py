"""
경안시장 배송 경로 최적화 서비스
- roadAwareTSP: 도로명 기준 그룹핑 → 건물번호 순 → 2-opt
- nearestNeighborTSP: 좌표 기반 최근접 이웃 → 2-opt (fallback)
- 동 우선순위: 경안동 → 송정동 → 쌍령동 → 탄벌동
- Kakao Geocoding / Mobility API 연동
"""
import math
import re
from typing import Optional

import httpx

from app.core.config import settings

# 경안시장 기준 지리적 순서: 인접(경안동) → 북서(탄벌동) → 북동(송정동) → 서외곽(쌍령동)
# 배송 순번은 동 우선순위 없이 순수 거리(지도 좌표/도로) 기반으로만 정한다.
# 경기도 광주시 경안동 33-16 (Nominatim 검증 좌표)
MARKET_LOCATION = {"lat": 37.4090, "lng": 127.2574}

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
# 도로명 파싱
# ──────────────────────────────────────────────

_ROAD_SUFFIXES = ("대로", "로", "길")

def _parse_road(address: str) -> tuple[str, int]:
    """
    주소에서 (도로명, 건물본번) 추출
    예) '광주대로 23' → ('광주대로', 23)
        '경충대로 1407-3' → ('경충대로', 1407)
    """
    if not address:
        return ("", 0)
    for suffix in _ROAD_SUFFIXES:
        pattern = rf"(\S+{suffix})\s+(\d+)"
        m = re.search(pattern, address)
        if m:
            return (m.group(1), int(m.group(2)))
    return ("", 0)


def _road_key(address: str) -> str:
    road, _ = _parse_road(address)
    return road


def _bldg_no(address: str) -> int:
    _, no = _parse_road(address)
    return no


# ──────────────────────────────────────────────
# 2-opt 교차 제거
# ──────────────────────────────────────────────

def _two_opt(path: list[dict]) -> list[dict]:
    """좌표 있는 경로만 2-opt 적용. 최대 100회 반복."""
    coords = [(p.get("lat", 0), p.get("lng", 0)) for p in path]
    n = len(coords)
    if n < 4:
        return path

    def total_dist() -> float:
        return sum(
            haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
            for i in range(n - 1)
        )

    improved = True
    iterations = 0
    while improved and iterations < 100:
        improved = False
        iterations += 1
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                # reverse segment [i..j]
                new_coords = coords[:i] + coords[i:j + 1][::-1] + coords[j + 1:]
                old = (
                    haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
                    + haversine(coords[j][0], coords[j][1], coords[j + 1][0] if j + 1 < n else coords[j][0],
                                coords[j + 1][1] if j + 1 < n else coords[j][1])
                )
                new = (
                    haversine(new_coords[i - 1][0], new_coords[i - 1][1], new_coords[i][0], new_coords[i][1])
                    + haversine(new_coords[j][0], new_coords[j][1],
                                new_coords[j + 1][0] if j + 1 < n else new_coords[j][0],
                                new_coords[j + 1][1] if j + 1 < n else new_coords[j][1])
                )
                if new < old - 0.01:
                    coords = new_coords
                    path = path[:i] + path[i:j + 1][::-1] + path[j + 1:]
                    improved = True
    return path


# ──────────────────────────────────────────────
# nearestNeighborTSP (좌표 fallback)
# ──────────────────────────────────────────────

def nearest_neighbor_tsp(points: list[dict], start_lat: float, start_lng: float) -> list[dict]:
    """좌표 기반 최근접 이웃 + 2-opt"""
    with_coord = [p for p in points if _has_coord(p)]
    no_coord = [p for p in points if not _has_coord(p)]

    remaining = list(with_coord)
    path: list[dict] = []
    cur_lat, cur_lng = start_lat, start_lng

    while remaining:
        nearest = min(remaining, key=lambda p: haversine(cur_lat, cur_lng, p["lat"], p["lng"]))
        path.append(nearest)
        remaining.remove(nearest)
        cur_lat, cur_lng = nearest["lat"], nearest["lng"]

    path = _two_opt(path)
    return path + no_coord


# ──────────────────────────────────────────────
# roadAwareTSP (도로명 우선)
# ──────────────────────────────────────────────

def road_aware_tsp(points: list[dict], start_lat: float, start_lng: float) -> list[dict]:
    """
    1. 도로명 기준 그룹핑
    2. 그룹 내부는 건물번호 오름차순 (진입 방향 결정)
    3. 그룹 간 최근접 이웃 (이전 도착점 기준)
    4. 전체 2-opt 적용
    5. 도로명 없는 항목은 좌표 TSP fallback
    """
    with_road: dict[str, list[dict]] = {}
    no_road_with_coord: list[dict] = []
    no_coord: list[dict] = []

    for p in points:
        addr = p.get("delivery_address", "") or ""
        road = _road_key(addr)
        if road:
            with_road.setdefault(road, []).append(p)
        elif _has_coord(p):
            no_road_with_coord.append(p)
        else:
            no_coord.append(p)

    # 도로명 없는 건 좌표 TSP로 처리 후 합산
    fallback_path = nearest_neighbor_tsp(no_road_with_coord, start_lat, start_lng) if no_road_with_coord else []

    if not with_road:
        return fallback_path + no_coord

    # 각 도로 그룹 내부 건물번호 정렬
    road_groups: list[tuple[str, list[dict], list[dict]]] = []
    for road, items in with_road.items():
        items_asc = sorted(items, key=lambda p: _bldg_no(p.get("delivery_address", "") or ""))
        items_desc = list(reversed(items_asc))
        road_groups.append((road, items_asc, items_desc))

    # 첫 그룹: 시작점에서 가장 가까운 진입점을 가진 도로
    def _group_entry_dist(group_asc, group_desc):
        if _has_coord(group_asc[0]):
            d_asc = haversine(start_lat, start_lng, group_asc[0]["lat"], group_asc[0]["lng"])
        else:
            d_asc = float("inf")
        if _has_coord(group_desc[0]):
            d_desc = haversine(start_lat, start_lng, group_desc[0]["lat"], group_desc[0]["lng"])
        else:
            d_desc = float("inf")
        return min(d_asc, d_desc)

    road_groups_sorted = sorted(road_groups, key=lambda t: _group_entry_dist(t[1], t[2]))

    result: list[dict] = []
    cur_lat, cur_lng = start_lat, start_lng

    visited_roads: set[str] = set()
    remaining_groups = list(road_groups_sorted)

    while remaining_groups:
        # 현재 위치에서 가장 가까운 미방문 도로 그룹 선택
        def _nearest_group_dist(t):
            asc, desc = t[1], t[2]
            d_asc = haversine(cur_lat, cur_lng, asc[0]["lat"], asc[0]["lng"]) if _has_coord(asc[0]) else float("inf")
            d_desc = haversine(cur_lat, cur_lng, desc[0]["lat"], desc[0]["lng"]) if _has_coord(desc[0]) else float("inf")
            return min(d_asc, d_desc)

        chosen = min(remaining_groups, key=_nearest_group_dist)
        remaining_groups.remove(chosen)

        road_name, asc, desc = chosen
        visited_roads.add(road_name)

        # 현재 위치 기준 진입 방향 결정 (정방향 vs 역방향)
        d_asc = haversine(cur_lat, cur_lng, asc[0]["lat"], asc[0]["lng"]) if _has_coord(asc[0]) else float("inf")
        d_desc = haversine(cur_lat, cur_lng, desc[0]["lat"], desc[0]["lng"]) if _has_coord(desc[0]) else float("inf")
        ordered = asc if d_asc <= d_desc else desc

        result.extend(ordered)
        last = ordered[-1]
        if _has_coord(last):
            cur_lat, cur_lng = last["lat"], last["lng"]

    # 도로명 없는 좌표 항목 뒤에 붙임
    combined = result + fallback_path + no_coord
    return _two_opt(combined)


# ──────────────────────────────────────────────
# 메인 배송순번 최적화
# ──────────────────────────────────────────────

def _optimize_by_distance(
    driver_orders: list[dict], start_lat: float, start_lng: float
) -> list[dict]:
    """동 구분 없이 거리(도로/좌표) 기반으로만 배송 순번을 정한다."""
    has_road = any(_road_key(order.get("delivery_address", "") or "") for order in driver_orders)
    if has_road:
        return road_aware_tsp(driver_orders, start_lat, start_lng)
    return nearest_neighbor_tsp(driver_orders, start_lat, start_lng)


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

        ordered = _optimize_by_distance(driver_orders, start_lat, start_lng)

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

    async with httpx.AsyncClient(timeout=5.0) as client:
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
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                if routes and routes[0].get("result_code") == 0:
                    return routes[0]["summary"]["distance"]
    except Exception:
        pass
    return None
