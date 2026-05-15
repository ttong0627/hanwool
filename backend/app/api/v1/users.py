from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_admin_or_receiver
from app.core.database import get_db
from app.core.security import decrypt_field, encrypt_field, hash_password, hash_phone
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["사용자"])


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
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin_or_receiver)):
    phone_hash = hash_phone(data.phone)
    existing = await db.execute(select(User).where(User.phone_hash == phone_hash))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="이미 등록된 전화번호입니다.")
    user = User(
        name_enc=encrypt_field(data.name),
        phone_enc=encrypt_field(data.phone),
        phone_hash=phone_hash,
        role=data.role,
        dong=data.dong,
        address_enc=encrypt_field(data.address) if data.address else None,
        password_hash=hash_password(data.password) if data.password else None,
    )
    db.add(user)
    await db.flush()
    return _to_out(user)


@router.get("/", response_model=list[UserOut])
async def list_users(role: str = None, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    q = select(User).where(User.deleted_at == None, User.is_active == True)
    if role:
        q = q.where(User.role == role)
    result = await db.execute(q)
    return [_to_out(u) for u in result.scalars().all()]


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return _to_out(current_user)


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin_or_receiver)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return _to_out(user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, data: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin_or_receiver)):
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


@router.get("/search/phone")
async def search_by_phone(phone: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin_or_receiver)):
    phone_hash = hash_phone(phone)
    result = await db.execute(select(User).where(User.phone_hash == phone_hash, User.role == "customer"))
    user = result.scalar_one_or_none()
    if not user:
        return None
    return _to_out(user)
