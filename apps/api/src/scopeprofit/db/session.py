"""Async engine and session factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from enum import StrEnum
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool


class DatabasePool(StrEnum):
    """`queue`: a long-lived process keeps a connection pool. `null`: serverless functions open one
    connection per request (use the provider's pooled URL, e.g. Neon `-pooler`)."""

    queue = "queue"
    null = "null"


class Database:
    def __init__(self, url: str, pool: DatabasePool = DatabasePool.queue) -> None:
        if pool is DatabasePool.null:
            # PgBouncer transaction pooling cannot keep prepared statements across transactions.
            self.engine: AsyncEngine = create_async_engine(
                url,
                poolclass=NullPool,
                connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
            )
        else:
            self.engine = create_async_engine(url, pool_pre_ping=True)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.sessions() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()


_UNSUPPORTED_QUERY = {"channel_binding"}


def to_async_url(url: str) -> str:
    """`postgres://` / `postgresql://` URLs (Neon, Vercel Postgres, Render) for asyncpg."""
    for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql+asyncpg://" + url.removeprefix(prefix)
            break
    parts = urlsplit(url)
    query = [
        ("ssl" if key == "sslmode" else key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key not in _UNSUPPORTED_QUERY
    ]
    return urlunsplit(parts._replace(query=urlencode(query)))
