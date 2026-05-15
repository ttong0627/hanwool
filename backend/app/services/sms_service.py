"""
SMS 알림 서비스
실제 문자 발송은 기사 앱(expo-sms)에서 기기 데이터로 직접 전송.
백엔드는 SMS 내용 템플릿만 제공하고 로그를 기록함.
"""
from app.core.security import decrypt_field

SMS_TEMPLATES = {
    "assigned": "[경안시장 배송] {name}님, 배송기사가 배정되었습니다. 곧 출발할 예정입니다.",
    "in_transit": "[경안시장 배송] {name}님, 배송기사가 출발했습니다. 도착 예정: {eta}",
    "delivered": "[경안시장 배송] {name}님, 배달이 완료되었습니다. 경안시장을 이용해 주셔서 감사합니다.",
    "cancelled": "[경안시장 배송] {name}님, 주문이 취소되었습니다. 문의: 경안시장 배송센터",
    "delayed": "[경안시장 배송] {name}님, 배송이 지연되고 있습니다. 담당자가 곧 연락드리겠습니다.",
    "complaint_received": "[경안시장 배송] {name}님, 민원이 접수되었습니다. 빠르게 처리하겠습니다.",
    "complaint_resolved": "[경안시장 배송] {name}님, 민원이 처리되었습니다. 결과: {result}",
}


def get_sms_message(status: str, name: str, eta: str = "30분 이내", result: str = "") -> str:
    """기사 앱이 직접 발송할 SMS 내용 반환"""
    template = SMS_TEMPLATES.get(status, "")
    if not template:
        return ""
    return template.format(name=name, eta=eta, result=result)


async def notify_order_status(order, status: str, eta: str = "30분 이내") -> bool:
    """
    실제 발송은 기사 앱에서 수행.
    백엔드는 로그 기록 역할만 함.
    """
    phone = decrypt_field(order.customer_phone_enc)
    name = decrypt_field(order.customer_name_enc)
    message = get_sms_message(status, name, eta)
    if message:
        print(f"[SMS 대기 - 기기에서 발송] → {phone}: {message}")
    return True
