"""Template 7.1: the fixed scope document rendered as Markdown, PDF and DOCX.

The document language is Spanish (the product's document language since v1); the Markdown output
matches the previous NestJS renderer line by line so existing exports and tests stay comparable.
"""

import io
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

import reportlab
from docx import Document as DocxDocument
from docx.shared import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.flowables import Flowable

from scopeprofit.domain.brief import BriefData
from scopeprofit.enums import ExportFormat

PENDING = "Pendiente de definición"
DISCLAIMER = "Rango orientativo sujeto a los supuestos e incertidumbres indicados; no es un precio."


@dataclass(frozen=True)
class DocumentContext:
    project_name: str
    client_name: str
    author: str
    date: datetime
    version: int
    brief: BriefData


def _hours(value: float) -> str:
    return str(int(value)) if value == int(value) else f"{value:g}"


def _bullets(values: list[str]) -> str:
    return "\n".join(f"- {value}" for value in values) or f"- {PENDING}"


def _yes_no(value: bool) -> str:
    return "Sí" if value else "No"


def render_markdown(doc: DocumentContext) -> str:
    brief = doc.brief
    requirements = "\n".join(
        f'- {r.id} | {r.description} | {r.type.value} | {r.priority.value} | Fuente: "{r.source}" | {r.system_note}'
        for r in brief.requirements
    )
    questions = "\n".join(
        f"- {q.id}: {q.question} | {q.reason} | Bloquea estimación: {_yes_no(q.blocks_estimate)}"
        for q in brief.questions
    )
    risks = "\n".join(
        f"- {r.id}: {r.description} | Impacto: {r.impact} | Mitigación/supuesto: {r.mitigation} | "
        f"Semáforo: {r.severity.value}"
        for r in brief.risks
    )
    estimates = "\n".join(
        f"- {e.module}: {_hours(e.min_hours)}–{_hours(e.max_hours)} h | {e.uncertainty}" for e in brief.estimates
    )
    total_min, total_max = brief.total_hours()
    return (
        f"# {doc.project_name}\n"
        f"Cliente: {doc.client_name}\n"
        f"Fecha: {doc.date.isoformat()}\n"
        f"Versión: 0.{doc.version}\n"
        f"Autor: {doc.author}\n\n"
        f"## 1. Resumen ejecutivo\n{brief.summary}\n\n"
        f"## 2. Requerimientos identificados\n{requirements}\n\n"
        f"## 3. Preguntas pendientes\n{questions or 'Sin preguntas pendientes'}\n\n"
        f"## 4. Riesgos y ambigüedades\n{risks or 'Sin riesgos identificados'}\n\n"
        f"## 5. Alcance\n### Incluidos\n{_bullets(brief.included)}\n### Excluidos\n{_bullets(brief.excluded)}\n"
        f"### Supuestos\n{_bullets(brief.assumptions)}\n"
        f"### Criterios de aceptación\n{_bullets(brief.acceptance_criteria)}\n\n"
        f"## 6. Estimación orientativa en horas\n{estimates}\n"
        f"Total: {_hours(total_min)}–{_hours(total_max)} h. {DISCLAIMER}\n\n"
        f"## 7. Próximos pasos\n{_bullets(brief.next_steps)}\n"
    )


_FONT_DIR = Path(reportlab.__file__).resolve().parent / "fonts"
_FONTS_REGISTERED = False


def _register_fonts() -> None:
    """Bitstream Vera (bundled with reportlab) covers Spanish accents and typographic dashes."""
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    pdfmetrics.registerFont(TTFont("Vera", str(_FONT_DIR / "Vera.ttf")))
    pdfmetrics.registerFont(TTFont("Vera-Bold", str(_FONT_DIR / "VeraBd.ttf")))
    _FONTS_REGISTERED = True


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def _table(header: list[str], rows: list[list[str]], cell: ParagraphStyle, widths: list[float]) -> Table:
    data = [[_p(value, cell) for value in header], *[[_p(value, cell) for value in row] for row in rows]]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EDEDED")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9A9A9A")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def render_pdf(doc: DocumentContext) -> bytes:
    _register_fonts()
    base = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=base["BodyText"], fontName="Vera", fontSize=9.5, leading=13)
    cell = ParagraphStyle("cell", parent=body, fontSize=8.5, leading=11)
    title = ParagraphStyle("title", parent=base["Title"], fontName="Vera-Bold", fontSize=18, alignment=0)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontName="Vera-Bold", fontSize=13, spaceBefore=10)
    h3 = ParagraphStyle("h3", parent=base["Heading3"], fontName="Vera-Bold", fontSize=10.5, spaceBefore=6)
    brief = doc.brief
    width = A4[0] - 36 * mm

    def bullets(values: list[str]) -> ListFlowable:
        items = [ListItem(_p(value, body)) for value in values] or [ListItem(_p(PENDING, body))]
        return ListFlowable(items, bulletType="bullet", start="•", leftIndent=12)

    story: list[Flowable] = [
        _p(doc.project_name, title),
        _p(
            f"Cliente: {doc.client_name}\nFecha: {doc.date.isoformat()}\nVersión: 0.{doc.version}\nAutor: {doc.author}",
            body,
        ),
        _p("1. Resumen ejecutivo", h2),
        _p(brief.summary or PENDING, body),
        _p("2. Requerimientos identificados", h2),
    ]
    if brief.requirements:
        story.append(
            _table(
                ["ID", "Descripción", "Tipo", "Prioridad", "Fuente", "Nota"],
                [
                    [r.id, r.description, r.type.value, r.priority.value, f"«{r.source}»", r.system_note]
                    for r in brief.requirements
                ],
                cell,
                [w * width for w in (0.08, 0.28, 0.12, 0.1, 0.24, 0.18)],
            )
        )
    else:
        story.append(_p(PENDING, body))
    story.append(_p("3. Preguntas pendientes", h2))
    if brief.questions:
        story.append(
            _table(
                ["ID", "Pregunta", "Motivo", "¿Bloquea estimación?"],
                [[q.id, q.question, q.reason, _yes_no(q.blocks_estimate)] for q in brief.questions],
                cell,
                [w * width for w in (0.08, 0.42, 0.34, 0.16)],
            )
        )
    else:
        story.append(_p("Sin preguntas pendientes", body))
    story.append(_p("4. Riesgos y ambigüedades", h2))
    if brief.risks:
        story.append(
            _table(
                ["ID", "Riesgo", "Impacto", "Mitigación / supuesto", "Semáforo"],
                [[r.id, r.description, r.impact, r.mitigation, r.severity.value] for r in brief.risks],
                cell,
                [w * width for w in (0.08, 0.3, 0.22, 0.28, 0.12)],
            )
        )
    else:
        story.append(_p("Sin riesgos identificados", body))
    story.append(_p("5. Alcance", h2))
    for label, values in (
        ("Incluidos", brief.included),
        ("Excluidos", brief.excluded),
        ("Supuestos", brief.assumptions),
        ("Criterios de aceptación", brief.acceptance_criteria),
    ):
        story.extend([_p(label, h3), bullets(values)])
    story.append(_p("6. Estimación orientativa en horas", h2))
    total_min, total_max = brief.total_hours()
    if brief.estimates:
        story.append(
            _table(
                ["Módulo", "Horas", "Incertidumbre"],
                [[e.module, f"{_hours(e.min_hours)}–{_hours(e.max_hours)} h", e.uncertainty] for e in brief.estimates],
                cell,
                [w * width for w in (0.35, 0.15, 0.5)],
            )
        )
    story.extend(
        [
            Spacer(1, 4),
            _p(f"Total: {_hours(total_min)}–{_hours(total_max)} h. {DISCLAIMER}", body),
            _p("7. Próximos pasos", h2),
            bullets(brief.next_steps),
        ]
    )
    buffer = io.BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=doc.project_name,
        author=doc.author,
        subject="Documento de alcance — plantilla 7.1",
    ).build(story)
    return buffer.getvalue()


def render_docx(doc: DocumentContext) -> bytes:
    document = DocxDocument()
    document.core_properties.title = doc.project_name
    document.core_properties.author = doc.author
    document.styles["Normal"].font.size = Pt(10)
    brief = doc.brief
    document.add_heading(doc.project_name, level=0)
    for line in (
        f"Cliente: {doc.client_name}",
        f"Fecha: {doc.date.isoformat()}",
        f"Versión: 0.{doc.version}",
        f"Autor: {doc.author}",
    ):
        document.add_paragraph(line)

    def table(header: list[str], rows: list[list[str]]) -> None:
        grid = document.add_table(rows=1, cols=len(header))
        grid.style = "Table Grid"
        for index, label in enumerate(header):
            run = grid.rows[0].cells[index].paragraphs[0].add_run(label)
            run.bold = True
        for row in rows:
            cells = grid.add_row().cells
            for index, value in enumerate(row):
                cells[index].text = value

    def bullets(values: list[str]) -> None:
        for value in values or [PENDING]:
            document.add_paragraph(value, style="List Bullet")

    document.add_heading("1. Resumen ejecutivo", level=1)
    document.add_paragraph(brief.summary or PENDING)
    document.add_heading("2. Requerimientos identificados", level=1)
    if brief.requirements:
        table(
            ["ID", "Descripción", "Tipo", "Prioridad", "Fuente", "Nota"],
            [
                [r.id, r.description, r.type.value, r.priority.value, f"«{r.source}»", r.system_note]
                for r in brief.requirements
            ],
        )
    else:
        document.add_paragraph(PENDING)
    document.add_heading("3. Preguntas pendientes", level=1)
    if brief.questions:
        table(
            ["ID", "Pregunta", "Motivo", "¿Bloquea estimación?"],
            [[q.id, q.question, q.reason, _yes_no(q.blocks_estimate)] for q in brief.questions],
        )
    else:
        document.add_paragraph("Sin preguntas pendientes")
    document.add_heading("4. Riesgos y ambigüedades", level=1)
    if brief.risks:
        table(
            ["ID", "Riesgo", "Impacto", "Mitigación / supuesto", "Semáforo"],
            [[r.id, r.description, r.impact, r.mitigation, r.severity.value] for r in brief.risks],
        )
    else:
        document.add_paragraph("Sin riesgos identificados")
    document.add_heading("5. Alcance", level=1)
    for label, values in (
        ("Incluidos", brief.included),
        ("Excluidos", brief.excluded),
        ("Supuestos", brief.assumptions),
        ("Criterios de aceptación", brief.acceptance_criteria),
    ):
        document.add_heading(label, level=2)
        bullets(values)
    document.add_heading("6. Estimación orientativa en horas", level=1)
    if brief.estimates:
        table(
            ["Módulo", "Horas", "Incertidumbre"],
            [[e.module, f"{_hours(e.min_hours)}–{_hours(e.max_hours)} h", e.uncertainty] for e in brief.estimates],
        )
    total_min, total_max = brief.total_hours()
    document.add_paragraph(f"Total: {_hours(total_min)}–{_hours(total_max)} h. {DISCLAIMER}")
    document.add_heading("7. Próximos pasos", level=1)
    bullets(brief.next_steps)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def render_all(doc: DocumentContext) -> dict[ExportFormat, bytes]:
    return {
        ExportFormat.md: render_markdown(doc).encode(),
        ExportFormat.pdf: render_pdf(doc),
        ExportFormat.docx: render_docx(doc),
    }
