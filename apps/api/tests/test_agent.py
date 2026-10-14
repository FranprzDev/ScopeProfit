import json
import uuid

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select

from scopeprofit.api.app import create_app
from scopeprofit.config import Settings
from scopeprofit.container import Services, build_services
from scopeprofit.db.models import Project
from scopeprofit.domain.brief import BriefData, Question, parse_brief
from scopeprofit.enums import AgentMode, AgentStatus
from scopeprofit.services.agent import AgentError, GatewayModel, ScopeAgent, enforce_clarification, vercel_oidc_token
from tests.conftest import Account, FakeEmail, new_account


class FakeModel:
    def __init__(self, probability: float, brief: BriefData | None = None, fail: bool = False) -> None:
        self.probability = probability
        self.brief = brief
        self.fail = fail
        self.calls: list[list[dict[str, object]]] = []

    async def needs_clarification(self, state: dict[str, object]) -> float:
        assert "messages" in state
        return self.probability

    async def draft_brief(self, system: str, content: list[dict[str, object]]) -> BriefData:
        self.calls.append(content)
        if self.fail:
            raise AgentError("LLM_RESPONSE_INVALID")
        assert self.brief is not None
        return self.brief


async def seed(
    services: Services, account: Account, text: str = "Necesito reservar turnos online"
) -> tuple[uuid.UUID, uuid.UUID]:
    created = await services.scope.create_project(account.principal, "Agente")
    added = await services.scope.add_input(account.principal, created.project_id, text=text, analyze=True)
    return created.project_id, added.added[0].message_id


def drafted(message_id: uuid.UUID, questions: list[dict[str, object]]) -> BriefData:
    return parse_brief(
        {
            "summary": "Turnos online",
            "requirements": [
                {
                    "id": "RF-01",
                    "description": "Reservar",
                    "type": "functional",
                    "priority": "must",
                    "source": "reservar turnos online",
                    "sourceMessageId": str(message_id),
                    "systemNote": "",
                }
            ],
            "questions": questions,
        }
    )


async def status_of(services: Services, project_id: uuid.UUID) -> tuple[AgentStatus, str | None]:
    async with services.db.session() as session:
        project = await session.scalar(select(Project).where(Project.id == project_id))
        assert project is not None
        return project.agent_status, project.agent_error


async def test_agent_drafts_the_brief_and_document(services: Services, account: Account, png: bytes) -> None:
    project_id, message_id = await seed(services, account)
    from scopeprofit.services.images import validate_image

    await services.scope.add_input(account.principal, project_id, images=[validate_image(png, "a.png")], analyze=True)
    model = FakeModel(
        0.9, drafted(message_id, [{"id": "Q1", "question": "¿Cuántos locales?", "reason": "r", "blocksEstimate": True}])
    )
    agent = ScopeAgent(services.db, services.scope, services.storage, model, 0.01)
    assert await agent.tick() >= 1
    assert await status_of(services, project_id) == (AgentStatus.idle, None)
    state = await services.scope.get_project(account.principal, project_id)
    assert state.brief_version == 1
    assert state.document is not None
    assert state.document.up_to_date
    assert any(part.get("type") == "image_url" for part in model.calls[0])
    conversation = await services.scope.get_conversation(account.principal, project_id)
    assert conversation.messages[-1].author_role == "agent"
    assert "¿Cuántos locales?" in conversation.messages[-1].content


async def test_agent_enforces_the_clarification_gate(services: Services, account: Account) -> None:
    project_id, message_id = await seed(services, account)
    agent = ScopeAgent(services.db, services.scope, services.storage, FakeModel(0.9, drafted(message_id, [])), 0.01)
    await agent.process(project_id)
    assert await status_of(services, project_id) == (AgentStatus.failed, "LLM_CLARIFICATION_QUESTION_COUNT_INVALID")


async def test_agent_without_gateway_requires_configuration(services: Services, account: Account) -> None:
    project_id, _ = await seed(services, account)
    agent = ScopeAgent(services.db, services.scope, services.storage, None, 0.01)
    await agent.process(project_id)
    assert await status_of(services, project_id) == (
        AgentStatus.agent_configuration_required,
        "AI_GATEWAY_NOT_CONFIGURED",
    )
    await agent.process(project_id)  # not pending anymore: no-op


async def test_agent_failures_are_recorded(services: Services, account: Account) -> None:
    project_id, _ = await seed(services, account)
    agent = ScopeAgent(services.db, services.scope, services.storage, FakeModel(0.1, fail=True), 0.01)
    await agent.process(project_id)
    assert await status_of(services, project_id) == (AgentStatus.failed, "LLM_RESPONSE_INVALID")


async def test_agent_rejects_invented_sources(services: Services, account: Account) -> None:
    project_id, _ = await seed(services, account)
    agent = ScopeAgent(services.db, services.scope, services.storage, FakeModel(0.1, drafted(uuid.uuid4(), [])), 0.01)
    await agent.process(project_id)
    assert await status_of(services, project_id) == (AgentStatus.failed, "AGENT_PROCESSING_FAILED")


async def test_worker_loop_starts_and_stops(services: Services) -> None:
    agent = ScopeAgent(services.db, services.scope, services.storage, None, 0.01)
    agent.start()
    agent.start()
    await agent.stop()
    await agent.stop()


def test_enforce_clarification() -> None:
    previous = [Question(id="Q1", question="a", reason="b", blocks_estimate=False)]
    brief = BriefData(questions=[*previous, Question(id="Q2", question="c", reason="d", blocks_estimate=True)])
    assert enforce_clarification(brief, previous, True) == brief
    assert [q.id for q in enforce_clarification(brief, previous, False).questions] == ["Q1"]
    with pytest.raises(AgentError):
        enforce_clarification(BriefData(questions=previous), previous, True)


async def test_gateway_model_calls_ai_gateway() -> None:
    seen: list[httpx.Request] = []
    brief = BriefData(summary="ok")

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/evaluate"):
            return httpx.Response(200, json={"answers": {"needsMoreInfo": {"type": "boolean", "probability": 0.7}}})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(brief.to_json())}}]})

    model = GatewayModel("vck_test", "google/gemini-test", httpx.MockTransport(handler))
    assert await model.needs_clarification({"messages": []}) == 0.7
    assert await model.draft_brief("system", [{"type": "text", "text": "hola"}]) == brief
    assert str(seen[0].url) == "https://ai-gateway.vercel.sh/v1/evaluate"
    assert seen[0].headers["authorization"] == "Bearer vck_test"
    body = json.loads(seen[1].content)
    assert body["model"] == "google/gemini-test"
    assert body["response_format"]["type"] == "json_schema"


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (httpx.Response(500), "JEV_REQUEST_FAILED"),
        (httpx.Response(200, json={"answers": {}}), "JEV_RESPONSE_INVALID"),
    ],
)
async def test_gateway_jev_errors(response: httpx.Response, code: str) -> None:
    model = GatewayModel("k", "m", httpx.MockTransport(lambda _: response))
    with pytest.raises(AgentError) as error:
        await model.needs_clarification({})
    assert error.value.code == code


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (httpx.Response(429), "LLM_REQUEST_FAILED"),
        (httpx.Response(200, json={"choices": []}), "LLM_RESPONSE_INVALID"),
        (httpx.Response(200, json={"choices": [{"message": {"content": '{"price": 1}'}}]}), "LLM_RESPONSE_INVALID"),
    ],
)
async def test_gateway_draft_errors(response: httpx.Response, code: str) -> None:
    model = GatewayModel("k", "m", httpx.MockTransport(lambda _: response))
    with pytest.raises(AgentError) as error:
        await model.draft_brief("s", [])
    assert error.value.code == code


async def test_container_builds_gateway_model_only_when_configured(settings: Settings, email: FakeEmail) -> None:
    configured = build_services(
        settings.model_copy(update={"ai_gateway_api_key": SecretStr("vck"), "ai_model": "google/gemini"}), email=email
    )
    assert isinstance(configured.agent.model, GatewayModel)
    await configured.close()
    plain = build_services(settings, email=email)
    assert plain.agent.model is None
    await plain.close()


async def test_seed_helper_creates_isolated_accounts(services: Services) -> None:
    assert (await new_account(services)).principal.user_id != (await new_account(services)).principal.user_id


async def test_inline_mode_runs_the_agent_inside_the_request(settings: Settings, email: FakeEmail) -> None:
    holder: dict[str, uuid.UUID] = {}

    class Recorder(FakeModel):
        async def draft_brief(self, system: str, content: list[dict[str, object]]) -> BriefData:
            return drafted(holder["message"], [])

    inline = build_services(
        settings.model_copy(update={"agent_mode": AgentMode.inline}), email=email, model=Recorder(0.1)
    )
    try:
        account = await new_account(inline)
        project = await inline.scope.create_project(account.principal, "Inline")
        first = await inline.scope.add_input(account.principal, project.project_id, text="hola", analyze=False)
        holder["message"] = first.added[0].message_id
        # the first message already says nothing quotable; quote it exactly
        added = await inline.scope.add_input(account.principal, project.project_id, text="reservar turnos online")
        holder["message"] = added.added[0].message_id
        await inline.scope.add_input(account.principal, project.project_id, text="reservar turnos online", analyze=True)
        detail = await inline.scope.get_project(account.principal, project.project_id)
        assert detail.agent_status in {AgentStatus.idle, AgentStatus.pending}
        assert detail.brief_version >= 1
    finally:
        await inline.close()


async def test_cron_endpoint_requires_the_secret(settings: Settings, email: FakeEmail) -> None:
    configured = settings.model_copy(update={"cron_secret": SecretStr("s" * 20)})
    local = build_services(configured, email=email)
    app = create_app(configured, local, start_worker=False)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        assert (await client.post("/api/agent/run")).status_code == 403
        assert (await client.post("/api/agent/run", headers={"authorization": "Bearer nope"})).status_code == 403
        ok = await client.get("/api/agent/run", headers={"authorization": f"Bearer {'s' * 20}"})
        assert ok.status_code == 200
        assert ok.json()["processed"] >= 0
    await local.close()


async def test_gateway_uses_the_vercel_oidc_token(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["authorization"])
        return httpx.Response(200, json={"answers": {"needsMoreInfo": {"probability": 0.2}}})

    monkeypatch.delenv("VERCEL_OIDC_TOKEN", raising=False)
    model = GatewayModel(None, "m", httpx.MockTransport(handler))
    with pytest.raises(AgentError) as missing:
        await model.needs_clarification({})
    assert missing.value.code == "AI_GATEWAY_NOT_CONFIGURED"
    monkeypatch.setenv("VERCEL_OIDC_TOKEN", "env-token")
    await model.needs_clarification({})
    reset = vercel_oidc_token.set("header-token")
    try:
        await model.needs_clarification({})
    finally:
        vercel_oidc_token.reset(reset)
    assert seen == ["Bearer env-token", "Bearer header-token"]
