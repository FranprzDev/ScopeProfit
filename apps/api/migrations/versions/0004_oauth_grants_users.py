"""OAuth grants linked to users, self-signup passwords and per-user document branding.

- `users.password_hash` (scrypt) lets people sign up on the OAuth consent page; `users.branding`
  (JSONB) stores the brand, tagline, colors and cover title used in their documents.
- `oauth_grants` is one user's consent for one OAuth client: every code, access and refresh token
  of that consent belongs to it, so revoking the grant (refresh-token reuse, explicit revocation or
  revoking the API key used to consent) revokes the whole token family at once.
- Tokens minted by the removed NestJS server referenced API keys only; they are deleted, so those
  clients re-run the OAuth flow once.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("branding", postgresql.JSONB(), nullable=True))
    op.create_table(
        "oauth_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("client_id", sa.Text(), sa.ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "api_key_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column("resource", sa.Text(), nullable=False),
        sa.Column("scopes", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("revoked_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("oauth_grants_user_id_idx", "oauth_grants", ["user_id"])
    op.create_index("oauth_grants_api_key_id_idx", "oauth_grants", ["api_key_id"])
    op.execute('DELETE FROM "oauth_tokens"')
    op.drop_constraint("oauth_tokens_api_key_id_fkey", "oauth_tokens", type_="foreignkey")
    op.drop_index("oauth_tokens_api_key_id_idx", table_name="oauth_tokens")
    op.drop_column("oauth_tokens", "api_key_id")
    op.add_column(
        "oauth_tokens",
        sa.Column(
            "grant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("oauth_grants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index("oauth_tokens_grant_id_idx", "oauth_tokens", ["grant_id"])


def downgrade() -> None:
    op.drop_index("oauth_tokens_grant_id_idx", table_name="oauth_tokens")
    op.drop_column("oauth_tokens", "grant_id")
    op.execute('DELETE FROM "oauth_tokens"')
    op.add_column("oauth_tokens", sa.Column("api_key_id", postgresql.UUID(as_uuid=True), nullable=False))
    op.create_index("oauth_tokens_api_key_id_idx", "oauth_tokens", ["api_key_id"])
    op.create_foreign_key(
        "oauth_tokens_api_key_id_fkey", "oauth_tokens", "api_keys", ["api_key_id"], ["id"], ondelete="CASCADE"
    )
    op.drop_index("oauth_grants_api_key_id_idx", table_name="oauth_grants")
    op.drop_index("oauth_grants_user_id_idx", table_name="oauth_grants")
    op.drop_table("oauth_grants")
    op.drop_column("users", "branding")
    op.drop_column("users", "password_hash")
