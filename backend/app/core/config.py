from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List

_INSECURE_DEFAULTS = {
    "hanwool-secret-key-change-in-production",
    "hanwool-aes-32byte-key-change!!",
    "your-super-secret-key-change-this-in-production",
    "your-32-byte-aes-key-change-this!!",
    "change-me",
    "secret",
}


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://hanwool:hanwool1234@localhost:5432/hanwool_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str  # .env에서 반드시 설정 — 기본값 없음
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AES_KEY: str  # .env에서 반드시 설정 — 기본값 없음
    KAKAO_REST_API_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    ENVIRONMENT: str = "development"

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_strong(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY는 최소 32자 이상이어야 합니다")
        if v in _INSECURE_DEFAULTS:
            raise ValueError("SECRET_KEY가 기본 예제 값입니다 — .env에서 안전한 값으로 변경하세요")
        return v

    @field_validator("AES_KEY")
    @classmethod
    def aes_key_must_be_strong(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("AES_KEY는 최소 32자 이상이어야 합니다")
        if v in _INSECURE_DEFAULTS:
            raise ValueError("AES_KEY가 기본 예제 값입니다 — .env에서 안전한 값으로 변경하세요")
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
