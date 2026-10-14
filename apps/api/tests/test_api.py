import uuid

import httpx

from scopeprofit.container import Services
from tests.conftest import Account, FakeEmail, new_account


async def create_project(client: httpx.AsyncClient, account: Account, **body: object) -> str:
    response = await client.post("/api/projects", json={"name": "Turnos", **body}, headers=account.headers)
    assert response.status_code == 201, response.text
    return str(response.json()["projectId"])


async def add_text(client: httpx.AsyncClient, account: Account, project_id: str, text: str) -> str:
    response = await client.post(
        f"/api/projects/{project_id}/messages", json={"text": text, "analyze": False}, headers=account.headers
    )
    assert response.status_code == 201, response.text
    return str(response.json()["added"][0]["messageId"])


def full_brief(message_id: str, **overrides: object) -> dict[str, object]:
    brief: dict[str, object] = {
        "summary": "Turnos online para una peluquería.",
        "requirements": [
            {
                "id": "RF-01",
                "description": "Reservar turnos",
                "type": "functional",
                "priority": "must",
                "source": "reservar turnos desde el celular",
                "sourceMessageId": message_id,
                "systemNote": "",
            }
        ],
        "questions": [],
        "risks": [
            {"id": "R1", "description": "Pagos", "impact": "Alto", "mitigation": "Fuera de v1", "severity": "red"}
        ],
        "included": ["Reservas"],
        "excluded": ["Pagos"],
        "assumptions": ["Un local"],
        "acceptanceCriteria": ["Reserva en 3 pasos"],
        "estimates": [{"module": "Reservas", "minHours": 10, "maxHours": 20, "uncertainty": "baja"}],
        "nextSteps": ["Validar"],
    }
    brief.update(overrides)
    return brief


async def test_health_and_openapi(client: httpx.AsyncClient) -> None:
    health = await client.get("/api/health")
    assert health.json() == {"status": "ok", "database": "ok"}
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-request-id"]
    spec = (await client.get("/api/openapi.json")).json()
    assert "/api/projects/{project_id}/approve" in spec["paths"]
    assert not any("quote" in path or "rate-card" in path or "maintenance" in path for path in spec["paths"])
    assert (await client.get("/api/docs")).status_code == 200


async def test_authentication_is_required(client: httpx.AsyncClient) -> None:
    missing = await client.get("/api/projects")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "UNAUTHENTICATED"
    assert missing.headers["www-authenticate"].startswith(
        'Bearer resource_metadata="http://testserver/.well-known/oauth-protected-resource"'
    )
    wrong = await client.get("/api/projects", headers={"authorization": "Bearer sp_live_nope"})
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "INVALID_API_KEY"
    other = await client.get("/api/projects", headers={"authorization": "Bearer something-else"})
    assert other.status_code == 401


async def test_full_scope_flow_to_approved_and_delivered_document(
    client: httpx.AsyncClient, account: Account, email: FakeEmail
) -> None:
    project_id = await create_project(client, account, clientEmail="Cliente@Example.com")
    message_id = await add_text(client, account, project_id, "Quiero reservar turnos desde el celular.")

    brief = (await client.get(f"/api/projects/{project_id}/brief", headers=account.headers)).json()
    assert brief["briefVersion"] == 0
    put = await client.put(
        f"/api/projects/{project_id}/brief",
        json={"expectedVersion": 0, "data": full_brief(message_id)},
        headers=account.headers,
    )
    assert put.status_code == 200, put.text
    assert put.json() == {"projectId": project_id, "briefVersion": 1, "documentVersion": 1}

    stale = await client.put(
        f"/api/projects/{project_id}/brief",
        json={"expectedVersion": 0, "data": full_brief(message_id)},
        headers=account.headers,
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

    section = await client.patch(
        f"/api/projects/{project_id}/brief/sections/nextSteps",
        json={"expectedVersion": 1, "value": ["Validar", "Firmar"]},
        headers=account.headers,
    )
    assert section.status_code == 200, section.text
    assert section.json()["briefVersion"] == 2

    diff = (await client.get(f"/api/projects/{project_id}/brief/diff?from=1&to=2", headers=account.headers)).json()
    assert [change["key"] for change in diff["changes"]] == ["nextSteps.Firmar"]
    assert diff["from"]["source"] == "api"

    detail = (await client.get(f"/api/projects/{project_id}", headers=account.headers)).json()
    assert detail["status"] == "in_review"
    assert detail["document"] == {"version": 2, "status": "draft", "briefVersion": 2, "upToDate": True}
    assert detail["counts"]["requirements"] == 1

    document = (await client.get(f"/api/projects/{project_id}/document", headers=account.headers)).json()
    assert document["template"] == "7.1"
    assert "## 7. Próximos pasos\n- Validar\n- Firmar" in document["markdown"]

    versions = (await client.get(f"/api/projects/{project_id}/documents", headers=account.headers)).json()
    assert [v["version"] for v in versions["versions"]] == [2, 1]
    assert set(versions["versions"][0]["formats"]) == {"md", "pdf", "docx"}

    pdf = await client.get(f"/api/projects/{project_id}/documents/2/pdf", headers=account.headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    assert pdf.headers["content-type"] == "application/pdf"

    link = (await client.post(f"/api/projects/{project_id}/exports/docx", headers=account.headers)).json()
    assert link["version"] == 2
    exported = await client.get(link["url"].removeprefix("http://testserver"))
    assert exported.status_code == 200
    assert exported.content[:2] == b"PK"
    assert (await client.get("/api/exports/forged.token")).status_code == 404

    wrong_version = await client.post(
        f"/api/projects/{project_id}/approve", json={"documentVersion": 1}, headers=account.headers
    )
    assert wrong_version.json()["error"]["code"] == "VERSION_CONFLICT"

    approved = await client.post(
        f"/api/projects/{project_id}/approve", json={"documentVersion": 2}, headers=account.headers
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["emailedToClient"] is True
    assert body["status"] == "delivered"
    assert body["downloads"]["pdf"]["url"].startswith("http://testserver/api/exports/")
    assert len(email.sent) == 1
    assert email.sent[0].to == "cliente@example.com"
    assert [a.name for a in email.sent[0].attachments] == [
        f"scope-{project_id}-v2.pdf",
        f"scope-{project_id}-v2.docx",
    ]

    again = await client.post(
        f"/api/projects/{project_id}/approve", json={"documentVersion": 2}, headers=account.headers
    )
    assert again.status_code == 200
    assert len(email.sent) == 1, "delivery is idempotent"

    locked = await client.post(
        f"/api/projects/{project_id}/messages", json={"text": "más cosas"}, headers=account.headers
    )
    assert locked.status_code == 409
    assert locked.json()["error"]["code"] == "PROJECT_LOCKED"
    assert (await client.get(f"/api/projects/{project_id}", headers=account.headers)).json()["status"] == "delivered"


async def test_approval_rules_are_enforced(client: httpx.AsyncClient, account: Account) -> None:
    project_id = await create_project(client, account)
    message_id = await add_text(client, account, project_id, "reservar turnos desde el celular")
    blocked = full_brief(
        message_id, questions=[{"id": "Q1", "question": "¿Pagos?", "reason": "r", "blocksEstimate": True}]
    )
    await client.put(
        f"/api/projects/{project_id}/brief", json={"expectedVersion": 0, "data": blocked}, headers=account.headers
    )
    without_email = await client.post(
        f"/api/projects/{project_id}/approve", json={"documentVersion": 1}, headers=account.headers
    )
    assert without_email.json()["error"]["code"] == "CLIENT_EMAIL_REQUIRED"
    estimate = await client.post(
        f"/api/projects/{project_id}/approve",
        json={"documentVersion": 1, "sendToClient": False},
        headers=account.headers,
    )
    assert estimate.json()["error"]["code"] == "ESTIMATE_BLOCKED"

    questions = (
        await client.get(f"/api/projects/{project_id}/questions?blockingOnly=true", headers=account.headers)
    ).json()
    assert [q["id"] for q in questions["questions"]] == ["Q1"]
    answered = await client.post(
        f"/api/projects/{project_id}/questions/Q1/answer", json={"answer": "Sin pagos"}, headers=account.headers
    )
    assert answered.status_code == 200, answered.text
    assert answered.json()["briefVersion"] == 2
    missing = await client.post(
        f"/api/projects/{project_id}/questions/Q9/answer", json={"answer": "x"}, headers=account.headers
    )
    assert missing.json()["error"]["code"] == "QUESTION_NOT_FOUND"

    approved = await client.post(
        f"/api/projects/{project_id}/approve",
        json={"documentVersion": 2, "sendToClient": False},
        headers=account.headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["emailedToClient"] is False
    assert approved.json()["status"] == "approved"


async def test_invalid_sources_and_sections_are_rejected(client: httpx.AsyncClient, account: Account) -> None:
    project_id = await create_project(client, account)
    message_id = await add_text(client, account, project_id, "algo distinto")
    bad = await client.put(
        f"/api/projects/{project_id}/brief",
        json={"expectedVersion": 0, "data": full_brief(message_id)},
        headers=account.headers,
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "INVALID_REQUIREMENT_SOURCE"
    section = await client.patch(
        f"/api/projects/{project_id}/brief/sections/estimates",
        json={"expectedVersion": 0, "value": [{"module": "A", "minHours": 3, "maxHours": 1, "uncertainty": ""}]},
        headers=account.headers,
    )
    assert section.json()["error"]["code"] == "INVALID_SECTION_VALUE"
    invalid = await client.put(
        f"/api/projects/{project_id}/brief", json={"expectedVersion": 0, "data": {"price": 1}}, headers=account.headers
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_FAILED"


async def test_projects_are_isolated_per_user(client: httpx.AsyncClient, services: Services, account: Account) -> None:
    project_id = await create_project(client, account)
    other = await new_account(services)
    assert (await client.get(f"/api/projects/{project_id}", headers=other.headers)).status_code == 404
    assert (await client.get(f"/api/projects/{project_id}/messages", headers=other.headers)).status_code == 404
    archived = await client.post(f"/api/projects/{project_id}/archive", headers=other.headers)
    assert archived.json()["error"]["code"] == "PROJECT_NOT_FOUND"
    listed = (await client.get("/api/projects", headers=other.headers)).json()
    assert listed == {"projects": [], "nextCursor": None}


async def test_project_listing_paginates_and_hides_archived(client: httpx.AsyncClient, services: Services) -> None:
    account = await new_account(services)
    ids = [await create_project(client, account, name=f"P{i}") for i in range(3)]
    first = (await client.get("/api/projects?limit=2", headers=account.headers)).json()
    assert len(first["projects"]) == 2
    second = (await client.get(f"/api/projects?limit=2&cursor={first['nextCursor']}", headers=account.headers)).json()
    assert second["nextCursor"] is None
    seen = {p["projectId"] for p in first["projects"] + second["projects"]}
    assert seen == set(ids)
    await client.post(f"/api/projects/{ids[0]}/archive", headers=account.headers)
    visible = (await client.get("/api/projects", headers=account.headers)).json()["projects"]
    assert ids[0] not in {p["projectId"] for p in visible}
    archived = (await client.get("/api/projects?status=archived", headers=account.headers)).json()["projects"]
    assert [p["projectId"] for p in archived] == [ids[0]]
    everything = (await client.get("/api/projects?includeArchived=true", headers=account.headers)).json()["projects"]
    assert len(everything) == 3
    assert (await client.get("/api/projects?cursor=@@", headers=account.headers)).status_code == 400


async def test_conversation_images_and_tldr(client: httpx.AsyncClient, account: Account, png: bytes) -> None:
    project_id = await create_project(client, account)
    empty = await client.post(f"/api/projects/{project_id}/messages", json={"text": "  "}, headers=account.headers)
    assert empty.json()["error"]["code"] == "EMPTY_INPUT"
    upload = await client.post(
        f"/api/projects/{project_id}/files",
        files={"file": ("mock.png", png, "image/png")},
        data={"author": "professional", "analyze": "true"},
        headers=account.headers,
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["added"][0]["kind"] == "image"
    assert upload.json()["agentStatus"] == "pending"
    bad = await client.post(
        f"/api/projects/{project_id}/files",
        files={"file": ("x.png", b"nope", "image/png")},
        headers=account.headers,
    )
    assert bad.json()["error"]["code"] == "INVALID_IMAGE"
    await add_text(client, account, project_id, "Hola")
    conversation = (await client.get(f"/api/projects/{project_id}/messages", headers=account.headers)).json()
    assert [m["content"] for m in conversation["messages"]] == ["[imagen]", "Hola"]
    assert conversation["messages"][0]["files"][0]["mimeType"] == "image/png"
    assert conversation["messages"][0]["authorRole"] == "professional"
    tldr = (await client.get(f"/api/projects/{project_id}/tldr", headers=account.headers)).json()
    assert tldr["tldr"] == "No summary yet: add client input first."
    assert tldr["estimateHours"] is None
    regenerated = await client.post(f"/api/projects/{project_id}/documents", headers=account.headers)
    assert regenerated.status_code == 201
    assert regenerated.json()["versions"][0]["version"] == 1


async def test_change_requests(client: httpx.AsyncClient, account: Account) -> None:
    project_id = await create_project(client, account)
    message_id = await add_text(client, account, project_id, "reservar turnos desde el celular")
    await client.put(
        f"/api/projects/{project_id}/brief",
        json={"expectedVersion": 0, "data": full_brief(message_id)},
        headers=account.headers,
    )
    created = await client.post(
        f"/api/projects/{project_id}/change-requests",
        json={"request": "Sumar pagos con tarjeta"},
        headers=account.headers,
    )
    assert created.status_code == 201
    change = created.json()
    assert change["classification"] == "out_of_scope"
    assert change["baseBriefVersion"] == 1
    decided = await client.patch(
        f"/api/projects/{project_id}/change-requests/{change['changeRequestId']}",
        json={"status": "accepted"},
        headers=account.headers,
    )
    assert decided.json()["status"] == "accepted"
    twice = await client.patch(
        f"/api/projects/{project_id}/change-requests/{change['changeRequestId']}",
        json={"status": "rejected"},
        headers=account.headers,
    )
    assert twice.json()["error"]["code"] == "CHANGE_REQUEST_NOT_FOUND"
    invalid = await client.patch(
        f"/api/projects/{project_id}/change-requests/{change['changeRequestId']}",
        json={"status": "proposed"},
        headers=account.headers,
    )
    assert invalid.status_code == 422
    listed = (await client.get(f"/api/projects/{project_id}/change-requests", headers=account.headers)).json()
    assert [c["status"] for c in listed["changeRequests"]] == ["accepted"]


async def test_api_key_management(client: httpx.AsyncClient, account: Account) -> None:
    me = (await client.get("/api/me", headers=account.headers)).json()
    assert me["userId"] == str(account.principal.user_id)
    assert me["credential"] == "api_key"
    created = await client.post("/api/keys", json={"label": "claude"}, headers=account.headers)
    assert created.status_code == 201
    key = created.json()
    assert key["key"].startswith("sp_live_")
    second = {"authorization": f"Bearer {key['key']}"}
    assert (await client.get("/api/me", headers=second)).status_code == 200
    listed = (await client.get("/api/keys", headers=account.headers)).json()
    assert {k["label"] for k in listed} == {"test", "claude"}
    assert all("key" not in k for k in listed)
    assert (await client.delete(f"/api/keys/{key['id']}", headers=account.headers)).json() == {"revoked": True}
    assert (await client.get("/api/me", headers=second)).status_code == 401
    missing = await client.delete(f"/api/keys/{uuid.uuid4()}", headers=account.headers)
    assert missing.json()["error"]["code"] == "API_KEY_NOT_FOUND"


async def test_unknown_routes_use_the_error_envelope(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
