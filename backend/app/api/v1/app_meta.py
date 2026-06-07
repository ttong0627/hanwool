"""앱 메타 정보 — 모바일 자동 업데이트용 버전 확인 (공개 엔드포인트)"""
from fastapi import APIRouter

router = APIRouter(prefix="/app", tags=["앱"])

# 새 APK를 배포할 때마다 이 버전을 올린다 (mobile/app.json version과 동일하게 유지).
# - APP_LATEST_VERSION : 최신 권장 버전(이보다 낮으면 권장 업데이트)
# - MIN_SUPPORTED_VERSION : 최소 지원 버전(이보다 낮으면 강제 업데이트, 닫기 불가)
# - APK_URL : 항상 최신 APK를 가리키는 고정 파일명(배포 시 이 파일을 최신본으로 교체)
APP_LATEST_VERSION = "1.0.34"
APK_URL = "https://ga.wssc.kr/downloads/hanwool-driver.apk"
MIN_SUPPORTED_VERSION = "1.0.31"  # ≤1.0.30(버그 있던 버전)은 강제 업데이트


@router.get("/version")
async def get_app_version():
    """모바일 앱이 시작 시 호출해 최신 버전과 비교한다."""
    return {
        "latest": APP_LATEST_VERSION,
        "apk_url": APK_URL,
        "min_supported": MIN_SUPPORTED_VERSION,
    }
