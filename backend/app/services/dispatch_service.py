"""배차 알고리즘 — 기사 수에 따라 배송 동을 그룹으로 분배

설계 원칙:
- 동 우선순위(priority)는 delivery_zones DB가 단일 진실 공급원이며,
  async 호출부에서 dict로 로드해 이 sync 함수들에 주입한다(zone_service.load_zone_priority).
- n<=4: 기존 검증된 고정 그룹 동선을 보존하고, 그룹에 없는 신규 동은
  최소 부하 기사에 흡수시켜 누락을 방지한다.
- n>=5: 우선순위 순으로 정렬한 활성 동을 주문 수 기준 연속 블록으로 균등 분배한다.
- 어떤 기사 수(1~18)에서도 주문이 있는 모든 동은 반드시 어느 기사엔가 배정된다(누락 0).
"""
from dataclasses import dataclass
from typing import Optional

# 우선순위 매핑에 없는 동의 폴백값 — 정렬상 맨 뒤로 보내되 누락시키지 않는다.
DEFAULT_UNKNOWN_PRIORITY = 999

# 불균형 임계값: 평균 대비 이 배수 이상이면 이관 대상 표시
IMBALANCE_RATIO = 1.5

# 기존 검증된 고정 그룹 동선 (운영 정책 — 핵심 4개 동)
LEGACY_GROUPS_2: list[list[str]] = [
    ["경안동", "쌍령동"],
    ["탄벌동", "송정동"],
]
LEGACY_GROUPS_3: list[list[str]] = [
    ["경안동", "탄벌동"],
    ["송정동"],
    ["쌍령동"],
]
LEGACY_DONGS_4: list[str] = ["경안동", "탄벌동", "송정동", "쌍령동"]


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


def _prio(dong: str, dong_priority: dict[str, int]) -> int:
    return dong_priority.get(dong, DEFAULT_UNKNOWN_PRIORITY)


def _sort_orders(orders: list[DispatchOrder], dong_priority: dict[str, int]) -> list[DispatchOrder]:
    """동 우선순위 → 배송순번 순 정렬"""
    return sorted(
        orders,
        key=lambda o: (_prio(o.dong, dong_priority), o.sequence or 9999),
    )


def _assign_sequences(orders: list[DispatchOrder]) -> list[DispatchOrder]:
    """순서대로 1부터 sequence 재할당"""
    for i, order in enumerate(orders, start=1):
        order.sequence = i
    return orders


def _present_dongs(orders: list[DispatchOrder], dong_priority: dict[str, int]) -> list[str]:
    """주문에 존재하는 동들을 우선순위 순으로 반환"""
    return sorted({o.dong for o in orders}, key=lambda d: _prio(d, dong_priority))


def _make_group(
    driver_id: int,
    dong_list: list[str],
    orders: list[DispatchOrder],
    dong_priority: dict[str, int],
) -> DriverGroup:
    group_orders = [o for o in orders if o.dong in dong_list]
    return DriverGroup(
        driver_id=driver_id,
        dongs=sorted(dong_list, key=lambda d: _prio(d, dong_priority)),
        orders=_assign_sequences(_sort_orders(group_orders, dong_priority)),
        can_transfer_to=[],
    )


def _attach_remaining_dongs(
    groups: list[DriverGroup],
    orders: list[DispatchOrder],
    dong_priority: dict[str, int],
) -> list[DriverGroup]:
    """고정 그룹에 배정되지 않은 동(신규 동 등)을 최소 부하 기사에 흡수 — 누락 방지"""
    assigned = {d for g in groups for d in g.dongs}
    leftover = [d for d in _present_dongs(orders, dong_priority) if d not in assigned]
    for dong in leftover:
        target = min(groups, key=lambda g: len(g.orders))
        target.dongs = sorted(target.dongs + [dong], key=lambda d: _prio(d, dong_priority))
        merged = target.orders + [o for o in orders if o.dong == dong]
        target.orders = _assign_sequences(_sort_orders(merged, dong_priority))
    return groups


def _flag_imbalance(groups: list[DriverGroup]) -> list[DriverGroup]:
    """평균 대비 IMBALANCE_RATIO 이상인 그룹 → 이관 허용 표시"""
    counts = [len(g.orders) for g in groups]
    avg = sum(counts) / max(len(counts), 1)
    for i, group in enumerate(groups):
        if counts[i] > avg * IMBALANCE_RATIO:
            group.can_transfer_to = [g.driver_id for j, g in enumerate(groups) if j != i]
    return groups


def dispatch_1_driver(
    orders: list[DispatchOrder], driver_id: int, dong_priority: dict[str, int]
) -> list[DriverGroup]:
    """1명: 우선순위 순으로 전체 배송 (누락 없음)"""
    sorted_orders = _assign_sequences(_sort_orders(orders, dong_priority))
    return [DriverGroup(
        driver_id=driver_id,
        dongs=_present_dongs(orders, dong_priority),
        orders=sorted_orders,
        can_transfer_to=[],
    )]


def dispatch_2_drivers(
    orders: list[DispatchOrder], driver_ids: list[int], dong_priority: dict[str, int]
) -> list[DriverGroup]:
    """기사1=[경안동→쌍령동], 기사2=[탄벌동→송정동] 고정 그룹"""
    return [
        _make_group(driver_ids[i], dong_list, orders, dong_priority)
        for i, dong_list in enumerate(LEGACY_GROUPS_2)
    ]


def dispatch_3_drivers(
    orders: list[DispatchOrder], driver_ids: list[int], dong_priority: dict[str, int]
) -> list[DriverGroup]:
    """기사1=[경안동→탄벌동], 기사2=송정동, 기사3=쌍령동 고정 그룹"""
    return [
        _make_group(driver_ids[i], dong_list, orders, dong_priority)
        for i, dong_list in enumerate(LEGACY_GROUPS_3)
    ]


def dispatch_4_drivers(
    orders: list[DispatchOrder], driver_ids: list[int], dong_priority: dict[str, int]
) -> list[DriverGroup]:
    """경안동/탄벌동/송정동/쌍령동 — 기사별 1개 동씩 배정 + 불균형 감지"""
    groups = [
        _make_group(driver_ids[i], [dong], orders, dong_priority)
        for i, dong in enumerate(LEGACY_DONGS_4)
    ]
    return _flag_imbalance(groups)


def dispatch_n_generic(
    orders: list[DispatchOrder], driver_ids: list[int], dong_priority: dict[str, int]
) -> list[DriverGroup]:
    """n>=5: 우선순위 순 활성 동을 주문 수 기준 연속 블록으로 균등 분배 (누락 0)"""
    n = len(driver_ids)
    dongs = _present_dongs(orders, dong_priority)

    if not dongs:
        return [DriverGroup(driver_ids[i], [], [], []) for i in range(n)]

    counts: dict[str, int] = {}
    for o in orders:
        counts[o.dong] = counts.get(o.dong, 0) + 1
    total = sum(counts.values())
    target = total / n  # 기사당 목표 주문 수

    assignments: list[list[str]] = []
    cur: list[str] = []
    cur_count = 0
    for idx, dong in enumerate(dongs):
        cur.append(dong)
        cur_count += counts[dong]
        groups_filled = len(assignments)
        dongs_left_after = len(dongs) - (idx + 1)
        drivers_left_after = n - groups_filled - 1
        # 마지막 기사가 아니고, (목표 도달 OR 남은 동이 남은 기사 수만큼만 남으면) 끊는다.
        if groups_filled < n - 1 and (cur_count >= target or dongs_left_after <= drivers_left_after):
            assignments.append(cur)
            cur = []
            cur_count = 0
    if cur:
        assignments.append(cur)

    groups = [
        _make_group(driver_ids[i], assignments[i] if i < len(assignments) else [], orders, dong_priority)
        for i in range(n)
    ]
    return _flag_imbalance(groups)


def run_dispatch(
    orders: list[DispatchOrder],
    driver_ids: list[int],
    dong_priority: dict[str, int],
) -> list[DriverGroup]:
    n = len(driver_ids)
    if n < 1:
        raise ValueError(f"지원하지 않는 기사 수: {n} (1~18명만 가능)")
    if n == 1:
        groups = dispatch_1_driver(orders, driver_ids[0], dong_priority)
    elif n == 2:
        groups = dispatch_2_drivers(orders, driver_ids, dong_priority)
    elif n == 3:
        groups = dispatch_3_drivers(orders, driver_ids, dong_priority)
    elif n == 4:
        groups = dispatch_4_drivers(orders, driver_ids, dong_priority)
    elif n <= 18:
        # 전면 일반화 — 자체적으로 모든 활성 동을 배정하므로 흡수 불필요
        return dispatch_n_generic(orders, driver_ids, dong_priority)
    else:
        raise ValueError(f"지원하지 않는 기사 수: {n} (1~18명만 가능)")
    # n<=4 보존 모드: 고정 그룹에 없는 신규 동을 흡수해 누락 방지
    return _attach_remaining_dongs(groups, orders, dong_priority)


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
