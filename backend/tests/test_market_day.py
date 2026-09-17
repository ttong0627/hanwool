from datetime import date, datetime

from app.utils.market_day import (
    KST,
    get_next_market_day,
    is_market_day,
    is_reception_open,
    market_day_status,
)


def test_every_calendar_day_is_delivery_day():
    for sample in (
        date(2026, 9, 1),
        date(2026, 9, 3),
        date(2026, 9, 8),
        date(2026, 9, 30),
    ):
        assert is_market_day(sample) is True


def test_reception_is_open_24_hours():
    for hour, minute in ((0, 0), (10, 59), (16, 30), (23, 59)):
        current = datetime(2026, 9, 17, hour, minute, tzinfo=KST)
        assert is_reception_open(current) is True


def test_status_keeps_legacy_shape_and_reports_always_open():
    status = market_day_status(datetime(2026, 9, 17, 2, 15, tzinfo=KST))

    assert status == {
        "is_market_day": True,
        "reception_open": True,
        "message": "매일 24시간 배송 접수 중",
        "next_market_date": None,
        "days_until_next": 0,
    }


def test_next_delivery_day_is_tomorrow_for_legacy_clients():
    assert get_next_market_day(date(2026, 9, 30)) == date(2026, 10, 1)
