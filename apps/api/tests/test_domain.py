import uuid
from datetime import datetime

import pytest

from scopeprofit.domain.brief import (
    BriefData,
    DiffKind,
    SourceMessage,
    approval_blocker,
    diff_briefs,
    parse_brief,
    replace_section,
    validate_sources,
)
from scopeprofit.enums import ExportFormat, ScopeSection
from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.render.template71 import DocumentContext, render_all, render_markdown
from scopeprofit.security import sign_model, verify_model
from scopeprofit.services.exports import ExportClaim, ExportSigner
from scopeprofit.services.scope import classify_change

MESSAGE_ID = uuid.uuid4()


def complete_brief(**overrides: object) -> BriefData:
    data: dict[str, object] = {
        "summary": "App de turnos para una peluquería.",
        "requirements": [
            {
                "id": "RF-01",
                "description": "Reservar turnos online",
                "type": "functional",
                "priority": "must",
                "source": "quiero que reserven turnos",
                "sourceMessageId": str(MESSAGE_ID),
                "systemNote": "Core",
            }
        ],
        "questions": [],
        "risks": [
            {"id": "R1", "description": "Pagos", "impact": "Alto", "mitigation": "Fuera de v1", "severity": "red"}
        ],
        "included": ["Reservas"],
        "excluded": ["Pagos online"],
        "assumptions": ["Un solo local"],
        "acceptanceCriteria": ["El cliente reserva en 3 pasos"],
        "estimates": [{"module": "Reservas", "minHours": 20, "maxHours": 32.5, "uncertainty": "media"}],
        "nextSteps": ["Validar con el cliente"],
    }
    data.update(overrides)
    return parse_brief(data)


def test_brief_round_trips_camel_case_json() -> None:
    brief = complete_brief()
    dumped = brief.to_json()
    assert dumped["acceptanceCriteria"] == ["El cliente reserva en 3 pasos"]
    assert parse_brief(dumped) == brief
    assert brief.total_hours() == (20, 32.5)


def test_parse_brief_rejects_unknown_keys_and_inverted_estimates() -> None:
    with pytest.raises(DomainError) as unknown:
        parse_brief({"summary": "x", "price": 10})
    assert unknown.value.code is ErrorCode.invalid_brief
    with pytest.raises(DomainError):
        parse_brief({"estimates": [{"module": "A", "minHours": 5, "maxHours": 1, "uncertainty": ""}]})


def test_replace_section_validates_the_section_value() -> None:
    brief = complete_brief()
    updated = replace_section(brief, ScopeSection.next_steps, ["Firmar"])
    assert updated.next_steps == ["Firmar"]
    with pytest.raises(DomainError) as error:
        replace_section(brief, ScopeSection.risks, [{"id": "R1"}])
    assert error.value.code is ErrorCode.invalid_section_value
    assert "risks" in error.value.message


def test_validate_sources_requires_exact_quotes() -> None:
    brief = complete_brief()
    validate_sources(brief, [SourceMessage(MESSAGE_ID, "hola, quiero que reserven turnos online")])
    with pytest.raises(DomainError) as error:
        validate_sources(brief, [SourceMessage(MESSAGE_ID, "otra cosa")])
    assert error.value.code is ErrorCode.invalid_requirement_source
    with pytest.raises(DomainError):
        validate_sources(brief, [])


def test_diff_reports_added_removed_and_changed_keys() -> None:
    before = complete_brief()
    after = complete_brief(
        summary="Nuevo resumen",
        included=["Reservas", "Recordatorios"],
        excluded=[],
        estimates=[{"module": "Reservas", "minHours": 25, "maxHours": 40, "uncertainty": "media"}],
        risks=[],
    )
    entries = {(entry.key, entry.kind) for entry in diff_briefs(before, after)}
    assert ("summary", DiffKind.changed) in entries
    assert ("included.Recordatorios", DiffKind.added) in entries
    assert ("excluded.Pagos online", DiffKind.removed) in entries
    assert ("estimates.Reservas", DiffKind.changed) in entries
    assert ("risks.R1", DiffKind.removed) in entries
    assert diff_briefs(before, before) == []


def test_approval_rules() -> None:
    assert approval_blocker(complete_brief()) is None
    incomplete = approval_blocker(BriefData())
    assert incomplete is not None
    assert incomplete.code is ErrorCode.document_incomplete
    risky = approval_blocker(
        complete_brief(risks=[{"id": "R1", "description": "x", "impact": "y", "mitigation": " ", "severity": "red"}])
    )
    assert risky is not None
    assert risky.code is ErrorCode.unmitigated_risk
    blocked = approval_blocker(
        complete_brief(questions=[{"id": "Q1", "question": "¿Pagos?", "reason": "r", "blocksEstimate": True}])
    )
    assert blocked is not None
    assert blocked.code is ErrorCode.estimate_blocked


def test_markdown_matches_template_71() -> None:
    context = DocumentContext("Turnos", "cliente@x.com", "pro@x.com", datetime(2026, 10, 14), 3, complete_brief())
    markdown = render_markdown(context)
    assert markdown.startswith("# Turnos\nCliente: cliente@x.com\nFecha: 2026-10-14T00:00:00\nVersión: 0.3\n")
    for heading in (
        "## 1. Resumen ejecutivo",
        "## 2. Requerimientos identificados",
        "## 3. Preguntas pendientes\nSin preguntas pendientes",
        "## 5. Alcance\n### Incluidos\n- Reservas",
        "## 7. Próximos pasos\n- Validar con el cliente",
    ):
        assert heading in markdown
    assert (
        '- RF-01 | Reservar turnos online | functional | must | Fuente: "quiero que reserven turnos" | Core' in markdown
    )
    assert "- Reservas: 20–32.5 h | media\nTotal: 20–32.5 h." in markdown
    empty = render_markdown(DocumentContext("Vacío", "Cliente", "Profesional", datetime(2026, 1, 1), 0, BriefData()))
    assert "### Excluidos\n- Pendiente de definición" in empty


def test_render_all_produces_pdf_and_docx() -> None:
    files = render_all(
        DocumentContext("Turnos — ñandú", "c", "a", datetime(2026, 10, 14), 1, complete_brief(questions=[]))
    )
    assert files[ExportFormat.pdf].startswith(b"%PDF")
    assert files[ExportFormat.docx][:2] == b"PK"
    assert b"Resumen ejecutivo" in files[ExportFormat.md]
    empty = render_all(DocumentContext("Vacío", "c", "a", datetime(2026, 10, 14), 1, BriefData()))
    assert empty[ExportFormat.pdf].startswith(b"%PDF")


def test_signed_models_reject_tampering_and_other_purposes() -> None:
    key = b"s" * 32
    claim = ExportClaim(project_id=uuid.uuid4(), version=1, format=ExportFormat.pdf, exp=1)
    token = sign_model(key, "a", claim)
    assert verify_model(key, "a", token, ExportClaim) == claim
    assert verify_model(key, "b", token, ExportClaim) is None
    assert verify_model(b"x" * 32, "a", token, ExportClaim) is None
    assert verify_model(key, "a", token + "x", ExportClaim) is None
    assert verify_model(key, "a", "garbage", ExportClaim) is None


def test_export_links_expire() -> None:
    signer = ExportSigner(b"s" * 32, "https://api.example.com", 60)
    link = signer.link(uuid.uuid4(), 2, ExportFormat.docx)
    assert link.url.startswith("https://api.example.com/api/exports/")
    token = link.url.rsplit("/", 1)[1]
    assert signer.verify(token) is not None
    expired = ExportSigner(b"s" * 32, "https://api.example.com", 60)
    expired.ttl = -expired.ttl
    assert expired.verify(expired.link(uuid.uuid4(), 1, ExportFormat.pdf).url.rsplit("/", 1)[1]) is None


def test_change_classification_matches_brief_text() -> None:
    brief = complete_brief()
    assert classify_change("Agregar PAGOS ONLINE con tarjeta", brief).value == "out_of_scope"
    assert classify_change("Mejorar reservas", brief).value == "in_scope"
    assert classify_change("Un chat interno", brief).value == "ambiguous"
