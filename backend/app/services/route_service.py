"""
경안시장 배송 경로 최적화 서비스
동 우선순위: 경안동 → 송정동 → 쌍령동 → 탄벌동
동 내부: Nearest Neighbor TSP
"""
from typing import List, Optional
import httpx
from app.core.config import settings

DONG_PRIORITY = {"경안동": 0, "송정동": 1, "쌍령동": 2, "탄벌동": 3}

MARKET_LOCATION = {"lat": 37.4292, "lng": 127.2551, "name": "경안시장"}


def _distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_neighbor_tsp(points: List[dict], start_lat: float, start_lng: float) -> List[dict]:
    remaining = list(points)
    path = []
    current_lat, current_lng = start_lat, start_lng

    while remaining:
        nearest = min(
            remaining,
            key=lambda p: _distance(current_lat, current_lng, p.get("lat", 0), p.get("lng", 0))
        )
        path.append(nearest)
        remaining.remove(nearest)
        current_lat, current_lng = nearest.get("lat", 0), nearest.get("lng", 0)

    return path


def optimize_route(orders: List[dict], route_mode: str = "A") -> List[dict]:
    """
    orders: [{"id": int, "dong": str, "lat": float, "lng": float, "address": str}, ...]
    route_mode A: 시장출발 → 전체배송 → 시장귀환
    route_mode B: 시장출발 → 전체배송 완료 후 귀환
    """
    if not orders:
        return []

    # 동별로 그룹화
    groups: dict[str, list] = {}
    for order in orders:
        dong = order.get("dong", "경안동")
        groups.setdefault(dong, []).append(order)

    # 동 우선순위 정렬 후 각 동 내부 TSP 적용
    sorted_route = []
    prev_lat = MARKET_LOCATION["lat"]
    prev_lng = MARKET_LOCATION["lng"]

    for dong in sorted(groups.keys(), key=lambda d: DONG_PRIORITY.get(d, 99)):
        dong_orders = nearest_neighbor_tsp(groups[dong], prev_lat, prev_lng)
        sorted_route.extend(dong_orders)
        if dong_orders:
            prev_lat = dong_orders[-1].get("lat", prev_lat)
            prev_lng = dong_orders[-1].get("lng", prev_lng)

    # 순번 부여
    for i, order in enumerate(sorted_route):
        order["sequence"] = i + 1

    return sorted_route


async def get_kakao_coordinates(address: str) -> Optional[dict]:
    if not settings.KAKAO_REST_API_KEY:
        return None
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {settings.KAKAO_REST_API_KEY}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params={"query": address}, headers=headers)
        if resp.status_code == 200:
            docs = resp.json().get("documents", [])
            if docs:
                return {"lat": float(docs[0]["y"]), "lng": float(docs[0]["x"])}
    return None
