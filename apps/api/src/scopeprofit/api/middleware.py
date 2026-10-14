"""Request ids, security headers, client IP resolution and in-memory rate limiting."""

import json
import math
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from scopeprofit.errors import ErrorCode
from scopeprofit.services.agent import vercel_oidc_token

REQUEST_ID_HEADER = b"x-request-id"


def client_ip(scope: Scope, trust_proxy_hops: int) -> str:
    """The caller's IP. Behind `trust_proxy_hops` proxies, read it from X-Forwarded-For."""
    peer = scope.get("client")
    direct = str(peer[0]) if peer else "unknown"
    if trust_proxy_hops <= 0:
        return direct
    forwarded = ""
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            forwarded = value.decode("latin-1")
    hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    if len(hops) >= trust_proxy_hops:
        return hops[-trust_proxy_hops]
    return hops[0] if hops else direct


@dataclass
class FixedWindowLimiter:
    """Counts hits per key in fixed windows. Per process: run one API instance per limit domain."""

    limit: int
    window_seconds: float
    _windows: dict[str, tuple[float, int]] = field(default_factory=dict)

    def hit(self, key: str, now: float | None = None) -> float | None:
        """Records a hit; returns seconds to wait when the key is over its limit."""
        current = time.monotonic() if now is None else now
        start, count = self._windows.get(key, (current, 0))
        if current - start >= self.window_seconds:
            start, count = current, 0
        if count >= self.limit:
            return self.window_seconds - (current - start)
        self._windows[key] = (start, count + 1)
        if len(self._windows) > 50_000:
            self._windows = {k: v for k, v in self._windows.items() if current - v[0] < self.window_seconds}
        return None


@dataclass(frozen=True)
class RateRule:
    name: str
    matches: Callable[[str, str], bool]
    limiter: FixedWindowLimiter


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, rules: list[RateRule], trust_proxy_hops: int) -> None:
        self.app = app
        self.rules = rules
        self.trust_proxy_hops = trust_proxy_hops

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        method: str = scope["method"]
        for rule in self.rules:
            if not rule.matches(method, path):
                continue
            retry = rule.limiter.hit(f"{rule.name}:{client_ip(scope, self.trust_proxy_hops)}")
            if retry is not None:
                body = json.dumps(
                    {"error": {"code": ErrorCode.rate_limited.value, "message": "Too many requests"}}
                ).encode()
                await send(
                    {
                        "type": "http.response.start",
                        "status": 429,
                        "headers": [
                            (b"content-type", b"application/json"),
                            (b"retry-after", str(math.ceil(retry)).encode()),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": body})
                return
            break
        await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    """Request id plus conservative headers on every response (pages set their own CSP)."""

    def __init__(self, app: ASGIApp, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope.get("headers", [])).get(REQUEST_ID_HEADER)
        request_id = incoming.decode("latin-1")[:100] if incoming else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                extra = [
                    (REQUEST_ID_HEADER, request_id.encode()),
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"x-frame-options", b"DENY"),
                ]
                if self.hsts:
                    extra.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                headers.extend(item for item in extra if item[0] not in present)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


class VercelOidcMiddleware:
    """Exposes the `x-vercel-oidc-token` header to AI Gateway calls made during the request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        token = None
        if scope["type"] == "http":
            for name, value in scope.get("headers", []):
                if name == b"x-vercel-oidc-token":
                    token = value.decode("latin-1")
        reset = vercel_oidc_token.set(token)
        try:
            await self.app(scope, receive, send)
        finally:
            vercel_oidc_token.reset(reset)
