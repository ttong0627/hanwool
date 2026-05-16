from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.security import (create_access_token, create_refresh_token,
                                decrypt_field, hash_phone, verify_password, decode_token)
from app.models.user import User
from app.schemas.user import TokenResponse, UserLogin

router = APIRouter(prefix="/auth", tags=["인증"])


def _redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    phone_hash = hash_phone(data.phone)
    result = await db.execute(select(User).where(User.phone_hash == phone_hash, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash or ""):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="전화번호 또는 비밀번호가 올바르지 않습니다.")

    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    from app.schemas.user import UserOut
    user_out = UserOut(
        id=user.id,
        name=decrypt_field(user.name_enc),
        phone=decrypt_field(user.phone_enc),
        role=user.role,
        dong=user.dong,
        address=decrypt_field(user.address_enc) if user.address_enc else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user_out)


@router.post("/refresh")
async def refresh_token(token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 리프레시 토큰입니다.")

    # Redis 블랙리스트 확인
    r = _redis()
    if await r.get(f"bl:{token}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이미 사용된 토큰입니다.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다.")
    result = await db.execute(select(User).where(User.id == int(user_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")

    # 사용된 refresh 토큰 블랙리스트 등록 (토큰 만료까지 유지)
    exp = payload.get("exp", 0)
    ttl = max(1, exp - int(datetime.now(timezone.utc).timestamp()))
    await r.setex(f"bl:{token}", ttl, "1")

    # 새 토큰 발급 (rotation)
    new_access = create_access_token({"sub": str(user.id), "role": user.role})
    new_refresh = create_refresh_token({"sub": str(user.id)})
    return {"access_token": new_access, "refresh_token": new_refresh, "token_type": "bearer"}


@router.post("/logout")
async def logout(token: str):
    """리프레시 토큰을 블랙리스트에 등록해 즉시 무효화"""
    payload = decode_token(token)
    if payload and payload.get("type") == "refresh":
        exp = payload.get("exp", 0)
        ttl = max(1, exp - int(datetime.now(timezone.utc).timestamp()))
        r = _redis()
        await r.setex(f"bl:{token}", ttl, "1")
    return {"message": "로그아웃 되었습니다."}
