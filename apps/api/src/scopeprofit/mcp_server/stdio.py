"""`scopeprofit-mcp`: the same MCP tools over stdio for local agents (Claude Desktop, Codex, Cursor).

Reads `SCOPEPROFIT_API_KEY` (an `sp_live_…` key) and the usual server settings (`DATABASE_URL`, ...)
and acts as the key's owner for every call.
"""

import asyncio
import os
import sys

from scopeprofit.config import get_settings
from scopeprofit.container import build_services
from scopeprofit.errors import DomainError
from scopeprofit.mcp_server.tools import build_mcp, current_principal


async def serve() -> None:
    key = os.environ.get("SCOPEPROFIT_API_KEY")
    if not key:
        raise SystemExit("SCOPEPROFIT_API_KEY is required (create one with `scopeprofit keys create`)")
    services = build_services(get_settings())
    try:
        try:
            principal = await services.authenticate(key)
        except DomainError as error:
            raise SystemExit(f"SCOPEPROFIT_API_KEY was rejected: {error.code.value}") from error
        current_principal.set(principal)
        await build_mcp(services).run_stdio_async()
    finally:
        await services.close()


def main() -> None:
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        sys.exit(0)
