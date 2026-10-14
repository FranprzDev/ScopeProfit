"""`scopeprofit` command line: migrations and API key management."""

import argparse
import asyncio
import os
import sys
import uuid
from pathlib import Path

from alembic import command
from alembic.config import Config

from scopeprofit.db.session import Database, to_async_url
from scopeprofit.services.accounts import Accounts

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def _database() -> Database:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    return Database(to_async_url(url))


def upgrade_database() -> None:
    command.upgrade(Config(str(ALEMBIC_INI)), "head")


async def create_key(email: str | None, telegram_id: str | None, label: str) -> str:
    db = _database()
    accounts = Accounts(db)
    try:
        async with db.session() as session:
            if email:
                user = await accounts.user_by_email(session, email)
            elif telegram_id:
                user = await accounts.user_by_telegram_id(session, telegram_id)
            else:
                raise SystemExit("Pass --email or --telegram-id")
            created = await accounts.create_key(session, user.id, label)
            await session.commit()
        return (
            f"API key {created.id} ({created.label}) for user {user.id} created. "
            f"Store it now, it is not shown again:\n{created.key}\n"
        )
    finally:
        await db.dispose()


async def list_keys() -> str:
    db = _database()
    try:
        async with db.session() as session:
            keys = await Accounts(db).list_keys(session)
        lines = [
            f"{key.id}  {key.prefix}…  {key.label}  {'revoked' if key.revoked_at else 'active'}  "
            f"last used: {key.last_used_at.isoformat() if key.last_used_at else 'never'}"
            for key in keys
        ]
        return "\n".join(lines) + ("\n" if lines else "No keys.\n")
    finally:
        await db.dispose()


async def revoke_key(key_id: uuid.UUID) -> str:
    db = _database()
    try:
        async with db.session() as session:
            revoked = await Accounts(db).revoke_key(session, key_id)
            await session.commit()
        return "Revoked.\n" if revoked else "No active key with that id.\n"
    finally:
        await db.dispose()


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="scopeprofit", description="ScopeProfit backend tools")
    commands = root.add_subparsers(dest="command", required=True)
    db = commands.add_parser("db", help="Database migrations").add_subparsers(dest="action", required=True)
    db.add_parser("upgrade", help="Apply every Alembic migration (adopts Prisma-created databases)")
    keys = commands.add_parser("keys", help="API keys").add_subparsers(dest="action", required=True)
    create = keys.add_parser("create", help="Issue an API key (printed once)")
    owner = create.add_mutually_exclusive_group(required=True)
    owner.add_argument("--email")
    owner.add_argument("--telegram-id")
    create.add_argument("--label", default="api")
    keys.add_parser("list", help="List keys (no secrets)")
    revoke = keys.add_parser("revoke", help="Revoke a key and every grant made with it")
    revoke.add_argument("key_id", type=uuid.UUID)
    return root


def main(argv: list[str] | None = None) -> None:
    args = parser().parse_args(argv)
    if args.command == "db":
        upgrade_database()
        return
    if args.action == "create":
        output = asyncio.run(create_key(args.email, args.telegram_id, args.label))
    elif args.action == "list":
        output = asyncio.run(list_keys())
    else:
        output = asyncio.run(revoke_key(args.key_id))
    sys.stdout.write(output)


if __name__ == "__main__":
    main()
