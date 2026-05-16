from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    phone: str
    role: str = "customer"
    dong: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    dong: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


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
