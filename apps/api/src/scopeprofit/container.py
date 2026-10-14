"""Wires settings into the service graph used by the HTTP app, the CLI and the MCP stdio server."""

from dataclasses import dataclass

import httpx

from scopeprofit.config import Settings
from scopeprofit.db.session import Database
from scopeprofit.enums import AgentMode
from scopeprofit.services.accounts import Accounts, Principal
from scopeprofit.services.agent import GatewayModel, ScopeAgent, ScopeModel
from scopeprofit.services.email import BrevoEmail, EmailSender
from scopeprofit.services.exports import ExportSigner
from scopeprofit.services.images import ImageFetcher, ImageFetchPolicy
from scopeprofit.services.scope import ScopeService
from scopeprofit.services.storage import Storage


@dataclass
class Services:
    settings: Settings
    db: Database
    storage: Storage
    email: EmailSender
    exports: ExportSigner
    images: ImageFetcher
    accounts: Accounts
    scope: ScopeService
    agent: ScopeAgent

    async def authenticate(self, token: str) -> Principal:
        """Resolves a bearer token (an API key) to its owner."""
        return await self.accounts.authenticate(token)

    async def close(self) -> None:
        await self.agent.stop()
        await self.db.dispose()


def build_services(
    settings: Settings,
    *,
    email: EmailSender | None = None,
    model: ScopeModel | None = None,
    image_transport: httpx.AsyncBaseTransport | None = None,
) -> Services:
    db = Database(settings.async_database_url, settings.database_pool)
    storage = Storage(db)
    sender: EmailSender = email or BrevoEmail(
        settings.brevo_api_key.get_secret_value() if settings.brevo_api_key else None,
        settings.brevo_sender_email,
        settings.brevo_sender_name,
    )
    exports = ExportSigner(settings.signing_key_bytes, settings.public_api_url, settings.export_url_ttl_minutes)
    images = ImageFetcher(
        ImageFetchPolicy(allow_http=settings.allow_http_image_urls, allow_private=settings.allow_private_image_urls),
        transport=image_transport,
    )
    scope = ScopeService(db, storage, sender, exports, images)
    if model is None and settings.ai_model:
        api_key = settings.ai_gateway_api_key.get_secret_value() if settings.ai_gateway_api_key else None
        model = GatewayModel(api_key, settings.ai_model)
    agent = ScopeAgent(db, scope, storage, model, settings.agent_poll_seconds)
    if settings.agent_mode is AgentMode.inline:
        scope.agent_runner = agent.process
    return Services(
        settings=settings,
        db=db,
        storage=storage,
        email=sender,
        exports=exports,
        images=images,
        accounts=Accounts(db),
        scope=scope,
        agent=agent,
    )
