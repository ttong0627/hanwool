"""배차 알고리즘 단위 테스트 — 누락 0 / 균등 분배 / 경계 검증.

배차는 동 우선순위 없이 주문 수 기준으로 기사에 균등 분배한다(같은 동은 같은 기사).
순번은 route_service가 거리 기반으로 매기므로 여기서는 분배만 검증한다.
pytest 없이도 `python tests/test_dispatch_service.py`로 직접 실행 가능.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.dispatch_service import DispatchOrder, run_dispatch  # noqa: E402

DONGS = [
    "경안동", "탄벌동", "송정동", "쌍령동",
    "고산동", "매산동", "목동", "목현동", "문형동", "삼동",
    "양벌동", "역동", "장지동", "중대동", "직동", "추자동", "태전동", "회덕동",
]


def _mk(i: int, dong: str) -> DispatchOrder:
    return DispatchOrder(
        id=i, dong=dong, sequence=None,
        customer_name=f"c{i}", delivery_address=f"addr{i}", quantity=1, status="assigned",
    )


def _make_orders(counts: dict[str, int]) -> list[DispatchOrder]:
    orders: list[DispatchOrder] = []
    i = 1
    for dong, cnt in counts.items():
        for _ in range(cnt):
            orders.append(_mk(i, dong))
            i += 1
    return orders


def _all_ids(groups) -> set[int]:
    return {o.id for g in groups for o in g.orders}


def test_no_leak_all_driver_counts():
    """18개 동 전부 주문 × 다양한 기사 수 → 누락 0, 그룹 수 일치"""
    for n in [1, 2, 3, 4, 5, 10, 18]:
        orders = _make_orders({d: 2 for d in DONGS})
        input_ids = {o.id for o in orders}
        groups = run_dispatch(orders, list(range(1, n + 1)))
        assert _all_ids(groups) == input_ids, f"n={n} 누락 발생"
        assert len(groups) == n, f"n={n} 그룹 수 불일치"


def test_same_dong_same_driver():
    """같은 동의 주문은 같은 기사에 배정된다(동선 흩어짐 방지)"""
    orders = _make_orders({d: 3 for d in DONGS})
    groups = run_dispatch(orders, list(range(1, 5)))
    dong_to_drivers: dict[str, set[int]] = {}
    for g in groups:
        for o in g.orders:
            dong_to_drivers.setdefault(o.dong, set()).add(g.driver_id)
    for dong, drivers in dong_to_drivers.items():
        assert len(drivers) == 1, f"{dong}이 여러 기사에 분산됨: {drivers}"


def test_balanced_distribution():
    """주문 수 기준 균등 분배 — 기사 간 부하 편차가 과하지 않음"""
    # 18개 동 각 5건 = 90건 / 3명 → 기사당 ~30건
    orders = _make_orders({d: 5 for d in DONGS})
    groups = run_dispatch(orders, [1, 2, 3])
    counts = sorted(len(g.orders) for g in groups)
    assert _all_ids(groups) == {o.id for o in orders}
    # 균등 분배이므로 최대-최소 편차가 한 동 크기(5) 이내
    assert counts[-1] - counts[0] <= 5, f"부하 편차 과다: {counts}"


def test_more_drivers_than_dongs():
    """기사 수 > 동 수 → 누락 0, 빈 기사 허용"""
    orders = _make_orders({"경안동": 2, "송정동": 2})
    groups = run_dispatch(orders, [1, 2, 3, 4, 5])
    assert _all_ids(groups) == {o.id for o in orders}
    assert len(groups) == 5


def test_boundaries():
    """경계: 기사 0/19 → ValueError, 주문 없음 → 빈 그룹"""
    try:
        run_dispatch([], [])
        assert False, "기사 0명은 ValueError여야 함"
    except ValueError:
        pass
    try:
        run_dispatch([], list(range(1, 20)))
        assert False, "기사 19명은 ValueError여야 함"
    except ValueError:
        pass
    g = run_dispatch([], [1, 2, 3])
    assert _all_ids(g) == set()
    assert len(g) == 3


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        fn()
        print(f"  PASS  {fn.__name__}")
        passed += 1
    print(f"\n{passed}/{len(fns)} tests passed")


if __name__ == "__main__":
    _run_all()
