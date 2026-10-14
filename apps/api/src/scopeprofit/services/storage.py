"""File bytes (uploads and generated documents) stored in PostgreSQL.

Serverless deployments have no persistent disk; keeping the bytes next to the rows that reference
them also makes database backups complete. Images are capped at 10 MB and documents are small.
"""

import hashlib
from dataclasses import dataclass
from pathlib import PurePosixPath

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from scopeprofit.db.models import StoredObject
from scopeprofit.db.session import Database
from scopeprofit.errors import DomainError, ErrorCode, not_found

MAX_TEXT_BYTES = 1024 * 1024


@dataclass(frozen=True)
class StoredArtifact:
    path: str
    checksum: str
    size: int

    def to_json(self) -> dict[str, object]:
        return {"path": self.path, "checksum": self.checksum, "size": self.size}


def _check_path(relative: str) -> str:
    path = PurePosixPath(relative)
    if not relative or path.is_absolute() or ".." in path.parts or str(path) in {"", "."}:
        raise DomainError(ErrorCode.invalid_file_path, "Invalid file path")
    return str(path)


class Storage:
    def __init__(self, db: Database) -> None:
        self.db = db

    async def write(self, relative: str, content: bytes, session: AsyncSession | None = None) -> StoredArtifact:
        """Upserts the object; inside `session` it commits with the caller's transaction."""
        path = _check_path(relative)
        artifact = StoredArtifact(path, hashlib.sha256(content).hexdigest(), len(content))
        statement = insert(StoredObject).values(
            path=path, content=content, checksum=artifact.checksum, size=artifact.size
        )
        statement = statement.on_conflict_do_update(
            index_elements=[StoredObject.path],
            set_={"content": content, "checksum": artifact.checksum, "size": artifact.size},
        )
        if session is not None:
            await session.execute(statement)
            return artifact
        async with self.db.session() as own:
            await own.execute(statement)
            await own.commit()
        return artifact

    async def read(self, relative: str, session: AsyncSession | None = None) -> bytes:
        path = _check_path(relative)
        query = select(StoredObject.content).where(StoredObject.path == path)
        if session is not None:
            content = await session.scalar(query)
        else:
            async with self.db.session() as own:
                content = await own.scalar(query)
        if content is None:
            raise not_found(ErrorCode.document_not_found, "Stored file not found")
        return bytes(content)


def validate_text(text: str) -> str:
    """Client text is stored verbatim: non-empty, at most 1 MB, no NUL bytes."""
    if not text.strip() or len(text.encode()) > MAX_TEXT_BYTES or "\0" in text:
        raise DomainError(ErrorCode.invalid_text, "Text must contain between 1 byte and 1 MB")
    return text
