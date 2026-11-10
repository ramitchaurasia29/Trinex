from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend-only settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Trinex API"
    environment: Literal["development", "test", "production"] = "development"
    trading_mode: Literal["paper"] = "paper"
    backend_cors_origins: str = "http://localhost:5173"
    dev_otp_preview: bool = True
    sms_provider: Literal["development", "disabled"] = "development"
    session_ttl_days: int = 30
    registration_ttl_seconds: int = 10 * 60
    otp_resend_cooldown_seconds: int = 30
    otp_phone_limit: int = 5
    otp_ip_limit: int = 20
    otp_rate_window_seconds: int = 15 * 60
    session_cookie_name: str = "trinex_session"
    registration_cookie_name: str = "trinex_registration"

    database_url: SecretStr | None = Field(default=None, validation_alias="DATABASE_URL")
    database_url_unpooled: SecretStr | None = Field(
        default=None,
        validation_alias="DATABASE_URL_UNPOOLED",
    )
    neon_branch: str | None = Field(default=None, validation_alias="NEON_BRANCH")
    neon_branch_id: str | None = Field(default=None, validation_alias="NEON_BRANCH_ID")

    upstash_redis_rest_url: SecretStr | None = Field(
        default=None,
        validation_alias="UPSTASH_REDIS_REST_URL",
    )
    upstash_redis_rest_token: SecretStr | None = Field(
        default=None,
        validation_alias="UPSTASH_REDIS_REST_TOKEN",
    )
    otp_hash_secret: SecretStr | None = Field(
        default=None,
        validation_alias="OTP_HASH_SECRET",
    )
    redis_key_prefix: str = "trinex"
    execution_poll_interval_seconds: float = 1.0
    execution_lease_seconds: int = 30
    execution_heartbeat_seconds: int = 10
    market_data_provider: Literal["mock"] = "mock"

    @model_validator(mode="after")
    def validate_auth_security(self) -> "Settings":
        if self.environment != "development" and self.dev_otp_preview:
            raise ValueError("DEV_OTP_PREVIEW may only be enabled in development")
        if self.session_ttl_days < 1:
            raise ValueError("SESSION_TTL_DAYS must be positive")
        if self.registration_ttl_seconds < 60:
            raise ValueError("REGISTRATION_TTL_SECONDS must be at least 60")
        if self.otp_resend_cooldown_seconds < 1:
            raise ValueError("OTP_RESEND_COOLDOWN_SECONDS must be positive")
        return self

    @property
    def secure_cookies(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
