from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    get_current_user,
    require_admin_or_above,
    require_receiver_or_above,
    require_super_admin,
)
from app.core.database import get_db
from app.core.security import decrypt_field, encrypt_field, hash_password, hash_phone
from app.models.user import User, UserRole
from app.schemas.user import PasswordResetRequest, RoleChangeRequest, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["사용자"])

# 역할별 생성 가능한 하위 역할 정의
_CREATABLE_ROLES = {
    "super_admin": {"super_admin", "admin", "receiver", "driver", "customer"},
    "admin": {"receiver", "driver", "customer"},
    "receiver": {"customer"},
}


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=decrypt_field(user.name_enc),
        phone=decrypt_field(user.phone_enc),
        role=user.role,
        dong=user.dong,
        address=decrypt_field(user.address_enc) if user.address_enc else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    allowed = _CREATABLE_ROLES.get(current_user.role, set())
    target_role = data.role or "customer"
    if target_role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"'{current_user.role}' 권한으로는 '{target_role}' 역할을 생성할 수 없습니다.",
        )

    phone_hash = hash_phone(data.phone)
    existing = await db.execute(select(User).where(User.phone_hash == phone_hash))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="등록에 실패했습니다.")

    user = User(
        name_enc=encrypt_field(data.name),
        phone_enc=encrypt_field(data.phone),
        phone_hash=phone_hash,
        role=target_role,
        dong=data.dong,
        address_enc=encrypt_field(data.address) if data.address else None,
        password_hash=hash_password(data.password) if data.password else None,
    )
    db.add(user)
    await db.flush()
    return _to_out(user)


@router.get("/", response_model=list[UserOut])
async def list_users(
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    q = select(User).where(User.deleted_at == None, User.is_active == True)
    # receiver는 고객 목록만 조회 가능
    if current_user.role == "receiver":
        q = q.where(User.role == "customer")
    elif role:
        q = q.where(User.role == role)
    result = await db.execute(q)
    return [_to_out(u) for u in result.scalars().all()]


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return _to_out(current_user)


@router.get("/search/phone", response_model=UserOut | None)
async def search_by_phone(
    phone: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    phone_hash = hash_phone(phone)
    result = await db.execute(
        select(User).where(User.phone_hash == phone_hash, User.role == "customer")
    )
    user = result.scalar_one_or_none()
    return _to_out(user) if user else None


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return _to_out(user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if data.name:
        user.name_enc = encrypt_field(data.name)
    if data.dong is not None:
        user.dong = data.dong
    if data.address is not None:
        user.address_enc = encrypt_field(data.address)
    if data.is_active is not None:
        user.is_active = data.is_active
    return _to_out(user)


@router.put("/{user_id}/password", response_model=UserOut)
async def reset_password(
    user_id: int,
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_above),
):
    """비밀번호 재설정 — admin 이상 전용"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.password_hash = hash_password(data.password)
    return _to_out(user)


@router.put("/{user_id}/role", response_model=UserOut)
async def change_user_role(
    user_id: int,
    data: RoleChangeRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    """역할 변경 — super_admin 전용"""
    valid_roles = {r.value for r in UserRole}
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 역할입니다. 가능: {valid_roles}")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user.role = data.role
    return _to_out(user)
