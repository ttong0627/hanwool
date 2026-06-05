"""배차 알고리즘 단위 테스트 — 누락 0 / 기존 동선 회귀 / 신규 동 흡수 검증.

dispatch_service는 순수 함수(DB 비의존)이므로 dong_priority dict 주입만으로 검증한다.
pytest 없이도 `python tests/test_dispatch_service.py`로 직접 실행 가능.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.dispatch_service import DispatchOrder, run_dispatch  # noqa: E402

# 프로덕션 보정과 동일한 우선순위(경안1·탄벌2·송정3·쌍령4 + 신규 5~18)
ZONE_PRIORITY = {
    "경안동": 1, "탄벌동": 2, "송정동": 3, "쌍령동": 4,
    "고산동": 5, "매산동": 6, "목동": 7, "목현동": 8, "문형동": 9, "삼동": 10,
    "양벌동": 11, "역동": 12, "장지동": 13, "중대동": 14, "직동": 15,
    "추자동": 16, "태전동": 17, "회덕동": 18,
}
ALL_DONGS = list(ZONE_PRIORITY.keys())


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
    """18개 동 전부 주문 × 다양한 기사 수 → 누락 0"""
    for n in [1, 2, 3, 4, 5, 10, 18]:
        orders = _make_orders({d: 2 for d in ALL_DONGS})
        input_ids = {o.id for o in orders}
        groups = run_dispatch(orders, list(range(1, n + 1)), ZONE_PRIORITY)
        assert _all_ids(groups) == input_ids, f"n={n} 누락 발생"
        assert len(groups) == n, f"n={n} 그룹 수 불일치"


def test_regression_legacy_groups():
    """기존 4개 동만 × 2/3/4명 → 보정된 priority로 기존 고정 그룹 동선 유지"""
    # 2명
    orders = _make_orders({d: 3 for d in ["경안동", "탄벌동", "송정동", "쌍령동"]})
    g = run_dispatch(orders, [1, 2], ZONE_PRIORITY)
    assert g[0].dongs == ["경안동", "쌍령동"]
    assert g[1].dongs == ["탄벌동", "송정동"]
    # 3명
    orders = _make_orders({d: 3 for d in ["경안동", "탄벌동", "송정동", "쌍령동"]})
    g = run_dispatch(orders, [1, 2, 3], ZONE_PRIORITY)
    assert g[0].dongs == ["경안동", "탄벌동"]
    assert g[1].dongs == ["송정동"]
    assert g[2].dongs == ["쌍령동"]
    # 4명
    orders = _make_orders({d: 3 for d in ["경안동", "탄벌동", "송정동", "쌍령동"]})
    g = run_dispatch(orders, [1, 2, 3, 4], ZONE_PRIORITY)
    assert [grp.dongs for grp in g] == [["경안동"], ["탄벌동"], ["송정동"], ["쌍령동"]]


def test_preserve_and_attach_new_dong():
    """4개 동 + 신규 1개 × 2명 → 기존 2그룹 유지 + 신규 동 최소부하 그룹 흡수, 누락 0"""
    orders = _make_orders({"경안동": 2, "탄벌동": 2, "송정동": 2, "쌍령동": 2, "고산동": 2})
    input_ids = {o.id for o in orders}
    g = run_dispatch(orders, [1, 2], ZONE_PRIORITY)
    assert _all_ids(g) == input_ids
    # 고산동이 어느 한 그룹에 포함되어야 한다
    assert any("고산동" in grp.dongs for grp in g)


def test_generic_distribution_balanced():
    """n>=5: 연속 블록 균등 분배 — 빈 기사 없이 전 동 배정"""
    orders = _make_orders({d: 1 for d in ALL_DONGS})  # 18개 동 각 1건
    input_ids = {o.id for o in orders}
    g = run_dispatch(orders, list(range(1, 6)), ZONE_PRIORITY)  # 5명
    assert _all_ids(g) == input_ids
    # 각 기사 부하가 과도하게 쏠리지 않음 (평균 3.6, 허용 범위)
    counts = sorted(len(grp.orders) for grp in g)
    assert counts[0] >= 1 and counts[-1] <= 6


def test_boundaries():
    """경계: 기사 0/19 → ValueError, 주문 없음 → 빈 그룹"""
    try:
        run_dispatch([], [], ZONE_PRIORITY)
        assert False, "기사 0명은 ValueError여야 함"
    except ValueError:
        pass
    try:
        run_dispatch([], list(range(1, 20)), ZONE_PRIORITY)
        assert False, "기사 19명은 ValueError여야 함"
    except ValueError:
        pass
    # 주문 0건 × 3명 → 빈 그룹 3개
    g = run_dispatch([], [1, 2, 3], ZONE_PRIORITY)
    assert _all_ids(g) == set()


def test_unknown_dong_not_leaked():
    """priority 매핑에 없는 동도 누락되지 않고 배정된다(999 폴백)"""
    orders = _make_orders({"경안동": 1, "없는동": 1})
    input_ids = {o.id for o in orders}
    for n in [1, 2, 5]:
        os_ = _make_orders({"경안동": 1, "없는동": 1})
        g = run_dispatch(os_, list(range(1, n + 1)), ZONE_PRIORITY)
        assert _all_ids(g) == input_ids, f"n={n} 미등록 동 누락"


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
