from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
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


require_admin = require_roles("admin")
require_admin_or_receiver = require_roles("admin", "receiver")
require_driver = require_roles("driver", "admin")
