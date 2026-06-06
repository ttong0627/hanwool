"""
SMS 알림 서비스
실제 문자 발송은 기사 앱(expo-sms)에서 기기 데이터로 직접 전송.
백엔드는 SMS 내용 템플릿만 제공하고 로그를 기록함.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

_KST = ZoneInfo("Asia/Seoul")


def resolve_sms_recipient(actual_phone: str, message: str) -> tuple[str, str]:
    """
    테스트 SMS 리다이렉트 적용.
    settings.TEST_SMS_REDIRECT_PHONE 가 설정돼 있으면,
    실제 수신번호 대신 테스트 번호로 보내고 메시지 앞에 원래 번호를 표시한다.
    설정이 비어 있으면 원본 그대로 반환한다.
    """
    redirect = (settings.TEST_SMS_REDIRECT_PHONE or "").strip()
    if not redirect:
        return actual_phone, message
    tagged = f"[테스트 발송 / 원수신: {actual_phone}]\n{message}"
    return redirect, tagged

SMS_TEMPLATES = {
    "assigned": "[경안시장 배송] {name}님, 배송기사가 배정되었습니다. 곧 출발할 예정입니다.",
    "in_transit": "",  # 배송 출발 문자 미발송 — 완료 문자만 발송 (형 지시)
    "delivered": "[경안시장 배송] {name}님, 배달이 완료되었습니다. 경안시장을 이용해 주셔서 감사합니다.",
    "cancelled": "[경안시장 배송] {name}님, 주문이 취소되었습니다. 문의: 경안시장 배송센터",
    "delayed": "[경안시장 배송] {name}님, 배송이 지연되고 있습니다. 담당자가 곧 연락드리겠습니다.",
    "complaint_received": "[경안시장 배송] {name}님, 민원이 접수되었습니다. 빠르게 처리하겠습니다.",
    "complaint_resolved": "[경안시장 배송] {name}님, 민원이 처리되었습니다. 결과: {result}",
}


def eta_text(sequence: int | None) -> str:
    """순번 기반 보수적 도착 예정 문구. 장소(순번)마다 10분씩 여유.

    예) sequence=1 → "약 10분 후(오후 3시 40분경)", None/0 → "잠시 후"
    """
    if not sequence or sequence < 1:
        return "잠시 후"
    minutes = sequence * 10
    eta = datetime.now(_KST) + timedelta(minutes=minutes)
    ampm = "오전" if eta.hour < 12 else "오후"
    hour12 = eta.hour % 12 or 12
    clock = f"{ampm} {hour12}시경" if eta.minute == 0 else f"{ampm} {hour12}시 {eta.minute}분경"
    return f"약 {minutes}분 후({clock})"


def get_sms_message(status: str, name: str, eta: str = "30분 이내", result: str = "") -> str:
    """기사 앱이 직접 발송할 SMS 내용 반환"""
    template = SMS_TEMPLATES.get(status, "")
    if not template:
        return ""
    return template.format(name=name, eta=eta, result=result)


# 전체 출발 시 모든 고객에게 보낼 공통 문구 (이름 미포함 → 수신자별 개별 발송해도 안전)
DEPARTURE_BROADCAST = "[경안시장 배송] 주문하신 상품 배송이 출발했습니다. 잠시 후 도착 예정입니다. 경안시장 배송센터"


def build_departure_broadcast(phones: list[str]) -> tuple[list[str], str]:
    """
    전체 출발(업무 시작) 시 기사 앱이 발송할 (수신번호 목록, 메시지) 반환.
    - 테스트 리다이렉트가 설정돼 있으면 단일 테스트 번호로 축약 + 테스트 태그.
    - 운영 시에는 중복 제거한 실제 수신번호 목록을 반환(앱에서 수신자별 개별 발송 → 번호 노출 방지).
    """
    redirect = (settings.TEST_SMS_REDIRECT_PHONE or "").strip()
    if redirect:
        return [redirect], f"[테스트 발송]\n{DEPARTURE_BROADCAST}"
    seen: set[str] = set()
    recipients: list[str] = []
    for phone in phones:
        cleaned = (phone or "").strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            recipients.append(cleaned)
    return recipients, DEPARTURE_BROADCAST


def build_departure_messages(orders) -> list[dict]:
    """배송 출발 문자는 발송하지 않는다 — 완료 문자만 발송한다(형 지시).

    과거에는 전체 출발 시 주문별 출발 안내 SMS를 만들었으나, 출발 문자를 끄기로 해
    항상 빈 목록을 반환한다. (완료 문자는 사진 업로드 시 별도 경로로 발송됨)
    """
    return []


async def notify_order_status(order, status: str, eta: str = "30분 이내") -> bool:
    """
    실제 발송은 기사 앱에서 수행.
    백엔드는 상태 전환만 인지한다(개인정보는 로그에 남기지 않음).
    """
    # 전화번호·이름 등 개인정보는 로그로 출력하지 않는다(개인정보보호법 준수).
    return True
