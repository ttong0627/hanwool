"""
배차 분배 서비스 — 기사 수에 따른 동별 그룹핑 + 배송순번 할당

규칙:
  1명: 경안동→송정동→쌍령동→탄벌동 순서로 전체 배송
  2명: [경안동+쌍령동] / [송정동+탄벌동] 고정 그룹
  3명: 수량 최소 2개동 묶어 1명, 나머지 각 1명
  4명: 동별 1:1, 불균형 동은 이관 허용
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

DONG_PRIORITY: dict[str, int] = {
    "경안동": 0,
    "송정동": 1,
    "쌍령동": 2,
    "탄벌동": 3,
}

# 2명 배차 시 고정 그룹
GROUPS_2: list[list[str]] = [
    ["경안동", "쌍령동"],
    ["송정동", "탄벌동"],
]

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


def dispatch_1_driver(
    orders: list[DispatchOrder], driver_id: int
) -> list[DriverGroup]:
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
    groups: list[DriverGroup] = []
    for i, dong_list in enumerate(GROUPS_2):
        driver_id = driver_ids[i]
        group_orders = [o for o in orders if o.dong in dong_list]
        sorted_orders = _assign_sequences(_sort_orders(group_orders))
        groups.append(DriverGroup(
            driver_id=driver_id,
            dongs=dong_list,
            orders=sorted_orders,
            can_transfer_to=[],
        ))
    return groups


def dispatch_3_drivers(
    orders: list[DispatchOrder], driver_ids: list[int]
) -> list[DriverGroup]:
    # 동별 수량 집계
    dong_counts: dict[str, int] = {d: 0 for d in DONG_PRIORITY}
    for o in orders:
        dong_counts[o.dong] = dong_counts.get(o.dong, 0) + 1

    # 수량 오름차순 정렬 → 최소 2개동 묶음
    sorted_dongs = sorted(dong_counts.items(), key=lambda x: x[1])
    bundle_dongs = [sorted_dongs[0][0], sorted_dongs[1][0]]
    solo_dongs = [sorted_dongs[2][0], sorted_dongs[3][0]]

    groups: list[DriverGroup] = []

    # 그룹0: 묶음 2개동 (driver_ids[0])
    bundle_orders = [o for o in orders if o.dong in bundle_dongs]
    sorted_bundle = _assign_sequences(_sort_orders(bundle_orders))
    groups.append(DriverGroup(
        driver_id=driver_ids[0],
        dongs=sorted(bundle_dongs, key=lambda d: DONG_PRIORITY.get(d, 99)),
        orders=sorted_bundle,
        can_transfer_to=[],
    ))

    # 그룹1, 2: 각각 1개동
    for idx, dong in enumerate(
        sorted(solo_dongs, key=lambda d: DONG_PRIORITY.get(d, 99)), start=1
    ):
        solo_orders = [o for o in orders if o.dong == dong]
        sorted_solo = _assign_sequences(_sort_orders(solo_orders))
        groups.append(DriverGroup(
            driver_id=driver_ids[idx],
            dongs=[dong],
            orders=sorted_solo,
            can_transfer_to=[],
        ))

    return groups


def dispatch_4_drivers(
    orders: list[DispatchOrder], driver_ids: list[int]
) -> list[DriverGroup]:
    # 동 우선순위 순서대로 기사 배정
    dong_order = sorted(DONG_PRIORITY.keys(), key=lambda d: DONG_PRIORITY[d])
    groups: list[DriverGroup] = []
    counts: list[int] = []

    for i, dong in enumerate(dong_order):
        driver_id = driver_ids[i]
        dong_orders = [o for o in orders if o.dong == dong]
        sorted_orders = _assign_sequences(_sort_orders(dong_orders))
        groups.append(DriverGroup(
            driver_id=driver_id,
            dongs=[dong],
            orders=sorted_orders,
            can_transfer_to=[],
        ))
        counts.append(len(dong_orders))

    # 불균형 감지: 평균 대비 IMBALANCE_RATIO 이상인 동 → 이관 허용 표시
    avg = sum(counts) / max(len(counts), 1)
    for i, group in enumerate(groups):
        if counts[i] > avg * IMBALANCE_RATIO:
            other_ids = [g.driver_id for j, g in enumerate(groups) if j != i]
            group.can_transfer_to = other_ids

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
