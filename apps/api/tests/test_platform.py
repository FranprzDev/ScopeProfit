import asyncio
import base64
import json
import os
import uuid
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from scopeprofit import cli
from scopeprofit.api.app import create_app
from scopeprofit.api.middleware import FixedWindowLimiter, client_ip
from scopeprofit.config import Settings
from scopeprofit.container import Services, build_services
from scopeprofit.db.session import to_async_url
from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.services.email import Attachment, BrevoEmail
from scopeprofit.services.storage import Storage, validate_text
from tests.conftest import DATABASE_URL, FakeEmail, make_settings, new_account

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations" / "prisma_baseline"


def test_settings_validation() -> None:
    settings = make_settings(public_api_url="https://api.example.com/", cors_allowed_origins="https://a.com/, ")
    assert settings.public_api_url == "https://api.example.com"
    assert settings.cors_origins == ["https://a.com"]
    assert not settings.email_enabled
    assert not settings.agent_enabled
    for bad in (
        {"signing_key": "short"},
        {"signing_key": "!!"},
        {"public_api_url": "https://x.com/api"},
        {"public_api_url": "ftp://x"},
    ):
        with pytest.raises(ValidationError):
            make_settings(**bad)
    assert to_async_url("postgres://u@h/db?sslmode=require&channel_binding=require") == (
        "postgresql+asyncpg://u@h/db?ssl=require"
    )
    assert to_async_url("postgresql+asyncpg://u@h/db") == "postgresql+asyncpg://u@h/db"


def test_client_ip_honours_trusted_proxy_hops() -> None:
    scope = {"client": ("10.0.0.1", 1), "headers": [(b"x-forwarded-for", b"1.1.1.1, 2.2.2.2")]}
    assert client_ip(scope, 0) == "10.0.0.1"
    assert client_ip(scope, 1) == "2.2.2.2"
    assert client_ip(scope, 2) == "1.1.1.1"
    assert client_ip(scope, 5) == "1.1.1.1"
    assert client_ip({"headers": []}, 1) == "unknown"


def test_fixed_window_limiter() -> None:
    limiter = FixedWindowLimiter(2, 60)
    assert limiter.hit("a", 0) is None
    assert limiter.hit("a", 1) is None
    assert limiter.hit("a", 2) == 58
    assert limiter.hit("b", 2) is None
    assert limiter.hit("a", 61) is None


async def test_rate_limit_returns_429(services: Services, settings: Settings) -> None:
    app = create_app(settings.model_copy(update={"api_rate_limit_per_minute": 2}), services, start_worker=False)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        statuses = [(await client.get("/api/projects")).status_code for _ in range(3)]
        assert statuses == [401, 401, 429]
        assert (await client.get("/api/health")).status_code == 200


async def test_cors_only_for_configured_origins(services: Services, settings: Settings) -> None:
    app = create_app(
        settings.model_copy(update={"cors_allowed_origins": "https://app.example.com"}), services, start_worker=False
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        allowed = await client.options(
            "/api/projects",
            headers={"origin": "https://app.example.com", "access-control-request-method": "GET"},
        )
        assert allowed.headers["access-control-allow-origin"] == "https://app.example.com"
        denied = await client.get("/api/health", headers={"origin": "https://evil.example.com"})
        assert "access-control-allow-origin" not in denied.headers


async def test_storage_rejects_path_traversal(services: Services) -> None:
    storage = Storage(services.db)
    stored = await storage.write("a/b.txt", b"hi")
    assert await storage.read(stored.path) == b"hi"
    assert (await storage.write("a/b.txt", b"again")).size == 5
    assert await storage.read("a/b.txt") == b"again"
    with pytest.raises(DomainError):
        await storage.read("missing/file")
    for bad in ("../x", "", "/etc/passwd", "."):
        with pytest.raises(DomainError) as error:
            await storage.write(bad, b"x")
        assert error.value.code is ErrorCode.invalid_file_path
    with pytest.raises(DomainError):
        validate_text("bad\0text")


async def test_brevo_email_payload() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201, json={"messageId": "<abc>"})

    sender = BrevoEmail("xkeysib", "noreply@scopeprofit.app", "ScopeProfit", httpx.MockTransport(handler))
    assert sender.enabled
    message_id = await sender.send("c@x.com", "Hola", "<p>x</p>", [Attachment("a.pdf", b"%PDF")], "key-1")
    assert message_id == "<abc>"
    body = json.loads(seen[0].content)
    assert seen[0].headers["api-key"] == "xkeysib"
    assert body["sender"] == {"email": "noreply@scopeprofit.app", "name": "ScopeProfit"}
    assert body["attachment"] == [{"name": "a.pdf", "content": base64.b64encode(b"%PDF").decode()}]
    assert body["headers"] == {"idempotencyKey": "key-1"}


async def test_brevo_email_errors() -> None:
    with pytest.raises(DomainError) as missing:
        await BrevoEmail(None, None, None).send("c@x.com", "s", "h")
    assert missing.value.code is ErrorCode.email_not_configured
    failing = BrevoEmail("k", "s@x.com", None, httpx.MockTransport(lambda _: httpx.Response(400)))
    with pytest.raises(DomainError) as rejected:
        await failing.send("c@x.com", "s", "h")
    assert rejected.value.code is ErrorCode.email_delivery_failed

    def boom(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(DomainError):
        await BrevoEmail("k", "s@x.com", None, httpx.MockTransport(boom)).send("c@x.com", "s", "h")


async def test_approval_without_email_configured(settings: Settings) -> None:
    local = build_services(settings, email=FakeEmail(enabled=False))
    try:
        account = await new_account(local)
        created = await local.scope.create_project(account.principal, "Sin email", "c@x.com")
        with pytest.raises(DomainError) as error:
            await local.scope.approve(account.principal, created.project_id, 1)
        assert error.value.code is ErrorCode.email_not_configured
    finally:
        await local.close()


def test_cli_key_lifecycle(migrated: None, capsys: pytest.CaptureFixture[str]) -> None:
    email = f"{uuid.uuid4().hex}@example.com"
    cli.main(["keys", "create", "--email", email, "--label", "chatgpt"])
    created = capsys.readouterr().out
    assert "sp_live_" in created
    key_id = created.split()[2]
    cli.main(["keys", "create", "--telegram-id", "123456", "--label", "bot"])
    assert "sp_live_" in capsys.readouterr().out
    cli.main(["keys", "list"])
    assert "chatgpt" in capsys.readouterr().out
    cli.main(["keys", "revoke", key_id])
    assert capsys.readouterr().out == "Revoked.\n"
    cli.main(["keys", "revoke", key_id])
    assert capsys.readouterr().out == "No active key with that id.\n"


def test_cli_requires_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL")
    with pytest.raises(SystemExit):
        cli.main(["keys", "list"])


def test_migrations_adopt_a_prisma_database(migrated: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """A database created by the old Prisma migrations upgrades in place and loses only pricing/web tables."""
    assert DATABASE_URL
    name = f"sp_adopt_{uuid.uuid4().hex[:8]}"
    admin_url = to_async_url(DATABASE_URL)

    async def prepare() -> None:
        admin = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with admin.connect() as connection:
            await connection.execute(text(f'CREATE DATABASE "{name}"'))
        await admin.dispose()
        engine = create_async_engine(_with_database(admin_url, name))
        async with engine.begin() as connection:
            for path in sorted(MIGRATIONS.glob("*.sql")):
                for statement in _statements(path.read_text()):
                    await connection.execute(text(statement))
            user = uuid.uuid4()
            await connection.execute(
                text(
                    "INSERT INTO users (id, email, role, encrypted_api_key) "
                    "VALUES (:id, 'old@x.com', 'professional', 'enc')"
                ),
                {"id": user},
            )
            await connection.execute(
                text(
                    "INSERT INTO rate_cards (id, owner_id, label, hourly_rate, updated_at) "
                    "VALUES (:id, :owner, 'std', 10, now())"
                ),
                {"id": uuid.uuid4(), "owner": user},
            )
        await engine.dispose()

    async def inspect() -> tuple[set[str], list[str], int]:
        engine = create_async_engine(_with_database(admin_url, name))
        async with engine.connect() as connection:
            tables = {
                row[0]
                for row in await connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))
            }
            columns = [
                row[0]
                for row in await connection.execute(
                    text("SELECT column_name FROM information_schema.columns WHERE table_name='users'")
                )
            ]
            users = (await connection.execute(text("SELECT count(*) FROM users"))).scalar_one()
        await engine.dispose()
        admin = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with admin.connect() as connection:
            await connection.execute(text(f'DROP DATABASE "{name}"'))
        await admin.dispose()
        return tables, columns, users

    asyncio.run(prepare())
    monkeypatch.setenv("DATABASE_URL", _with_database(DATABASE_URL, name))
    cli.main(["db", "upgrade"])
    tables, columns, users = asyncio.run(inspect())
    assert users == 1
    assert {"quotes", "rate_cards", "maintenance_agreements", "sessions", "project_links"}.isdisjoint(tables)
    assert {"projects", "briefs", "api_keys", "oauth_tokens", "alembic_version"} <= tables
    assert "encrypted_api_key" not in columns
    monkeypatch.setenv("DATABASE_URL", os.environ.get("TEST_DATABASE_URL") or DATABASE_URL)


def _with_database(url: str, name: str) -> str:
    base, _, query = url.partition("?")
    return f"{base.rsplit('/', 1)[0]}/{name}" + (f"?{query}" if query else "")


def _statements(sql: str) -> list[str]:
    lines = [line for line in sql.splitlines() if not line.strip().startswith("--")]
    return [chunk.strip().rstrip(";") for chunk in "\n".join(lines).split(";\n") if chunk.strip().rstrip(";")]
