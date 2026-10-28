import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from app.api.v1.deps import get_current_user, require_receiver_or_above
from app.api.v1.orders import _enforce_delivery_zone, _enforce_reception_window, router


def _route_dependency(path: str, method: str):
    route = next(
        candidate
        for candidate in router.routes
        if candidate.path == path and method in candidate.methods
    )
    return {dependency.call for dependency in route.dependant.dependencies}


def test_order_receivers_are_allowed():
    for role in ("receiver", "admin", "super_admin"):
        user = SimpleNamespace(role=role)
        assert asyncio.run(require_receiver_or_above(user)) is user


def test_non_receivers_are_rejected():
    for role in ("customer", "driver"):
        try:
            asyncio.run(require_receiver_or_above(SimpleNamespace(role=role)))
        except HTTPException as exc:
            assert exc.status_code == 403
        else:
            raise AssertionError(f"{role} role must not receive order-write permission")


def test_order_write_routes_keep_expected_auth_dependencies():
    assert require_receiver_or_above in _route_dependency("/orders/single", "POST")
    assert require_receiver_or_above in _route_dependency("/orders/batch", "POST")
    assert get_current_user in _route_dependency("/orders", "POST")


def test_reception_window_never_blocks_any_role():
    for role in ("customer", "receiver", "admin", "super_admin", "driver"):
        assert _enforce_reception_window(role) is None


def test_out_of_zone_requires_explicit_admin_override():
    outside = SimpleNamespace(service_dong="초월읍", legal_emd="초월읍")

    for role in ("customer", "receiver", "driver"):
        try:
            _enforce_delivery_zone(role, outside, "초월읍", True)
        except HTTPException as exc:
            assert exc.status_code == 403
        else:
            raise AssertionError(f"{role} must not force an out-of-zone order")

    for role in ("receiver", "admin", "super_admin"):
        try:
            _enforce_delivery_zone(role, outside, "초월읍", False)
        except HTTPException as exc:
            assert exc.status_code == 422
        else:
            raise AssertionError("out-of-zone order requires explicit override")

    for role in ("admin", "super_admin"):
        assert _enforce_delivery_zone(role, outside, "초월읍", True) is None


# ── 배정 없이 전원 조회·완료 (형 지시 2026-10-28) ────────────────────────────
# 배정된 기사만 보고·처리하던 제한을 걷어냈다. 되돌아가면 아래 시험이 깨진다.

from app.api.v1.deps import require_staff
from app.models.order import OrderStatus
from app.services.order_service import ALLOWED_TRANSITIONS, update_order_status


def test_drivers_can_read_order_lists():
    """기사도 주문 목록·오늘 배송현황을 본다 — 배정분만 보이던 제한 없음."""
    for role in ("driver", "receiver", "admin", "super_admin"):
        user = SimpleNamespace(role=role)
        assert asyncio.run(require_staff(user)) is user

    assert require_staff in _route_dependency("/orders", "GET")
    assert require_staff in _route_dependency("/orders/today/overview", "GET")


def test_unassigned_order_can_go_straight_to_delivered():
    """배정(assigned)을 거치지 않고 접수 상태에서 바로 완료할 수 있다."""
    assert OrderStatus.delivered in ALLOWED_TRANSITIONS[OrderStatus.pending]
    assert OrderStatus.delivered in ALLOWED_TRANSITIONS[OrderStatus.assigned]


class _FakeResult:
    def __init__(self, obj):
        self._obj = obj

    def scalar_one_or_none(self):
        return self._obj


class _FakeDb:
    """update_order_status 가 쓰는 만큼만 흉내 낸다."""

    def __init__(self, order):
        self._order = order
        self.added = []

    async def execute(self, _query):
        return _FakeResult(self._order)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        return None


def _run_delivery(order, driver_id, actor_role="driver"):
    db = _FakeDb(order)
    return asyncio.run(
        update_order_status(
            db,
            order.id,
            OrderStatus.delivered,
            driver_id,
            actor_user_id=driver_id,
            actor_role=actor_role,
        )
    )


def test_delivered_records_the_driver_who_completed_it():
    """미배정 주문을 완료하면 완료한 기사가 기록된다 — 누가 배송했는지 남아야 한다."""
    order = SimpleNamespace(id=1, order_no="T-1", status=OrderStatus.pending, driver_id=None)
    result = _run_delivery(order, driver_id=7)
    assert result.status == OrderStatus.delivered
    assert result.driver_id == 7
    assert result.delivered_at is not None


def test_delivered_overwrites_stale_assignment_with_actual_deliverer():
    """다른 기사에게 배정돼 있던 주문도 실제로 완료한 기사로 기록을 바꾼다."""
    order = SimpleNamespace(id=2, order_no="T-2", status=OrderStatus.in_transit, driver_id=3)
    result = _run_delivery(order, driver_id=9)
    assert result.driver_id == 9
