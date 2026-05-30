from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.config import settings
from app.models.user import User

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다.")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == int(user_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")
    return user


def require_roles(*roles: str):
    async def check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="권한이 없습니다.")
        return user
    return check


# 역할 계층: super_admin > admin > receiver/driver > customer

# super_admin 전용 (DB 접근, 개인정보 폐기, 계정 역할 변경)
require_super_admin = require_roles("super_admin")


async def require_privacy_owner(user: User = Depends(get_current_user)):
    if user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="권한이 없습니다.")
    if settings.PRIVACY_OWNER_USER_ID is not None and user.id != settings.PRIVACY_OWNER_USER_ID:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="개인정보 관리는 지정된 최고관리자만 가능합니다.")
    return user

# admin 이상 (운영 관리: 통계, 민원, 기사 관리)
require_admin_or_above = require_roles("super_admin", "admin")

# receiver 이상 (주문 접수 + 고객 조회)
require_receiver_or_above = require_roles("super_admin", "admin", "receiver")

# driver 이상 (배송 관련)
require_driver_or_above = require_roles("super_admin", "admin", "driver")

# 스태프 전체 (고객 제외 모든 역할)
require_staff = require_roles("super_admin", "admin", "receiver", "driver")

# 하위 호환 별칭
require_admin = require_admin_or_above
require_admin_or_receiver = require_receiver_or_above
require_driver = require_driver_or_above
