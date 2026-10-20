"""Application configuration.

All runtime configuration is read from environment variables (optionally from a
`.env` file at the repository root). Secrets are never returned by the API and
are never bundled with the frontend.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

#: Environment names that are treated as a production deployment.
PRODUCTION_ENVIRONMENTS = {"production", "prod"}


def is_production(environment: str) -> bool:
    """Return whether an environment name means a production deployment."""
    return environment.strip().lower() in PRODUCTION_ENVIRONMENTS


class Settings(BaseSettings):
    """Runtime settings for the ARCH API."""

    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(__file__).resolve().parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "ARCH API"
    environment: str = Field(
        default="development", validation_alias=AliasChoices("ARCH_ENVIRONMENT", "ENVIRONMENT")
    )

    database_url: str = Field(
        default="sqlite:///./arch_dev.db",
        validation_alias=AliasChoices("DATABASE_URL", "ARCH_DATABASE_URL"),
    )
    secret_key: str = Field(
        default="change-me-local-development-only",
        validation_alias=AliasChoices("ARCH_SECRET_KEY", "SECRET_KEY"),
    )
    access_token_ttl_minutes: int = Field(
        default=720,
        validation_alias=AliasChoices("ARCH_ACCESS_TOKEN_TTL_MINUTES", "ACCESS_TOKEN_TTL_MINUTES"),
    )
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:8080,http://localhost:8090",
        validation_alias=AliasChoices("CORS_ORIGINS", "ARCH_CORS_ORIGINS"),
    )

    llm_provider: str = Field(
        default="", validation_alias=AliasChoices("LLM_PROVIDER", "ARCH_LLM_PROVIDER")
    )
    llm_api_key: str = Field(
        default="", validation_alias=AliasChoices("LLM_API_KEY", "ARCH_LLM_API_KEY")
    )
    llm_model: str = Field(default="", validation_alias=AliasChoices("LLM_MODEL", "ARCH_LLM_MODEL"))
    llm_timeout_seconds: float = 20.0

    media_root: str = Field(
        default="./var/media", validation_alias=AliasChoices("ARCH_MEDIA_ROOT", "MEDIA_ROOT")
    )

    @field_validator("secret_key")
    @classmethod
    def _reject_default_secret_in_production(cls, value: str, info) -> str:
        environment = (info.data or {}).get("environment", "development")
        if is_production(environment) and value == "change-me-local-development-only":
            raise ValueError("ARCH_SECRET_KEY must be set to a unique value in production")
        return value

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard_with_credentials(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        if "*" in origins:
            # A wildcard origin cannot be combined with credentialed requests.
            # List the explicit browser origins instead.
            raise ValueError(
                "CORS_ORIGINS must list explicit origins; '*' cannot be used with credentials"
            )
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def media_path(self) -> Path:
        path = Path(self.media_root)
        return path if path.is_absolute() else (Path.cwd() / path).resolve()

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_provider and self.llm_api_key and self.llm_model)


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings."""
    return Settings()
