"""Baseline: the schema created by the six Prisma migrations of the NestJS backend.

On a database that Prisma already migrated (it has a `users` table) this revision changes nothing,
so `alembic upgrade head` adopts existing deployments. On an empty database it replays the original
Prisma SQL verbatim, which keeps both paths byte-for-byte identical.

Revision ID: 0001
Revises:
Create Date: 2026-10-14
"""

from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SQL_DIR = Path(__file__).resolve().parent.parent / "prisma_baseline"


def statements(sql: str) -> list[str]:
    lines = [line for line in sql.splitlines() if not line.strip().startswith("--")]
    return [chunk.strip() for chunk in "\n".join(lines).split(";\n") if chunk.strip().rstrip(";")]


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("users"):
        return
    for path in sorted(SQL_DIR.glob("*.sql")):
        for statement in statements(path.read_text()):
            op.execute(statement.rstrip(";"))


def downgrade() -> None:
    raise NotImplementedError("The baseline cannot be downgraded")
