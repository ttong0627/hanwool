"""
배차 분배 서비스 — 기사 수에 따른 동별 그룹핑 + 배송순번 할당

규칙:
  1명: 경안동→탄벌동→송정동→쌍령동 순서로 전체 배송
  2명: 기사1=[경안동→쌍령동] / 기사2=[탄벌동→송정동] 고정 그룹
  3명: 기사1=[경안동→탄벌동] / 기사2=송정동 / 기사3=쌍령동 고정 그룹
  4명: 경안동/탄벌동/송정동/쌍령동 순서로 기사별 1개 동씩 배정
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# 배송 동 우선순위 — 1명 기사 이동 경로 및 그룹 내 정렬 기준
DONG_PRIORITY: dict[str, int] = {
    "경안동": 0,
    "탄벌동": 1,
    "송정동": 2,
    "쌍령동": 3,
}

# 불균형 임계값: 평균 대비 이 배수 이상이면 이관 대상 표시 (4명 배차 시 사용)
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


def _sort_orders(orders: list[DispatchOrder]) -> list[DispatchOrder]:
    """동 우선순위 → 배송순번 순 정렬"""
    return sorted(
        orders,
        key=lambda o: (DONG_PRIORITY.get(o.dong, 99), o.sequence or 9999),
    )


def _assign_sequences(orders: list[DispatchOrder]) -> list[DispatchOrder]:
    """순서대로 1부터 sequence 재할당"""
    for i, order in enumerate(orders, start=1):
        order.sequence = i
    return orders


def _make_group(driver_id: int, dong_list: list[str], orders: list[DispatchOrder]) -> DriverGroup:
    group_orders = [o for o in orders if o.dong in dong_list]
    return DriverGroup(
        driver_id=driver_id,
        dongs=sorted(dong_list, key=lambda d: DONG_PRIORITY.get(d, 99)),
        orders=_assign_sequences(_sort_orders(group_orders)),
        can_transfer_to=[],
    )


def dispatch_1_driver(
    orders: list[DispatchOrder], driver_id: int
) -> list[DriverGroup]:
    """경안동→탄벌동→송정동→쌍령동 전체 배송"""
    sorted_orders = _assign_sequences(_sort_orders(orders))
    return [DriverGroup(
        driver_id=driver_id,
        dongs=list(DONG_PRIORITY.keys()),
        orders=sorted_orders,
        can_transfer_to=[],
    )]


def dispatch_2_drivers(
    orders: list[DispatchOrder], driver_ids: list[int]
) -> list[DriverGroup]:
    """기사1=[경안동→쌍령동], 기사2=[탄벌동→송정동] 고정 그룹"""
    GROUPS: list[list[str]] = [
        ["경안동", "쌍령동"],
        ["탄벌동", "송정동"],
    ]
    return [_make_group(driver_ids[i], dong_list, orders) for i, dong_list in enumerate(GROUPS)]


def dispatch_3_drivers(
    orders: list[DispatchOrder], driver_ids: list[int]
) -> list[DriverGroup]:
    """기사1=[경안동→탄벌동], 기사2=송정동, 기사3=쌍령동 고정 그룹"""
    GROUPS: list[list[str]] = [
        ["경안동", "탄벌동"],
        ["송정동"],
        ["쌍령동"],
    ]
    return [_make_group(driver_ids[i], dong_list, orders) for i, dong_list in enumerate(GROUPS)]


def dispatch_4_drivers(
    orders: list[DispatchOrder], driver_ids: list[int]
) -> list[DriverGroup]:
    """경안동/탄벌동/송정동/쌍령동 — 기사별 1개 동씩 배정"""
    dong_order = sorted(DONG_PRIORITY.keys(), key=lambda d: DONG_PRIORITY[d])
    groups: list[DriverGroup] = []
    counts: list[int] = []

    for i, dong in enumerate(dong_order):
        g = _make_group(driver_ids[i], [dong], orders)
        groups.append(g)
        counts.append(len(g.orders))

    # 불균형 감지: 평균 대비 IMBALANCE_RATIO 이상인 동 → 이관 허용 표시
    avg = sum(counts) / max(len(counts), 1)
    for i, group in enumerate(groups):
        if counts[i] > avg * IMBALANCE_RATIO:
            group.can_transfer_to = [g.driver_id for j, g in enumerate(groups) if j != i]

    return groups


def run_dispatch(
    orders: list[DispatchOrder],
    driver_ids: list[int],
) -> list[DriverGroup]:
    n = len(driver_ids)
    if n == 1:
        return dispatch_1_driver(orders, driver_ids[0])
    elif n == 2:
        return dispatch_2_drivers(orders, driver_ids)
    elif n == 3:
        return dispatch_3_drivers(orders, driver_ids)
    elif n == 4:
        return dispatch_4_drivers(orders, driver_ids)
    else:
        raise ValueError(f"지원하지 않는 기사 수: {n} (1~4명만 가능)")


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
