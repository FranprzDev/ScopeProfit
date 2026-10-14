"""Runtime configuration, read from the environment only.

Required values have no defaults: a missing `DATABASE_URL`, `PUBLIC_API_URL`, `SIGNING_KEY`,
`DATABASE_POOL` or `AGENT_MODE` stops the process at startup. Optional integrations (Brevo, AI Gateway, Telegram)
are disabled when their variables are absent and report a typed configuration error when used.
"""

import base64
import binascii
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from scopeprofit.db.session import DatabasePool, to_async_url
from scopeprofit.enums import AgentMode


def _strip_trailing_slash(value: str) -> str:
    return value.rstrip("/")


PublicUrl = Annotated[str, AfterValidator(_strip_trailing_slash)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    database_url: SecretStr
    public_api_url: PublicUrl = Field(
        description="Public HTTPS origin of this API. MCP lives at {PUBLIC_API_URL}/api/mcp."
    )
    signing_key: SecretStr = Field(description="32 random bytes, base64. Signs export links and OAuth state.")
    database_pool: DatabasePool = Field(description="`null` on serverless (Vercel), `queue` on servers.")
    agent_mode: AgentMode = Field(description="`inline` on Vercel, `worker` on long-lived servers.")

    trust_proxy_hops: int = Field(default=0, ge=0, le=10)
    api_rate_limit_per_minute: int = Field(default=120, ge=1)
    export_url_ttl_minutes: int = Field(default=60, ge=1, le=7 * 24 * 60)
    cors_allowed_origins: str = Field(
        default="", description="Comma-separated origins allowed to call the REST API from browsers."
    )

    brevo_api_key: SecretStr | None = None
    brevo_sender_email: str | None = None
    brevo_sender_name: str | None = None

    ai_gateway_api_key: SecretStr | None = Field(
        default=None, description="Optional on Vercel: without it the deployment's OIDC token is used."
    )
    ai_model: str | None = Field(default=None, description="AI Gateway model id, e.g. google/gemini-...")
    agent_poll_seconds: float = Field(default=2.0, gt=0)
    cron_secret: SecretStr | None = Field(default=None, description="Bearer secret for POST /api/agent/run")

    allow_http_image_urls: bool = False
    allow_private_image_urls: bool = False

    @field_validator("signing_key")
    @classmethod
    def _check_signing_key(cls, value: SecretStr) -> SecretStr:
        try:
            raw = base64.b64decode(value.get_secret_value(), validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("SIGNING_KEY must be base64") from error
        if len(raw) != 32:
            raise ValueError("SIGNING_KEY must encode exactly 32 bytes")
        return value

    @field_validator("public_api_url")
    @classmethod
    def _check_public_url(cls, value: str) -> str:
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            raise ValueError("PUBLIC_API_URL must be an absolute http(s) URL")
        if parts.path not in {"", "/"} or parts.query or parts.fragment:
            raise ValueError("PUBLIC_API_URL must be an origin without path, e.g. https://api.example.com")
        return value

    @property
    def signing_key_bytes(self) -> bytes:
        return base64.b64decode(self.signing_key.get_secret_value())

    @property
    def mcp_resource(self) -> str:
        """Canonical RFC 8707 resource identifier of the MCP endpoint."""
        return f"{self.public_api_url}/api/mcp"

    @property
    def async_database_url(self) -> str:
        """`postgres://` / `postgresql://` URLs rewritten for SQLAlchemy's asyncpg driver."""
        return to_async_url(self.database_url.get_secret_value())

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    @property
    def email_enabled(self) -> bool:
        return self.brevo_api_key is not None and bool(self.brevo_sender_email)

    @property
    def agent_enabled(self) -> bool:
        return bool(self.ai_model)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
