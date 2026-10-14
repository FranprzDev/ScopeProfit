"""Store uploads and generated documents in PostgreSQL.

Serverless hosts (Vercel) have no persistent disk, so file bytes live in `stored_objects`, keyed by
the same relative path that `files.path` and `document_versions.artifacts` reference.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stored_objects",
        sa.Column("path", sa.Text(), primary_key=True),
        sa.Column("content", postgresql.BYTEA(), nullable=False),
        sa.Column("checksum", sa.Text(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("stored_objects")
