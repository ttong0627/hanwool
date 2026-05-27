"""
장날 / 접수 시간 유틸리티
경안시장 장날: 매월 3·8·13·18·23·28일
접수 시간: 장날 11:00 ~ 15:00 (KST)
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
MARKET_DAYS = {3, 8, 13, 18, 23, 28}


def today_kst() -> date:
    """서버 timezone과 무관하게 한국 기준 오늘 날짜를 반환"""
    return datetime.now(KST).date()
RECEPTION_START_HOUR = 11
RECEPTION_END_HOUR = 15


def is_market_day(d: date | None = None) -> bool:
    if d is None:
        d = datetime.now(KST).date()
    return d.day in MARKET_DAYS


def is_reception_open(dt: datetime | None = None) -> bool:
    if dt is None:
        dt = datetime.now(KST)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)
    if not is_market_day(dt.date()):
        return False
    return RECEPTION_START_HOUR <= dt.hour < RECEPTION_END_HOUR


def get_next_market_day(from_date: date | None = None) -> date:
    if from_date is None:
        from_date = datetime.now(KST).date()
    d = from_date
    for _ in range(35):
        d += timedelta(days=1)
        if d.day in MARKET_DAYS:
            return d
    return from_date


def market_day_status(dt: datetime | None = None) -> dict:
    if dt is None:
        dt = datetime.now(KST)
    today = dt.date()
    is_today = is_market_day(today)
    reception = is_reception_open(dt)

    if is_today:
        if reception:
            minutes_left = (RECEPTION_END_HOUR - dt.hour) * 60 - dt.minute
            return {
                "is_market_day": True,
                "reception_open": True,
                "message": f"접수 중 (마감까지 {minutes_left}분)",
                "next_market_date": None,
                "days_until_next": 0,
            }
        elif dt.hour < RECEPTION_START_HOUR:
            minutes_until = (RECEPTION_START_HOUR - dt.hour) * 60 - dt.minute
            return {
                "is_market_day": True,
                "reception_open": False,
                "message": f"장날 — 접수 시작까지 {minutes_until}분",
                "next_market_date": None,
                "days_until_next": 0,
            }
        else:
            return {
                "is_market_day": True,
                "reception_open": False,
                "message": "장날 — 접수 마감",
                "next_market_date": None,
                "days_until_next": 0,
            }

    next_d = get_next_market_day(today)
    days = (next_d - today).days
    return {
        "is_market_day": False,
        "reception_open": False,
        "message": f"다음 장날 D-{days} ({next_d.strftime('%m/%d')})",
        "next_market_date": next_d.isoformat(),
        "days_until_next": days,
    }
