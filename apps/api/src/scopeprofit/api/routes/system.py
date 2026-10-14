"""Health, identity, API keys and signed exports."""

import uuid
from http import HTTPStatus

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from scopeprofit.api.deps import PrincipalDep, ServicesDep
from scopeprofit.enums import CredentialKind
from scopeprofit.errors import ErrorCode, not_found
from scopeprofit.services.accounts import ApiKeyView, CreatedApiKey

router = APIRouter(prefix="/api")


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


class Health(Model):
    status: str
    database: str


class Me(Model):
    user_id: uuid.UUID
    email: str | None
    credential: CredentialKind


class NewKey(Model):
    label: str = Field(default="api", max_length=100)


class Revoked(Model):
    revoked: bool


@router.get("/health", response_model=Health, tags=["system"])
async def health(services: ServicesDep, response: Response) -> Health:
    try:
        async with services.db.session() as session:
            await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        response.status_code = HTTPStatus.SERVICE_UNAVAILABLE
        return Health(status="degraded", database="unreachable")
    return Health(status="ok", database="ok")


@router.get("/me", response_model=Me, tags=["account"])
async def me(principal: PrincipalDep) -> Me:
    return Me(user_id=principal.user_id, email=principal.email, credential=principal.kind)


@router.get("/keys", response_model=list[ApiKeyView], tags=["account"])
async def list_keys(services: ServicesDep, principal: PrincipalDep) -> list[ApiKeyView]:
    async with services.db.session() as session:
        return await services.accounts.list_keys(session, principal.user_id)


@router.post("/keys", response_model=CreatedApiKey, status_code=status.HTTP_201_CREATED, tags=["account"])
async def create_key(services: ServicesDep, principal: PrincipalDep, body: NewKey) -> CreatedApiKey:
    """Issues an API key for the caller. The raw key is returned once; only its hash is stored."""
    async with services.db.session() as session:
        created = await services.accounts.create_key(session, principal.user_id, body.label)
        await session.commit()
    return created


@router.delete("/keys/{key_id}", response_model=Revoked, tags=["account"])
async def revoke_key(services: ServicesDep, principal: PrincipalDep, key_id: uuid.UUID) -> Revoked:
    async with services.db.session() as session:
        revoked = await services.accounts.revoke_key(session, key_id, principal.user_id)
        await session.commit()
    if not revoked:
        raise not_found(ErrorCode.api_key_not_found)
    return Revoked(revoked=True)


@router.get("/exports/{token}", response_class=Response, tags=["documents"])
async def signed_export(services: ServicesDep, token: str) -> Response:
    """Serves the expiring links returned by `export_document` / `approve_scope` (no auth header)."""
    file = await services.scope.download_signed(token)
    return Response(
        file.content,
        media_type=file.mime_type,
        headers={
            "content-disposition": f'attachment; filename="{file.filename}"',
            "cache-control": "private, no-store",
        },
    )
