"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str

    # Redis
    redis_url: str
    
    # TMDB
    tmdb_read_access_token: str = ""

    # Groq (NEW - replaces anthropic_api_key)
    groq_api_key: str

    # App
    app_env: str = "development"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60


settings = Settings()
