from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class UserCreate(BaseModel):
    name: str
    phone: str
    role: str = "customer"
    dong: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < 8:
            raise ValueError("비밀번호는 최소 8자 이상이어야 합니다")
        return v

    @field_validator("name")
    @classmethod
    def name_max_length(cls, v: str) -> str:
        if len(v) > 50:
            raise ValueError("이름은 50자를 초과할 수 없습니다")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v: str) -> str:
        if len(v) > 20:
            raise ValueError("전화번호 형식이 올바르지 않습니다")
        return v


class UserUpdate(BaseModel):
    name: Optional[str] = None
    dong: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordResetRequest(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("비밀번호는 최소 8자 이상이어야 합니다")
        return v


class RoleChangeRequest(BaseModel):
    role: str


class UserOut(BaseModel):
    id: int
    name: str
    phone: str
    role: str
    dong: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    phone: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut
