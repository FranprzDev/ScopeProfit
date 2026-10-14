"""Stateless Streamable HTTP endpoint for the MCP server at `/api/mcp`.

Each request authenticates its bearer token (OAuth access token or API key), then runs on a brand new
`StreamableHTTPSessionManager` in stateless JSON mode that lives only for that request, so nothing is
kept in memory between requests and any serverless instance can answer any call. Unauthenticated
requests get `401` with a `WWW-Authenticate` header pointing at the protected resource metadata.
"""

import json
from http import HTTPStatus

from mcp.server.mcpserver import MCPServer
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.types import Receive, Scope, Send

from scopeprofit.container import Services
from scopeprofit.enums import OAuthError
from scopeprofit.errors import DomainError
from scopeprofit.mcp_server.tools import current_principal
from scopeprofit.services.oauth import www_authenticate


def bearer_token(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            kind, _, token = value.decode("latin-1").partition(" ")
            if kind.lower() == "bearer" and token.strip():
                return token.strip()
    return None


class McpEndpoint:
    """ASGI app mounted at `/api/mcp`."""

    def __init__(self, services: Services, server: MCPServer) -> None:
        self.services = services
        self.server = server

    async def _unauthorized(self, send: Send, error: OAuthError | None, description: str) -> None:
        body = json.dumps(
            {"error": (error or OAuthError.invalid_request).value, "error_description": description}
        ).encode()
        challenge = www_authenticate(self.services.oauth.config, error, description if error else None)
        await send(
            {
                "type": "http.response.start",
                "status": HTTPStatus.UNAUTHORIZED,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"www-authenticate", challenge.encode()),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        token = bearer_token(scope)
        if token is None:
            await self._unauthorized(send, None, "Connect your ScopeProfit account (OAuth) or send an API key")
            return
        try:
            principal = await self.services.authenticate(token)
        except DomainError:
            await self._unauthorized(send, OAuthError.invalid_token, "The token is invalid, expired or revoked")
            return
        manager = StreamableHTTPSessionManager(
            # The SDK only exposes the low-level server through this attribute; a manager per request
            # (instead of `streamable_http_app()`'s single long-lived one) is what keeps this stateless.
            app=self.server._lowlevel_server,
            stateless=True,
            json_response=True,
        )
        reset = current_principal.set(principal)
        try:
            async with manager.run():
                await manager.handle_request(scope, receive, send)
        finally:
            current_principal.reset(reset)
