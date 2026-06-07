from app.services.route_service import (
    MARKET_LOCATION,
    SEONGNAM_ANCHOR,
    _optimize_with_road_matrix,
    analyze_sequence_quality,
    haversine,
    optimize_route,
)


def _order(order_id: int, lat: float, lng: float, driver_id: int = 1) -> dict:
    return {
        "id": order_id,
        "order_no": f"T{order_id:03d}",
        "driver_id": driver_id,
        "dong": "경안동",
        "lat": lat,
        "lng": lng,
        "delivery_address": f"테스트 주소 {order_id}",
    }


def test_optimize_route_starts_near_market_and_ends_toward_seongnam():
    orders = [
        _order(1, 37.4100, 127.2520),
        _order(2, 37.4110, 127.2450),
        _order(3, 37.4130, 127.2360),
        _order(4, 37.4150, 127.2260),
        _order(5, 37.4170, 127.2150),
        _order(6, 37.4190, 127.2050),
        _order(7, 37.4210, 127.1940),
        _order(8, 37.4230, 127.1840),
    ]

    optimized = sorted(optimize_route(list(reversed(orders))), key=lambda o: o["sequence"])

    first = optimized[0]
    last = optimized[-1]
    assert first["id"] == 1
    assert haversine(
        last["lat"],
        last["lng"],
        SEONGNAM_ANCHOR["lat"],
        SEONGNAM_ANCHOR["lng"],
    ) < haversine(
        first["lat"],
        first["lng"],
        SEONGNAM_ANCHOR["lat"],
        SEONGNAM_ANCHOR["lng"],
    )
    assert haversine(first["lat"], first["lng"], MARKET_LOCATION["lat"], MARKET_LOCATION["lng"]) < 700


def test_optimize_route_keeps_no_coord_orders_at_end():
    orders = [
        _order(1, 37.4100, 127.2520),
        {"id": 2, "order_no": "T002", "driver_id": 1, "dong": "경안동", "lat": None, "lng": None},
        _order(3, 37.4150, 127.2260),
    ]

    optimized = sorted(optimize_route(orders), key=lambda o: o["sequence"])

    assert optimized[-1]["id"] == 2
    assert [o["sequence"] for o in optimized] == [1, 2, 3]


def test_analyze_sequence_quality_reports_driver_metrics():
    orders = optimize_route([
        _order(1, 37.4100, 127.2520),
        _order(2, 37.4110, 127.2450),
        _order(3, 37.4130, 127.2360),
    ])

    quality = analyze_sequence_quality(orders)

    assert quality["drivers"][0]["driver_id"] == 1
    assert quality["drivers"][0]["total"] == 3
    assert quality["drivers"][0]["avg_dist_m"] > 0


def test_road_matrix_reorders_by_actual_driving_distance():
    start = {"_route_key": "start", "lat": MARKET_LOCATION["lat"], "lng": MARKET_LOCATION["lng"]}
    end = {"_route_key": "seongnam", "lat": SEONGNAM_ANCHOR["lat"], "lng": SEONGNAM_ANCHOR["lng"]}
    orders = [
        {**_order(1, 37.4100, 127.2520), "_route_key": "o1"},
        {**_order(2, 37.4110, 127.2450), "_route_key": "o2"},
        {**_order(3, 37.4130, 127.2360), "_route_key": "o3"},
    ]
    matrix = {
        ("start", "o1"): 100,
        ("start", "o2"): 500,
        ("start", "o3"): 400,
        ("o1", "o2"): 900,
        ("o1", "o3"): 100,
        ("o3", "o2"): 100,
        ("o2", "seongnam"): 100,
        ("o3", "seongnam"): 900,
        ("o2", "o3"): 900,
    }

    ordered = _optimize_with_road_matrix(orders, matrix, start, end, seed_ordered=orders)

    assert [order["id"] for order in ordered] == [1, 3, 2]


def test_analyze_sequence_quality_detects_nearby_skip():
    orders = [
        {**_order(1, 37.4100, 127.2520), "sequence": 1},
        {**_order(2, 37.4200, 127.2200), "sequence": 2},
        {**_order(3, 37.4102, 127.2521), "sequence": 3},
    ]

    quality = analyze_sequence_quality(orders)

    assert quality["drivers"][0]["nearby_skips"][0]["at"] == "T001"
    assert quality["drivers"][0]["nearby_skips"][0]["actual_next"] == "T002"
    assert quality["drivers"][0]["nearby_skips"][0]["nearby_later"] == "T003"
