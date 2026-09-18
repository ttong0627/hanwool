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
