from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_ip(request: Request) -> str:
    """nginx 프록시 뒤에서 실제 클라이언트 IP로 레이트리밋을 건다.
    기본 get_remote_address는 프록시(컨테이너) IP를 반환해 모든 사용자가
    하나의 버킷을 공유하므로, X-Forwarded-For의 첫 IP를 우선 사용한다."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip)
