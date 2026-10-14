"""OAuth 2.1 authorization server for MCP clients (ChatGPT, Claude, Codex, Cursor, ...).

- Discovery: RFC 8414 authorization server metadata and RFC 9728 protected resource metadata.
- Dynamic client registration (RFC 7591) for public clients (`token_endpoint_auth_method=none`).
- Authorization code + PKCE with S256 only; `iss` in every authorization response (RFC 9207).
- Resource indicators (RFC 8707): the token's audience is the MCP endpoint and is checked on use.
- Refresh tokens rotate on every use; presenting a used refresh token (or a used code) revokes the
  whole grant. Revocation (RFC 7009) of a refresh token also revokes the grant.

Every secret (codes, access and refresh tokens) is stored as a SHA-256 hash only.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from http import HTTPStatus
from typing import Annotated
from urllib.parse import urlencode, urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from scopeprofit.db.models import OAuthClient, OAuthGrant, OAuthToken
from scopeprofit.db.session import Database
from scopeprofit.enums import (
    CodeChallengeMethod,
    CredentialKind,
    OAuthError,
    OAuthGrantType,
    OAuthTokenHint,
    OAuthTokenKind,
)
from scopeprofit.security import pkce_s256, random_token, secure_equal, sha256_hex, sign_model, utcnow, verify_model
from scopeprofit.services.accounts import AuditAction, Principal, audit, revoke_grants

ACCESS_PREFIX = "sp_at_"
REFRESH_PREFIX = "sp_rt_"
CODE_PREFIX = "sp_ac_"
CLIENT_PREFIX = "sp_client_"
SCOPE = "scopeprofit"
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=30)
CODE_TTL = timedelta(minutes=10)
CONSENT_TTL = timedelta(minutes=15)
CONSENT_PURPOSE = "oauth-consent"
FORBIDDEN_REDIRECT_SCHEMES = frozenset({"javascript", "data", "file", "vbscript", "blob", "about"})
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]", "::1"})


class OAuthRequestError(Exception):
    """An OAuth error response. `redirect` is set when the error must go back to the client."""

    def __init__(
        self,
        error: OAuthError,
        description: str,
        status: HTTPStatus = HTTPStatus.BAD_REQUEST,
        *,
        redirect: str | None = None,
        state: str | None = None,
    ) -> None:
        self.error = error
        self.description = description
        self.status = status
        self.redirect = redirect
        self.state = state
        super().__init__(f"{error.value}: {description}")


def check_redirect_uri(uri: str) -> str:
    """https anywhere, http on loopback only, or a native app scheme; never fragments or script schemes."""
    parts = urlsplit(uri)
    scheme = parts.scheme.lower()
    if not scheme or parts.fragment or scheme in FORBIDDEN_REDIRECT_SCHEMES:
        raise OAuthRequestError(OAuthError.invalid_redirect_uri, f"Unsupported redirect_uri: {uri}")
    if scheme == "http" and (parts.hostname or "") not in LOOPBACK_HOSTS:
        raise OAuthRequestError(OAuthError.invalid_redirect_uri, "http redirect URIs must use a loopback host")
    if scheme in {"http", "https"} and not parts.netloc:
        raise OAuthRequestError(OAuthError.invalid_redirect_uri, f"redirect_uri needs a host: {uri}")
    return uri


class ClientRegistration(BaseModel):
    """RFC 7591 request. Only public clients are supported."""

    model_config = ConfigDict(extra="ignore")

    redirect_uris: Annotated[list[Annotated[str, Field(max_length=2_000)]], Field(min_length=1, max_length=10)]
    client_name: Annotated[str, Field(max_length=200)] = "MCP client"
    token_endpoint_auth_method: str = "none"
    grant_types: list[OAuthGrantType] = [OAuthGrantType.authorization_code, OAuthGrantType.refresh_token]
    response_types: list[str] = ["code"]
    scope: str | None = None
    client_uri: Annotated[str, Field(max_length=2_000)] | None = None
    logo_uri: Annotated[str, Field(max_length=2_000)] | None = None


class ClientInformation(BaseModel):
    client_id: str
    client_id_issued_at: int
    client_name: str
    redirect_uris: list[str]
    grant_types: list[OAuthGrantType]
    response_types: list[str]
    token_endpoint_auth_method: str
    scope: str


class PendingAuthorization(BaseModel):
    """A validated /oauth/authorize request, signed into the consent form."""

    client_id: str
    client_name: str
    redirect_uri: str
    code_challenge: str
    state: str | None
    resource: str
    scopes: list[str]
    exp: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str
    scope: str


@dataclass(frozen=True)
class OAuthConfig:
    issuer: str
    resource: str
    signing_key: bytes

    @property
    def resources(self) -> frozenset[str]:
        """Accepted RFC 8707 resource values: the MCP endpoint (canonical) and the API origin."""
        return frozenset({self.resource, self.issuer})


def authorization_server_metadata(config: OAuthConfig) -> dict[str, object]:
    return {
        "issuer": config.issuer,
        "authorization_endpoint": f"{config.issuer}/oauth/authorize",
        "token_endpoint": f"{config.issuer}/oauth/token",
        "registration_endpoint": f"{config.issuer}/oauth/register",
        "revocation_endpoint": f"{config.issuer}/oauth/revoke",
        "response_types_supported": ["code"],
        "response_modes_supported": ["query"],
        "grant_types_supported": [grant.value for grant in OAuthGrantType],
        "code_challenge_methods_supported": [method.value for method in CodeChallengeMethod],
        "token_endpoint_auth_methods_supported": ["none"],
        "revocation_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": [SCOPE],
        "authorization_response_iss_parameter_supported": True,
        "client_id_metadata_document_supported": False,
        "service_documentation": f"{config.issuer}/api/docs",
    }


def protected_resource_metadata(config: OAuthConfig) -> dict[str, object]:
    return {
        "resource": config.resource,
        "authorization_servers": [config.issuer],
        "scopes_supported": [SCOPE],
        "bearer_methods_supported": ["header"],
        "resource_name": "ScopeProfit MCP",
        "resource_documentation": f"{config.issuer}/api/docs",
    }


def www_authenticate(config: OAuthConfig, error: OAuthError | None = None, description: str | None = None) -> str:
    parts = [f'Bearer resource_metadata="{config.issuer}/.well-known/oauth-protected-resource"', f'scope="{SCOPE}"']
    if error is not None:
        parts.append(f'error="{error.value}"')
    if description is not None:
        parts.append(f'error_description="{description}"')
    return ", ".join(parts)


def redirect_with(uri: str, params: dict[str, str | None]) -> str:
    query = urlencode({key: value for key, value in params.items() if value is not None})
    return f"{uri}{'&' if urlsplit(uri).query else '?'}{query}"


class OAuthServer:
    def __init__(self, db: Database, config: OAuthConfig) -> None:
        self.db = db
        self.config = config

    # ----- registration ---------------------------------------------------------------------

    async def register(self, payload: object) -> ClientInformation:
        try:
            request = ClientRegistration.model_validate(payload)
        except ValidationError as error:
            raise OAuthRequestError(OAuthError.invalid_client_metadata, error.errors()[0]["msg"]) from error
        if request.token_endpoint_auth_method != "none":
            raise OAuthRequestError(
                OAuthError.invalid_client_metadata,
                "Only public clients (token_endpoint_auth_method=none) are supported",
            )
        if request.response_types != ["code"]:
            raise OAuthRequestError(OAuthError.invalid_client_metadata, "Only response_types=['code'] is supported")
        redirect_uris = [check_redirect_uri(uri) for uri in request.redirect_uris]
        now = utcnow()
        info = ClientInformation(
            client_id=f"{CLIENT_PREFIX}{random_token(18)}",
            client_id_issued_at=int(now.timestamp()),
            client_name=request.client_name.strip() or "MCP client",
            redirect_uris=redirect_uris,
            grant_types=request.grant_types,
            response_types=request.response_types,
            token_endpoint_auth_method="none",
            scope=SCOPE,
        )
        async with self.db.session() as session:
            session.add(OAuthClient(client_id=info.client_id, data=info.model_dump(mode="json"), created_at=now))
            await session.commit()
        return info

    async def client(self, client_id: str) -> ClientInformation | None:
        async with self.db.session() as session:
            row = await session.get(OAuthClient, client_id)
        return ClientInformation.model_validate(row.data) if row else None

    # ----- authorization --------------------------------------------------------------------

    async def validate_authorization(self, params: dict[str, str]) -> PendingAuthorization:
        """Checks an /oauth/authorize request. Errors that can't be trusted to redirect have `redirect=None`."""
        client_id = params.get("client_id", "")
        client = await self.client(client_id) if client_id else None
        if client is None:
            raise OAuthRequestError(OAuthError.invalid_client, "Unknown client_id: register the client first")
        redirect_uri = params.get("redirect_uri") or (client.redirect_uris[0] if len(client.redirect_uris) == 1 else "")
        if redirect_uri not in client.redirect_uris:
            raise OAuthRequestError(OAuthError.invalid_request, "redirect_uri does not match a registered redirect URI")
        state = params.get("state")

        def fail(error: OAuthError, description: str) -> OAuthRequestError:
            return OAuthRequestError(error, description, redirect=redirect_uri, state=state)

        if params.get("response_type") != "code":
            raise fail(OAuthError.unsupported_response_type, "response_type must be code")
        challenge = params.get("code_challenge", "")
        if params.get("code_challenge_method") != CodeChallengeMethod.s256.value or not 43 <= len(challenge) <= 128:
            raise fail(OAuthError.invalid_request, "PKCE is required: code_challenge with code_challenge_method=S256")
        resource = params.get("resource") or self.config.resource
        if resource not in self.config.resources:
            raise fail(OAuthError.invalid_target, f"Unknown resource; use {self.config.resource}")
        requested = [scope for scope in (params.get("scope") or SCOPE).split() if scope]
        if any(scope != SCOPE for scope in requested):
            raise fail(OAuthError.invalid_scope, f"Supported scope: {SCOPE}")
        return PendingAuthorization(
            client_id=client.client_id,
            client_name=client.client_name,
            redirect_uri=redirect_uri,
            code_challenge=challenge,
            state=state,
            resource=resource,
            scopes=[SCOPE],
            exp=int((utcnow() + CONSENT_TTL).timestamp()),
        )

    def seal(self, pending: PendingAuthorization) -> str:
        return sign_model(self.config.signing_key, CONSENT_PURPOSE, pending)

    def unseal(self, token: str) -> PendingAuthorization:
        pending = verify_model(self.config.signing_key, CONSENT_PURPOSE, token, PendingAuthorization)
        if pending is None or pending.exp < int(utcnow().timestamp()):
            raise OAuthRequestError(OAuthError.invalid_request, "The sign-in form expired; start again")
        return pending

    def denied(self, pending: PendingAuthorization) -> str:
        return redirect_with(
            pending.redirect_uri,
            {
                "error": OAuthError.access_denied.value,
                "error_description": "The user denied access",
                "state": pending.state,
                "iss": self.config.issuer,
            },
        )

    async def grant(self, session: AsyncSession, pending: PendingAuthorization, principal: Principal) -> str:
        """Records the consent, issues a code and returns the redirect back to the client (with `iss`)."""
        grant = OAuthGrant(
            user_id=principal.user_id,
            client_id=pending.client_id,
            api_key_id=principal.api_key_id,
            resource=pending.resource,
            scopes=pending.scopes,
            created_at=utcnow(),
        )
        session.add(grant)
        await session.flush()
        code = f"{CODE_PREFIX}{random_token()}"
        session.add(
            OAuthToken(
                token_hash=sha256_hex(code),
                kind=OAuthTokenKind.code.value,
                client_id=pending.client_id,
                grant_id=grant.id,
                code_challenge=pending.code_challenge,
                redirect_uri=pending.redirect_uri,
                resource=pending.resource,
                scopes=pending.scopes,
                expires_at=utcnow() + CODE_TTL,
            )
        )
        audit(
            session,
            AuditAction.oauth_granted,
            actor_id=principal.user_id,
            metadata={"clientId": pending.client_id, "grantId": str(grant.id), "via": principal.kind.value},
        )
        return redirect_with(pending.redirect_uri, {"code": code, "state": pending.state, "iss": self.config.issuer})

    # ----- tokens ---------------------------------------------------------------------------

    async def _issue(self, session: AsyncSession, grant: OAuthGrant) -> TokenResponse:
        access = f"{ACCESS_PREFIX}{random_token()}"
        refresh = f"{REFRESH_PREFIX}{random_token()}"
        now = utcnow()
        for raw, kind, ttl in (
            (access, OAuthTokenKind.access, ACCESS_TTL),
            (refresh, OAuthTokenKind.refresh, REFRESH_TTL),
        ):
            session.add(
                OAuthToken(
                    token_hash=sha256_hex(raw),
                    kind=kind.value,
                    client_id=grant.client_id,
                    grant_id=grant.id,
                    resource=grant.resource,
                    scopes=grant.scopes,
                    expires_at=now + ttl,
                    created_at=now,
                )
            )
        return TokenResponse(
            access_token=access,
            expires_in=int(ACCESS_TTL.total_seconds()),
            refresh_token=refresh,
            scope=" ".join(grant.scopes),
        )

    @staticmethod
    async def revoke_grant(session: AsyncSession, grant_id: uuid.UUID) -> None:
        await revoke_grants(session, OAuthGrant.id == grant_id)

    async def _consume(
        self, session: AsyncSession, raw: str, kind: OAuthTokenKind, client_id: str
    ) -> tuple[OAuthToken, OAuthGrant]:
        """Single-use tokens (codes, refresh tokens): a second use revokes the whole grant."""
        token = await session.scalar(
            select(OAuthToken)
            .options(joinedload(OAuthToken.grant))
            .where(OAuthToken.token_hash == sha256_hex(raw), OAuthToken.kind == kind.value)
            .with_for_update(of=OAuthToken)
        )
        if token is None or token.client_id != client_id:
            raise OAuthRequestError(OAuthError.invalid_grant, f"Unknown {kind.value}")
        if token.used_at is not None:
            await self.revoke_grant(session, token.grant_id)
            await session.commit()
            raise OAuthRequestError(OAuthError.invalid_grant, f"{kind.value} reuse detected: the grant was revoked")
        if token.revoked_at is not None or token.grant.revoked_at is not None:
            raise OAuthRequestError(OAuthError.invalid_grant, "The grant was revoked")
        if token.expires_at <= utcnow():
            raise OAuthRequestError(OAuthError.invalid_grant, f"Expired {kind.value}")
        token.used_at = utcnow()
        return token, token.grant

    async def token(self, form: dict[str, str]) -> TokenResponse:
        try:
            grant_type = OAuthGrantType(form.get("grant_type", ""))
        except ValueError as error:
            raise OAuthRequestError(
                OAuthError.unsupported_grant_type, "Use authorization_code or refresh_token"
            ) from error
        client_id = form.get("client_id", "")
        if not client_id or await self.client(client_id) is None:
            raise OAuthRequestError(OAuthError.invalid_client, "Unknown client_id", HTTPStatus.UNAUTHORIZED)
        resource = form.get("resource")
        async with self.db.session() as session:
            if grant_type is OAuthGrantType.authorization_code:
                code, grant = await self._consume(session, form.get("code", ""), OAuthTokenKind.code, client_id)
                if code.redirect_uri != form.get("redirect_uri", code.redirect_uri):
                    raise OAuthRequestError(
                        OAuthError.invalid_grant, "redirect_uri does not match the authorization request"
                    )
                verifier = form.get("code_verifier", "")
                if not 43 <= len(verifier) <= 128 or not secure_equal(pkce_s256(verifier), code.code_challenge or ""):
                    raise OAuthRequestError(OAuthError.invalid_grant, "PKCE verification failed")
            else:
                _refresh, grant = await self._consume(
                    session, form.get("refresh_token", ""), OAuthTokenKind.refresh, client_id
                )
            if resource is not None and resource != grant.resource:
                raise OAuthRequestError(OAuthError.invalid_target, "resource does not match the grant")
            issued = await self._issue(session, grant)
            await session.commit()
        return issued

    async def revoke(self, form: dict[str, str]) -> None:
        """RFC 7009: always succeeds for unknown tokens. Refresh tokens revoke their whole grant."""
        raw = form.get("token", "")
        if not raw:
            raise OAuthRequestError(OAuthError.invalid_request, "token is required")
        hint = form.get("token_type_hint")
        if hint is not None and hint not in {member.value for member in OAuthTokenHint}:
            hint = None
        async with self.db.session() as session:
            token = await session.scalar(select(OAuthToken).where(OAuthToken.token_hash == sha256_hex(raw)))
            if token is None or token.client_id != form.get("client_id", token.client_id):
                return
            if token.kind == OAuthTokenKind.refresh.value:
                await self.revoke_grant(session, token.grant_id)
            else:
                token.revoked_at = utcnow()
            await session.commit()

    async def verify_access(self, raw: str) -> Principal | None:
        """The owner of a live access token minted for this server, or None."""
        if not raw.startswith(ACCESS_PREFIX):
            return None
        async with self.db.session() as session:
            token = await session.scalar(
                select(OAuthToken)
                .options(joinedload(OAuthToken.grant).joinedload(OAuthGrant.user))
                .where(OAuthToken.token_hash == sha256_hex(raw), OAuthToken.kind == OAuthTokenKind.access.value)
            )
        if (
            token is None
            or token.revoked_at is not None
            or token.grant.revoked_at is not None
            or token.expires_at <= utcnow()
            or token.resource not in self.config.resources
        ):
            return None
        return Principal(
            user_id=token.grant.user_id,
            email=token.grant.user.email,
            kind=CredentialKind.oauth,
            api_key_id=token.grant.api_key_id,
            client_id=token.client_id,
        )
