"""OAuth 2.1 discovery, registration, authorization (consent page), token and revocation endpoints."""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from scopeprofit.api.consent import consent_page, error_page
from scopeprofit.api.deps import ServicesDep
from scopeprofit.enums import ConsentDecision, ConsentMode
from scopeprofit.errors import DomainError
from scopeprofit.services.accounts import Principal
from scopeprofit.services.oauth import (
    OAuthRequestError,
    authorization_server_metadata,
    protected_resource_metadata,
    redirect_with,
)

router = APIRouter(tags=["oauth"])
NO_STORE = {"cache-control": "no-store", "pragma": "no-cache"}


def oauth_error(problem: OAuthRequestError) -> JSONResponse:
    return JSONResponse(
        {"error": problem.error.value, "error_description": problem.description},
        status_code=problem.status,
        headers=NO_STORE,
    )


async def _form(request: Request) -> dict[str, str]:
    form = await request.form()
    return {key: value for key, value in form.items() if isinstance(value, str)}


@router.get("/.well-known/oauth-authorization-server", include_in_schema=False)
async def authorization_server(services: ServicesDep) -> JSONResponse:
    return JSONResponse(authorization_server_metadata(services.oauth.config))


@router.get("/.well-known/oauth-protected-resource", include_in_schema=False)
@router.get("/.well-known/oauth-protected-resource/api/mcp", include_in_schema=False)
async def protected_resource(services: ServicesDep) -> JSONResponse:
    return JSONResponse(protected_resource_metadata(services.oauth.config))


@router.post("/oauth/register", include_in_schema=False)
async def register(services: ServicesDep, request: Request) -> JSONResponse:
    try:
        payload: object = await request.json()
    except ValueError:
        payload = None
    try:
        client = await services.oauth.register(payload)
    except OAuthRequestError as problem:
        return oauth_error(problem)
    return JSONResponse(client.model_dump(mode="json"), status_code=HTTPStatus.CREATED, headers=NO_STORE)


def _redirect_error(services: ServicesDep, problem: OAuthRequestError) -> Response:
    if problem.redirect is None:
        return error_page(problem.description, problem.status)
    return RedirectResponse(
        redirect_with(
            problem.redirect,
            {
                "error": problem.error.value,
                "error_description": problem.description,
                "state": problem.state,
                "iss": services.oauth.config.issuer,
            },
        ),
        status_code=HTTPStatus.FOUND,
    )


@router.get("/oauth/authorize", include_in_schema=False)
async def authorize(services: ServicesDep, request: Request) -> Response:
    try:
        pending = await services.oauth.validate_authorization(dict(request.query_params))
    except OAuthRequestError as problem:
        return _redirect_error(services, problem)
    return consent_page(pending, services.oauth.seal(pending))


def same_origin(request: Request, issuer: str) -> bool:
    """The consent form must be posted from this origin (CSRF and clickjacked-consent protection)."""
    origin = request.headers.get("origin")
    if origin is not None:
        return origin == issuer
    return request.headers.get("sec-fetch-site") == "same-origin"


@router.post("/oauth/authorize", include_in_schema=False)
async def consent(
    services: ServicesDep,
    request: Request,
    sealed: Annotated[str, Form(alias="request")],
    mode: Annotated[ConsentMode, Form()],
    decision: Annotated[ConsentDecision, Form()] = ConsentDecision.allow,
    email: Annotated[str, Form(max_length=320)] = "",
    password: Annotated[str, Form(max_length=1_000)] = "",
    api_key: Annotated[str, Form(max_length=500)] = "",
) -> Response:
    if not same_origin(request, services.oauth.config.issuer):
        return error_page("This form must be submitted from the ScopeProfit sign-in page.", HTTPStatus.FORBIDDEN)
    try:
        pending = services.oauth.unseal(sealed)
    except OAuthRequestError as problem:
        return error_page(problem.description, problem.status)
    if decision is ConsentDecision.deny:
        return RedirectResponse(services.oauth.denied(pending), status_code=HTTPStatus.SEE_OTHER)
    async with services.db.session() as session:
        try:
            principal: Principal
            if mode is ConsentMode.sign_up:
                principal = await services.accounts.sign_up(session, email, password)
            elif mode is ConsentMode.sign_in:
                principal = await services.accounts.sign_in(session, email, password)
            else:
                principal = await services.accounts.verify_key(session, api_key.strip())
        except DomainError as error:
            await session.rollback()
            status = HTTPStatus.UNAUTHORIZED if error.status == HTTPStatus.UNAUTHORIZED else HTTPStatus.BAD_REQUEST
            return consent_page(pending, sealed, error.message, status)
        location = await services.oauth.grant(session, pending, principal)
        await session.commit()
    return RedirectResponse(location, status_code=HTTPStatus.SEE_OTHER)


@router.post("/oauth/token", include_in_schema=False)
async def token(services: ServicesDep, request: Request) -> JSONResponse:
    try:
        issued = await services.oauth.token(await _form(request))
    except OAuthRequestError as problem:
        return oauth_error(problem)
    return JSONResponse(issued.model_dump(mode="json"), headers=NO_STORE)


@router.post("/oauth/revoke", include_in_schema=False)
async def revoke(services: ServicesDep, request: Request) -> Response:
    try:
        await services.oauth.revoke(await _form(request))
    except OAuthRequestError as problem:
        return oauth_error(problem)
    return Response(status_code=HTTPStatus.OK, headers=NO_STORE)
