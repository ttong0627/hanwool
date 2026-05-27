from datetime import date
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
from app.core.security import decrypt_field, encrypt_field, hash_password, hash_phone, verify_password
from app.models.user import User, UserRole
from app.schemas.user import PasswordChangeRequest, PasswordResetRequest, RoleChangeRequest, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["사용자"])

_CREATABLE_ROLES = {
    "super_admin": {"super_admin", "admin", "receiver", "driver", "customer"},
    "admin": {"receiver", "driver", "customer"},
    "receiver": {"customer"},
}

ELDERLY_AGE = 65


def _calc_age(birth_year: int) -> int:
    return date.today().year - birth_year


def _to_out(user: User) -> UserOut:
    birth_year: Optional[int] = None
    if user.birth_year_enc:
        try:
            birth_year = int(decrypt_field(user.birth_year_enc))
        except Exception:
            birth_year = None

    age = _calc_age(birth_year) if birth_year else None
    is_elderly = age is not None and age >= ELDERLY_AGE

    return UserOut(
        id=user.id,
        name=decrypt_field(user.name_enc),
        phone=decrypt_field(user.phone_enc),
        role=user.role,
        dong=user.dong,
        address=decrypt_field(user.address_enc) if user.address_enc else None,
        birth_year=birth_year,
        age=age,
        is_elderly=is_elderly,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("", response_model=UserOut, status_code=201)
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
    existing = await db.execute(
        select(User).where(User.phone_hash == phone_hash, User.deleted_at.is_(None))
    )
    dup = existing.scalar_one_or_none()
    if dup:
        role_label = {"super_admin": "최고관리자", "admin": "관리자", "receiver": "접수자",
                      "driver": "기사", "customer": "고객"}.get(dup.role, dup.role)
        raise HTTPException(
            status_code=400,
            detail=f"이미 등록된 전화번호입니다. 현재 '{role_label}' 역할로 계정이 존재합니다.",
        )

    user = User(
        name_enc=encrypt_field(data.name),
        phone_enc=encrypt_field(data.phone),
        phone_hash=phone_hash,
        role=target_role,
        dong=data.dong,
        address_enc=encrypt_field(data.address) if data.address else None,
        password_hash=hash_password(data.password) if data.password else None,
        birth_year_enc=encrypt_field(str(data.birth_year)) if data.birth_year else None,
    )
    db.add(user)
    await db.flush()
    return _to_out(user)


@router.get("", response_model=list[UserOut])
async def list_users(
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_receiver_or_above),
):
    q = select(User).where(User.deleted_at == None)
    if current_user.role == "receiver":
        q = q.where(User.role == "customer", User.is_active == True)
    elif role:
        roles = [r.strip() for r in role.split(',') if r.strip()]
        q = q.where(User.role.in_(roles)) if len(roles) > 1 else q.where(User.role == roles[0])
    result = await db.execute(q)
    return [_to_out(u) for u in result.scalars().all()]


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return _to_out(current_user)


@router.put("/me/password")
async def change_my_password(
    data: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="비밀번호가 설정되어 있지 않습니다.")
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")
    current_user.password_hash = hash_password(data.new_password)
    await db.flush()
    return {"ok": True}


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
    if data.phone:
        phone_hash = hash_phone(data.phone)
        existing = await db.execute(
            select(User).where(User.phone_hash == phone_hash, User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="이미 등록된 전화번호입니다.")
        user.phone_enc = encrypt_field(data.phone)
        user.phone_hash = phone_hash
    if data.password:
        user.password_hash = hash_password(data.password)
    if data.dong is not None:
        user.dong = data.dong
    if data.address is not None:
        user.address_enc = encrypt_field(data.address)
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.birth_year is not None:
        user.birth_year_enc = encrypt_field(str(data.birth_year))
    return _to_out(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_above),
):
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role == "super_admin":
        raise HTTPException(status_code=400, detail="총관리자 계정은 삭제할 수 없습니다.")

    from datetime import datetime, timezone

    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    return {"ok": True, "user_id": user_id}


@router.put("/{user_id}/password", response_model=UserOut)
async def reset_password(
    user_id: int,
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_above),
):
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
    valid_roles = {r.value for r in UserRole}
    if data.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 역할입니다. 가능: {valid_roles}")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user.role = data.role
    return _to_out(user)
