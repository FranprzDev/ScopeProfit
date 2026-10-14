"""SQLAlchemy models. Table, column and enum names match the schema created by the original
Prisma migrations so existing databases keep working after `alembic upgrade head`."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import ClassVar

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, LargeBinary, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from scopeprofit.enums import (
    AgentStatus,
    ChangeClassification,
    ChangeRequestStatus,
    ProjectStatus,
    Role,
)
from scopeprofit.security import utcnow

JsonObject = dict[str, object]


def pg_enum[E: StrEnum](enum: type[E], name: str) -> Enum:
    return Enum(
        enum,
        name=name,
        create_type=False,
        native_enum=True,
        values_callable=lambda members: [member.value for member in members],
    )


def timestamp() -> DateTime:
    return DateTime(timezone=False)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[object, object]] = {JsonObject: JSONB, datetime: DateTime(timezone=False)}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    telegram_id: Mapped[str | None] = mapped_column(Text, unique=True)
    role: Mapped[Role] = mapped_column(pg_enum(Role, "Role"), default=Role.professional)
    password_hash: Mapped[str | None] = mapped_column(Text)
    branding: Mapped[JsonObject | None]
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index("projects_owner_id_idx", "owner_id"),
        Index("projects_client_email_idx", "client_email"),
        Index("projects_status_idx", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    client_email: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProjectStatus] = mapped_column(pg_enum(ProjectStatus, "ProjectStatus"), default=ProjectStatus.draft)
    agent_status: Mapped[AgentStatus] = mapped_column(pg_enum(AgentStatus, "AgentStatus"), default=AgentStatus.idle)
    agent_started_at: Mapped[datetime | None] = mapped_column(timestamp())
    agent_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow, onupdate=utcnow)

    brief: Mapped["Brief | None"] = relationship(back_populates="project", lazy="raise")
    document: Mapped["Document | None"] = relationship(back_populates="project", lazy="raise")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("messages_project_id_created_at_id_idx", "project_id", "created_at", "id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    thread_id: Mapped[str] = mapped_column(Text)
    author_id: Mapped[str | None] = mapped_column(Text)
    author_role: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str | None] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)

    files: Mapped[list["File"]] = relationship(lazy="raise", order_by="File.created_at")


class File(Base):
    __tablename__ = "files"
    __table_args__ = (Index("files_project_id_idx", "project_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    path: Mapped[str] = mapped_column(Text)
    checksum: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class Brief(Base):
    __tablename__ = "briefs"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    version: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[JsonObject]
    updated_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow, onupdate=utcnow)

    project: Mapped[Project] = relationship(back_populates="brief", lazy="raise")


class BriefVersion(Base):
    __tablename__ = "brief_versions"
    __table_args__ = (UniqueConstraint("project_id", "version", name="brief_versions_project_id_version_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    data: Mapped[JsonObject]
    source: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), unique=True
    )
    current_version: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped[Project] = relationship(back_populates="document", lazy="raise")


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version", name="document_versions_document_id_version_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    brief_version: Mapped[int] = mapped_column(Integer)
    data: Mapped[JsonObject]
    editor_content: Mapped[JsonObject | None]
    status: Mapped[str] = mapped_column(Text, default="draft")
    artifacts: Mapped[JsonObject]
    approved_by: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(timestamp())
    delivered_at: Mapped[datetime | None] = mapped_column(timestamp())
    delivery_key: Mapped[str | None] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("audit_events_project_id_created_at_idx", "project_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    actor_id: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(Text)
    metadata_: Mapped[JsonObject | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class TelegramUpdate(Base):
    __tablename__ = "telegram_updates"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class TelegramState(Base):
    __tablename__ = "telegram_states"

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_id: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(timestamp())


class ChangeRequest(Base):
    __tablename__ = "change_requests"
    __table_args__ = (Index("change_requests_project_id_created_at_idx", "project_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    base_brief_version: Mapped[int] = mapped_column(Integer)
    request: Mapped[str] = mapped_column(Text)
    classification: Mapped[ChangeClassification] = mapped_column(pg_enum(ChangeClassification, "ChangeClassification"))
    status: Mapped[ChangeRequestStatus] = mapped_column(
        pg_enum(ChangeRequestStatus, "ChangeRequestStatus"), default=ChangeRequestStatus.proposed
    )
    min_hours: Mapped[int | None] = mapped_column(Integer)
    max_hours: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow, onupdate=utcnow)


class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = (Index("api_keys_user_id_idx", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(Text)
    prefix: Mapped[str] = mapped_column(Text)
    key_hash: Mapped[str] = mapped_column(Text, unique=True)
    last_used_at: Mapped[datetime | None] = mapped_column(timestamp())
    revoked_at: Mapped[datetime | None] = mapped_column(timestamp())
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)

    user: Mapped[User] = relationship(lazy="raise")


class StoredObject(Base):
    __tablename__ = "stored_objects"

    path: Mapped[str] = mapped_column(Text, primary_key=True)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    checksum: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class OAuthClient(Base):
    """A dynamically registered OAuth client (RFC 7591). `data` holds its registered metadata."""

    __tablename__ = "oauth_clients"

    client_id: Mapped[str] = mapped_column(Text, primary_key=True)
    data: Mapped[JsonObject]
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)


class OAuthGrant(Base):
    """One user's consent for one client; every token of that consent belongs to it."""

    __tablename__ = "oauth_grants"
    __table_args__ = (
        Index("oauth_grants_user_id_idx", "user_id"),
        Index("oauth_grants_api_key_id_idx", "api_key_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(Text, ForeignKey("oauth_clients.client_id", ondelete="CASCADE"))
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("api_keys.id", ondelete="CASCADE")
    )
    resource: Mapped[str] = mapped_column(Text)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    revoked_at: Mapped[datetime | None] = mapped_column(timestamp())
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)

    user: Mapped[User] = relationship(lazy="raise")


class OAuthToken(Base):
    """Authorization codes, access tokens and refresh tokens, stored as SHA-256 hashes only."""

    __tablename__ = "oauth_tokens"
    __table_args__ = (
        Index("oauth_tokens_grant_id_idx", "grant_id"),
        Index("oauth_tokens_expires_at_idx", "expires_at"),
    )

    token_hash: Mapped[str] = mapped_column(Text, primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    client_id: Mapped[str] = mapped_column(Text)
    grant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("oauth_grants.id", ondelete="CASCADE"))
    code_challenge: Mapped[str | None] = mapped_column(Text)
    redirect_uri: Mapped[str | None] = mapped_column(Text)
    resource: Mapped[str | None] = mapped_column(Text)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    expires_at: Mapped[datetime] = mapped_column(timestamp())
    used_at: Mapped[datetime | None] = mapped_column(timestamp())
    revoked_at: Mapped[datetime | None] = mapped_column(timestamp())
    created_at: Mapped[datetime] = mapped_column(timestamp(), default=utcnow)

    grant: Mapped[OAuthGrant] = relationship(lazy="raise")
