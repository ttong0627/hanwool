from datetime import date, datetime, timedelta

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


def test_reception_stays_open_across_every_date_and_hour_for_a_year():
    """내일·월말·연말을 포함해 날짜/시간 분기가 다시 생기지 않도록 고정한다."""
    start = date(2026, 9, 18)
    for day_offset in range(370):
        sample_date = start + timedelta(days=day_offset)
        assert is_market_day(sample_date) is True
        for hour in range(24):
            assert is_reception_open(
                datetime.combine(sample_date, datetime.min.time(), tzinfo=KST).replace(hour=hour)
            ) is True

    leap_day = date(2028, 2, 29)
    assert is_market_day(leap_day) is True
    assert is_reception_open(datetime(2028, 2, 29, 23, 59, tzinfo=KST)) is True


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
