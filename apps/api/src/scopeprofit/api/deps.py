"""FastAPI dependencies: the service container and the bearer-authenticated principal."""

from http import HTTPStatus
from typing import Annotated, cast

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from scopeprofit.container import Services
from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.services.accounts import Principal

bearer = HTTPBearer(
    auto_error=False,
    description="A ScopeProfit API key (`sp_live_…`) or an OAuth access token (`sp_at_…`).",
)


def get_services(request: Request) -> Services:
    return cast(Services, request.app.state.services)


async def get_principal(
    services: Annotated[Services, Depends(get_services)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Principal:
    if credentials is None or not credentials.credentials:
        raise DomainError(ErrorCode.unauthenticated, "Send Authorization: Bearer <token>", HTTPStatus.UNAUTHORIZED)
    return await services.authenticate(credentials.credentials)


ServicesDep = Annotated[Services, Depends(get_services)]
PrincipalDep = Annotated[Principal, Depends(get_principal)]
