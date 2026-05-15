from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://hanwool:hanwool1234@localhost:5432/hanwool_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "hanwool-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AES_KEY: str = "hanwool-aes-32byte-key-change!!"
    KAKAO_REST_API_KEY: str = ""  # 카카오 거리 계산 API (경로 최적화용)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
