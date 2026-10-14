"""Drop quotation/pricing (v3) and the removed web app's tables.

- Pricing, quotes and quote-based maintenance are out of the product (decision of 2026-10-14):
  `quote_milestones`, `quote_lines`, `quotes`, `rate_cards`, `maintenance_entries`,
  `maintenance_agreements` and the `QuoteStatus` / `MaintenanceStatus` enums.
- The Next.js client chat was removed (PR #96): its magic links, cookie sessions, client project
  links and admin edit nonces are no longer reachable.
- Per-user Gemini keys (`users.encrypted_api_key`) are replaced by the operator's AI Gateway key.
- LangGraph checkpoint tables created at runtime by the old agent are dropped when present.

This revision deletes data and cannot be downgraded.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DROPPED_TABLES = (
    "quote_milestones",
    "quote_lines",
    "quotes",
    "rate_cards",
    "maintenance_entries",
    "maintenance_agreements",
    "magic_links",
    "sessions",
    "project_links",
    "admin_nonces",
    "checkpoint_writes",
    "checkpoint_blobs",
    "checkpoints",
    "checkpoint_migrations",
)
DROPPED_ENUMS = ("QuoteStatus", "MaintenanceStatus")


def upgrade() -> None:
    for table in DROPPED_TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
    for enum in DROPPED_ENUMS:
        op.execute(f'DROP TYPE IF EXISTS "{enum}"')
    op.execute('ALTER TABLE "users" DROP COLUMN IF EXISTS "encrypted_api_key"')
    op.execute('ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT \'professional\'')


def downgrade() -> None:
    raise NotImplementedError("Dropped pricing and web app data cannot be restored")
