"""Users, API keys and the authenticated principal."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from http import HTTPStatus

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import ColumnElement, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from scopeprofit.db.models import ApiKey, AuditEvent, OAuthGrant, OAuthToken, User
from scopeprofit.db.session import Database
from scopeprofit.domain.branding import DEFAULT_BRANDING, Branding
from scopeprofit.enums import CredentialKind, Role
from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.security import (
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    hash_password,
    random_token,
    sha256_hex,
    utcnow,
    verify_password,
)

API_KEY_PREFIX = "sp_live_"
LAST_USED_RESOLUTION = timedelta(minutes=1)


class AuditAction(StrEnum):
    project_created = "project_created"
    project_archived = "project_archived"
    input_added = "mcp.input_added"
    brief_updated = "brief.updated"
    document_generated = "document.generated"
    document_approved = "document.approved"
    document_delivered = "document.delivered"
    change_request_created = "change_request.created"
    change_request_accepted = "change_request.accepted"
    change_request_rejected = "change_request.rejected"
    api_key_created = "api_key.created"
    api_key_revoked = "api_key.revoked"
    agent_clarification_decision = "agent_jev_clarification_decision"
    oauth_granted = "mcp.oauth_granted"
    user_signed_up = "auth.signed_up"
    user_signed_in = "auth.signed_in"
    sign_in_failed = "auth.sign_in_failed"
    branding_updated = "branding.updated"


def audit(
    session: AsyncSession,
    action: AuditAction,
    *,
    project_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    result: str = "success",
    metadata: dict[str, object] | None = None,
) -> None:
    session.add(
        AuditEvent(
            project_id=project_id,
            actor_id=str(actor_id) if actor_id else None,
            action=action.value,
            result=result,
            metadata_=metadata,
        )
    )


@dataclass(frozen=True)
class Principal:
    """Who is calling. Every project query is scoped to `user_id`."""

    user_id: uuid.UUID
    email: str | None
    kind: CredentialKind
    api_key_id: uuid.UUID | None = None
    client_id: str | None = None


class ApiKeyView(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)

    id: uuid.UUID
    label: str
    prefix: str
    last_used_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class CreatedApiKey(ApiKeyView):
    key: str


def _view(key: ApiKey) -> ApiKeyView:
    return ApiKeyView(
        id=key.id,
        label=key.label,
        prefix=key.prefix,
        last_used_at=key.last_used_at,
        revoked_at=key.revoked_at,
        created_at=key.created_at,
    )


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def revoke_grants(session: AsyncSession, condition: ColumnElement[bool]) -> None:
    """Revokes every OAuth grant matching `condition` and all of its codes and tokens."""
    now = utcnow()
    grant_ids = list(await session.scalars(select(OAuthGrant.id).where(condition)))
    if not grant_ids:
        return
    await session.execute(
        update(OAuthGrant).where(OAuthGrant.id.in_(grant_ids), OAuthGrant.revoked_at.is_(None)).values(revoked_at=now)
    )
    await session.execute(
        update(OAuthToken)
        .where(OAuthToken.grant_id.in_(grant_ids), OAuthToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def check_password(password: str) -> str:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise DomainError(
            ErrorCode.weak_password,
            f"Use a password of {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters",
        )
    return password


class Accounts:
    def __init__(self, db: Database) -> None:
        self.db = db

    async def user_by_email(self, session: AsyncSession, email: str) -> User:
        normalized = normalize_email(email)
        user = await session.scalar(select(User).where(User.email == normalized))
        if user is None:
            user = User(email=normalized, role=Role.professional)
            session.add(user)
            await session.flush()
        return user

    async def user_by_telegram_id(self, session: AsyncSession, telegram_id: str) -> User:
        user = await session.scalar(select(User).where(User.telegram_id == telegram_id))
        if user is None:
            user = User(telegram_id=telegram_id, role=Role.professional)
            session.add(user)
            await session.flush()
        return user

    async def create_key(self, session: AsyncSession, user_id: uuid.UUID, label: str) -> CreatedApiKey:
        raw = f"{API_KEY_PREFIX}{random_token()}"
        key = ApiKey(
            user_id=user_id,
            label=label.strip()[:100] or "api",
            prefix=raw[: len(API_KEY_PREFIX) + 6],
            key_hash=sha256_hex(raw),
            created_at=utcnow(),
        )
        session.add(key)
        await session.flush()
        audit(session, AuditAction.api_key_created, actor_id=user_id, metadata={"apiKeyId": str(key.id)})
        return CreatedApiKey(**_view(key).model_dump(), key=raw)

    async def list_keys(self, session: AsyncSession, user_id: uuid.UUID | None = None) -> list[ApiKeyView]:
        query = select(ApiKey).order_by(ApiKey.created_at.desc())
        if user_id is not None:
            query = query.where(ApiKey.user_id == user_id)
        return [_view(key) for key in await session.scalars(query)]

    async def revoke_key(self, session: AsyncSession, key_id: uuid.UUID, user_id: uuid.UUID | None = None) -> bool:
        """Revokes a key; with `user_id`, only that user's key. Returns whether a key changed."""
        statement = update(ApiKey).where(ApiKey.id == key_id, ApiKey.revoked_at.is_(None))
        if user_id is not None:
            statement = statement.where(ApiKey.user_id == user_id)
        result = await session.execute(statement.values(revoked_at=utcnow()))
        revoked = bool(getattr(result, "rowcount", 0))
        if revoked:
            await self.on_key_revoked(session, key_id)
            audit(session, AuditAction.api_key_revoked, actor_id=user_id, metadata={"apiKeyId": str(key_id)})
        return revoked

    async def on_key_revoked(self, session: AsyncSession, key_id: uuid.UUID) -> None:
        """OAuth grants consented with a key die with it."""
        await revoke_grants(session, OAuthGrant.api_key_id == key_id)

    async def sign_up(self, session: AsyncSession, email: str, password: str) -> Principal:
        """Self-signup with email and password. Existing accounts (with or without a password) must sign
        in instead, so nobody can claim an account created through the CLI or Telegram."""
        normalized = normalize_email(email)
        check_password(password)
        if await session.scalar(select(User.id).where(User.email == normalized)) is not None:
            raise DomainError(
                ErrorCode.account_exists,
                "An account with this email exists: sign in or use an API key",
                HTTPStatus.CONFLICT,
            )
        user = User(email=normalized, role=Role.professional, password_hash=hash_password(password))
        session.add(user)
        await session.flush()
        audit(session, AuditAction.user_signed_up, actor_id=user.id)
        return Principal(user_id=user.id, email=user.email, kind=CredentialKind.local)

    async def sign_in(self, session: AsyncSession, email: str, password: str) -> Principal:
        user = await session.scalar(select(User).where(User.email == normalize_email(email)))
        if user is None or user.password_hash is None or not verify_password(password, user.password_hash):
            raise DomainError(ErrorCode.invalid_credentials, "Wrong email or password", HTTPStatus.UNAUTHORIZED)
        audit(session, AuditAction.user_signed_in, actor_id=user.id)
        return Principal(user_id=user.id, email=user.email, kind=CredentialKind.local)

    async def set_password(self, session: AsyncSession, user_id: uuid.UUID, password: str) -> None:
        user = await session.get(User, user_id)
        if user is None:
            raise DomainError(ErrorCode.not_found, "No such user", HTTPStatus.NOT_FOUND)
        user.password_hash = hash_password(check_password(password))

    async def branding(self, user_id: uuid.UUID) -> Branding:
        async with self.db.session() as session:
            stored = await session.scalar(select(User.branding).where(User.id == user_id))
        return Branding.model_validate(stored) if stored else DEFAULT_BRANDING

    async def set_branding(self, user_id: uuid.UUID, branding: Branding | None) -> Branding:
        """Saves the user's document branding; `None` restores the ScopeProfit default."""
        async with self.db.session() as session:
            await session.execute(
                update(User).where(User.id == user_id).values(branding=branding.to_json() if branding else None)
            )
            audit(session, AuditAction.branding_updated, actor_id=user_id)
            await session.commit()
        return branding or DEFAULT_BRANDING

    async def verify_key(self, session: AsyncSession, raw: str) -> Principal:
        if not raw.startswith(API_KEY_PREFIX):
            raise DomainError(ErrorCode.invalid_api_key, status=HTTPStatus.UNAUTHORIZED)
        key = await session.scalar(
            select(ApiKey).options(joinedload(ApiKey.user)).where(ApiKey.key_hash == sha256_hex(raw))
        )
        if key is None or key.revoked_at is not None:
            raise DomainError(ErrorCode.invalid_api_key, status=HTTPStatus.UNAUTHORIZED)
        now = utcnow()
        if key.last_used_at is None or now - key.last_used_at > LAST_USED_RESOLUTION:
            key.last_used_at = now
        return Principal(user_id=key.user_id, email=key.user.email, kind=CredentialKind.api_key, api_key_id=key.id)

    async def authenticate(self, raw: str) -> Principal:
        async with self.db.session() as session:
            principal = await self.verify_key(session, raw)
            await session.commit()
            return principal
