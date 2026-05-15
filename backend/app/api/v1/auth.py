from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (create_access_token, create_refresh_token,
                                decrypt_field, hash_phone, verify_password, decode_token)
from app.models.user import User
from app.schemas.user import TokenResponse, UserLogin

router = APIRouter(prefix="/auth", tags=["인증"])


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
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
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == int(user_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")
    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}
