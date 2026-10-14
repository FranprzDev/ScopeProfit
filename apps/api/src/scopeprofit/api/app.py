"""FastAPI application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from scopeprofit import __version__
from scopeprofit.api.middleware import (
    FixedWindowLimiter,
    RateLimitMiddleware,
    RateRule,
    SecurityHeadersMiddleware,
    VercelOidcMiddleware,
)
from scopeprofit.api.routes import agent, projects, system
from scopeprofit.config import Settings, get_settings
from scopeprofit.container import Services, build_services
from scopeprofit.enums import AgentMode
from scopeprofit.errors import DomainError, ErrorCode

logger = logging.getLogger("scopeprofit.api")

STATUS_CODES: dict[int, ErrorCode] = {
    HTTPStatus.UNAUTHORIZED: ErrorCode.unauthenticated,
    HTTPStatus.FORBIDDEN: ErrorCode.forbidden,
    HTTPStatus.NOT_FOUND: ErrorCode.not_found,
    HTTPStatus.METHOD_NOT_ALLOWED: ErrorCode.not_found,
}


def _error(request: Request, status: int, code: ErrorCode, message: str, details: object = None) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"www-authenticate": "Bearer"} if status == HTTPStatus.UNAUTHORIZED else None
    return JSONResponse(
        {"error": {"code": code.value, "message": message, "details": details, "requestId": request_id}},
        status_code=status,
        headers=headers,
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError) -> JSONResponse:
        return _error(request, error.status, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": [str(part) for part in issue.get("loc", ())], "msg": str(issue.get("msg", ""))}
            for issue in error.errors()
        ]
        return _error(request, HTTPStatus.UNPROCESSABLE_ENTITY, ErrorCode.validation_failed, "Invalid request", details)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
        code = STATUS_CODES.get(error.status_code, ErrorCode.validation_failed)
        return _error(request, error.status_code, code, str(error.detail))

    @app.exception_handler(Exception)
    async def unexpected(request: Request, error: Exception) -> JSONResponse:
        logger.exception("request_failed", extra={"path": request.url.path})
        return _error(request, HTTPStatus.INTERNAL_SERVER_ERROR, ErrorCode.internal_error, "Unable to complete request")


def rate_rules(settings: Settings) -> list[RateRule]:
    per_minute = FixedWindowLimiter(settings.api_rate_limit_per_minute, 60)
    return [RateRule("api", lambda _method, path: path.startswith("/api/") and path != "/api/health", per_minute)]


def create_app(
    settings: Settings | None = None,
    services: Services | None = None,
    *,
    start_worker: bool = True,
) -> FastAPI:
    settings = settings or get_settings()
    services = services or build_services(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if start_worker and settings.agent_mode is AgentMode.worker:
            services.agent.start()
        try:
            yield
        finally:
            await services.close()

    app = FastAPI(
        title="ScopeProfit API",
        version=__version__,
        summary="Messy client idea → versioned scope brief → template 7.1 document (PDF/DOCX).",
        description=(
            "REST API behind the ScopeProfit MCP server. Authenticate with `Authorization: Bearer <token>` "
            "using an API key or an OAuth access token. Every route acts on the caller's own projects."
        ),
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.services = services
    install_error_handlers(app)
    app.include_router(system.router)
    app.include_router(projects.router)
    app.include_router(agent.router)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["authorization", "content-type"],
            allow_credentials=False,
        )
    app.add_middleware(RateLimitMiddleware, rules=rate_rules(settings), trust_proxy_hops=settings.trust_proxy_hops)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.public_api_url.startswith("https://"))
    app.add_middleware(VercelOidcMiddleware)
    return app
