import asyncio
import base64
import io
import os
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import httpx
import pytest
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from scopeprofit.api.app import create_app
from scopeprofit.cli import upgrade_database
from scopeprofit.config import Settings
from scopeprofit.container import Services, build_services
from scopeprofit.db.session import to_async_url
from scopeprofit.services.accounts import Principal
from scopeprofit.services.email import Attachment

DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("Set TEST_DATABASE_URL (or DATABASE_URL) to a disposable PostgreSQL database")
SIGNING_KEY = base64.b64encode(b"k" * 32).decode()


@dataclass
class SentEmail:
    to: str
    subject: str
    html: str
    attachments: list[Attachment]
    idempotency_key: str | None


@dataclass
class FakeEmail:
    sent: list[SentEmail] = field(default_factory=list)
    enabled: bool = True

    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        attachments: list[Attachment] | None = None,
        idempotency_key: str | None = None,
    ) -> str:
        self.sent.append(SentEmail(to, subject, html, attachments or [], idempotency_key))
        return f"msg-{len(self.sent)}"


async def reset_schema(url: str) -> None:
    engine = create_async_engine(to_async_url(url))
    async with engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


@pytest.fixture(scope="session")
def migrated() -> None:
    assert DATABASE_URL
    asyncio.run(reset_schema(DATABASE_URL))
    os.environ["DATABASE_URL"] = DATABASE_URL
    upgrade_database()


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": DATABASE_URL,
        "public_api_url": "http://testserver",
        "signing_key": SIGNING_KEY,
        "database_pool": "queue",
        "agent_mode": "off",
        "api_rate_limit_per_minute": 10_000,
    }
    values.update(overrides)
    return Settings.model_validate(values)


@pytest.fixture(scope="session")
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def email() -> FakeEmail:
    return FakeEmail()


@pytest.fixture
async def services(migrated: None, settings: Settings, email: FakeEmail) -> AsyncIterator[Services]:
    built = build_services(settings, email=email)
    yield built
    await built.close()


@pytest.fixture
async def client(services: Services, settings: Settings) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(settings, services, start_worker=False)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as http,
    ):
        yield http


@dataclass(frozen=True)
class Account:
    principal: Principal
    key: str

    @property
    def headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self.key}"}


async def new_account(services: Services, email: str | None = None) -> Account:
    async with services.db.session() as session:
        user = await services.accounts.user_by_email(session, email or f"{uuid.uuid4().hex}@example.com")
        created = await services.accounts.create_key(session, user.id, "test")
        await session.commit()
    return Account(await services.accounts.authenticate(created.key), created.key)


@pytest.fixture
async def account(services: Services) -> Account:
    return await new_account(services)


def png_bytes(size: tuple[int, int] = (4, 4), image_format: str = "PNG") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buffer, format=image_format)
    return buffer.getvalue()


@pytest.fixture
def png() -> bytes:
    return png_bytes()
