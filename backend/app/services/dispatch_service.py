"""배차 알고리즘 — 기사 수에 따라 주문을 균등 분배

동(洞) 우선순위(배송 우선순위) 규칙은 제거됨. 주문이 있는 동을 주문 수 기준으로
기사들에게 균등 분배하며(같은 동은 같은 기사에 배정), 기사 내 배송 순번은
route_service가 거리(지도 좌표/도로) 기반으로 매긴다.
누락 0: 주문이 있는 모든 동은 반드시 어느 기사엔가 배정된다.
"""
from dataclasses import dataclass
from typing import Optional

# 불균형 임계값: 평균 대비 이 배수 이상이면 이관 대상 표시
IMBALANCE_RATIO = 1.5

RECOMMENDED_DONG_GROUPS: dict[int, list[list[str]]] = {
    2: [
        ["경안동", "송정동", "쌍령동", "탄벌동", "역동", "장지동", "태전동", "회덕동", "양벌동"],
        ["고산동", "매산동", "목동", "목현동", "문형동", "삼동", "중대동", "직동", "추자동"],
    ],
    3: [
        ["경안동", "송정동", "역동", "장지동", "탄벌동", "회덕동"],
        ["쌍령동", "양벌동", "태전동", "고산동", "중대동", "직동"],
        ["매산동", "목동", "목현동", "문형동", "삼동", "추자동"],
    ],
    4: [
        ["경안동", "송정동", "역동", "장지동"],
        ["탄벌동", "회덕동", "쌍령동", "양벌동", "태전동"],
        ["고산동", "중대동", "직동", "삼동"],
        ["매산동", "목동", "목현동", "문형동", "추자동"],
    ],
}


@dataclass
class DispatchOrder:
    id: int
    dong: str
    sequence: Optional[int]
    customer_name: str
    delivery_address: str
    quantity: int
    status: str


@dataclass
class DriverGroup:
    driver_id: int
    dongs: list[str]
    orders: list[DispatchOrder]
    can_transfer_to: list[int]  # 이관 가능한 driver_id 목록


def recommended_dong_groups(driver_count: int) -> list[list[str]]:
    """Return stable default dong groups for quick dispatch selection."""
    if driver_count in RECOMMENDED_DONG_GROUPS:
        return [group.copy() for group in RECOMMENDED_DONG_GROUPS[driver_count]]
    return [[] for _ in range(driver_count)]


def _assign_sequences(orders: list[DispatchOrder]) -> list[DispatchOrder]:
    """순서대로 1부터 sequence 재할당 (임시 — route_service가 거리 기반으로 덮어씀)"""
    for i, order in enumerate(orders, start=1):
        order.sequence = i
    return orders


def _flag_imbalance(groups: list[DriverGroup]) -> list[DriverGroup]:
    """평균 대비 IMBALANCE_RATIO 이상인 그룹 → 이관 허용 표시"""
    counts = [len(g.orders) for g in groups]
    avg = sum(counts) / max(len(counts), 1)
    for i, group in enumerate(groups):
        if counts[i] > avg * IMBALANCE_RATIO:
            group.can_transfer_to = [g.driver_id for j, g in enumerate(groups) if j != i]
    return groups


def _normalize_dong_groups(dong_groups: Optional[list[list[str]]], driver_count: int) -> list[list[str]]:
    if not dong_groups:
        return []

    normalized: list[list[str]] = []
    seen: set[str] = set()
    for source_group in dong_groups[:driver_count]:
        group: list[str] = []
        for dong in source_group:
            if not dong or dong in seen:
                continue
            group.append(dong)
            seen.add(dong)
        normalized.append(group)

    while len(normalized) < driver_count:
        normalized.append([])
    return normalized


def _run_dispatch_with_dong_groups(
    orders: list[DispatchOrder],
    groups: list[DriverGroup],
    dong_groups: list[list[str]],
) -> list[DriverGroup]:
    by_dong: dict[str, list[DispatchOrder]] = {}
    for order in orders:
        by_dong.setdefault(order.dong, []).append(order)

    assigned_dongs: set[str] = set()
    for group, dongs in zip(groups, dong_groups):
        for dong in dongs:
            group.dongs.append(dong)
            dong_orders = by_dong.get(dong, [])
            if dong_orders:
                group.orders.extend(dong_orders)
                assigned_dongs.add(dong)

    for dong in sorted(set(by_dong) - assigned_dongs, key=lambda d: -len(by_dong[d])):
        target = min(groups, key=lambda g: len(g.orders))
        target.dongs.append(dong)
        target.orders.extend(by_dong[dong])

    for group in groups:
        group.dongs = sorted(dict.fromkeys(group.dongs))
        _assign_sequences(group.orders)

    return _flag_imbalance(groups)


def run_dispatch(
    orders: list[DispatchOrder],
    driver_ids: list[int],
    dong_groups: Optional[list[list[str]]] = None,
) -> list[DriverGroup]:
    """주문을 기사들에게 균등 분배한다(우선순위 없음, 누락 0).

    동별로 묶은 뒤 주문 수가 많은 동부터 최소 부하 기사에 배정한다(greedy bin-packing).
    같은 동은 같은 기사에 배정되어 동선이 흩어지지 않으며, 기사 내 순번은
    route_service가 거리 기반으로 다시 매긴다.
    """
    n = len(driver_ids)
    if not (1 <= n <= 18):
        raise ValueError(f"지원하지 않는 기사 수: {n} (1~18명만 가능)")

    groups = [DriverGroup(driver_ids[i], [], [], []) for i in range(n)]
    normalized_dong_groups = _normalize_dong_groups(dong_groups, n)
    if normalized_dong_groups:
        return _run_dispatch_with_dong_groups(orders, groups, normalized_dong_groups)

    by_dong: dict[str, list[DispatchOrder]] = {}
    for o in orders:
        by_dong.setdefault(o.dong, []).append(o)

    # 주문 수 많은 동부터 가장 적은 부하의 기사에 배정 → 균등 분배
    for dong in sorted(by_dong, key=lambda d: -len(by_dong[d])):
        target = min(groups, key=lambda g: len(g.orders))
        target.dongs.append(dong)
        target.orders.extend(by_dong[dong])

    for g in groups:
        g.dongs = sorted(g.dongs)
        _assign_sequences(g.orders)

    return _flag_imbalance(groups)


def group_summary(groups: list[DriverGroup]) -> list[dict]:
    return [
        {
            "driver_id": g.driver_id,
            "dongs": g.dongs,
            "order_count": len(g.orders),
            "can_transfer_to": g.can_transfer_to,
            "orders": [
                {
                    "id": o.id,
                    "sequence": o.sequence,
                    "dong": o.dong,
                    "customer_name": o.customer_name,
                    "delivery_address": o.delivery_address,
                    "quantity": o.quantity,
                    "status": o.status,
                }
                for o in g.orders
            ],
        }
        for g in groups
    ]
