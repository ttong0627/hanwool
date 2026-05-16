import base64
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    to_encode["type"] = "access"
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode["type"] = "refresh"
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def _get_aes_key() -> bytes:
    key = settings.AES_KEY.encode()
    return hashlib.sha256(key).digest()


def encrypt_field(value: str) -> str:
    if not value:
        return value
    aesgcm = AESGCM(_get_aes_key())
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, value.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt_field(encrypted: str) -> str:
    if not encrypted:
        return encrypted
    try:
        data = base64.b64decode(encrypted.encode())
        nonce, ct = data[:12], data[12:]
        aesgcm = AESGCM(_get_aes_key())
        return aesgcm.decrypt(nonce, ct, None).decode()
    except Exception:
        return ""


def hash_phone(phone: str) -> str:
    return hashlib.sha256(phone.encode()).hexdigest()
