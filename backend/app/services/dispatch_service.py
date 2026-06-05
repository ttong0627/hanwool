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


def run_dispatch(
    orders: list[DispatchOrder],
    driver_ids: list[int],
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
