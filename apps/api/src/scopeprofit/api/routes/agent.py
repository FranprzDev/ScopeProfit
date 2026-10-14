"""Cron entry point that drains the agent queue (AGENT_MODE=off, or a Vercel Pro cron)."""

from http import HTTPStatus

from fastapi import APIRouter, Header
from pydantic import BaseModel

from scopeprofit.api.deps import ServicesDep
from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.security import secure_equal

router = APIRouter(prefix="/api/agent", tags=["system"])


class AgentRun(BaseModel):
    processed: int


@router.post("/run", response_model=AgentRun)
@router.get("/run", response_model=AgentRun, operation_id="run_agent_cron")
async def run_agent(services: ServicesDep, authorization: str | None = Header(default=None)) -> AgentRun:
    """Processes up to five queued projects. Requires `Authorization: Bearer $CRON_SECRET`
    (Vercel Cron sends it automatically when CRON_SECRET is set)."""
    secret = services.settings.cron_secret
    if secret is None or not authorization or not secure_equal(authorization, f"Bearer {secret.get_secret_value()}"):
        raise DomainError(ErrorCode.forbidden, "Invalid cron secret", HTTPStatus.FORBIDDEN)
    return AgentRun(processed=await services.agent.tick())
