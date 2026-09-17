"""
365일 24시간 접수·배송 유틸리티.

기존 클라이언트 호환을 위해 is_market_day, is_reception_open,
market_day_status 같은 공개 이름과 응답 필드는 유지한다.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def today_kst() -> date:
    """서버 timezone과 무관하게 한국 기준 오늘 날짜를 반환."""
    return datetime.now(KST).date()


def is_market_day(d: date | None = None) -> bool:
    """기존 API 호환용: 모든 날짜가 배송 운영일이다."""
    return True


def is_reception_open(dt: datetime | None = None) -> bool:
    """모든 날짜와 시간에 주문 접수가 가능하다."""
    return True


def get_next_market_day(from_date: date | None = None) -> date:
    """기존 API 호환용: 다음 배송 운영일(다음 날)을 반환."""
    if from_date is None:
        from_date = datetime.now(KST).date()
    return from_date + timedelta(days=1)


def market_day_status(dt: datetime | None = None) -> dict:
    """기존 응답 구조로 365일 24시간 접수 가능 상태를 반환."""
    return {
        "is_market_day": True,
        "reception_open": True,
        "message": "매일 24시간 배송 접수 중",
        "next_market_date": None,
        "days_until_next": 0,
    }
