"""Every finite domain of the backend lives here as an Enum.

Values match the PostgreSQL enum labels and the JSON stored by the previous NestJS backend, so
existing rows and briefs stay readable.
"""

from enum import StrEnum


class Role(StrEnum):
    """`Role` PostgreSQL enum. Every account created by this backend is a professional; `client`
    only exists for rows written by the removed web client chat."""

    client = "client"
    professional = "professional"


class ProjectStatus(StrEnum):
    draft = "draft"
    in_review = "in_review"
    changes_requested = "changes_requested"
    approved = "approved"
    delivered = "delivered"
    archived = "archived"


LOCKED_PROJECT_STATUSES: frozenset[ProjectStatus] = frozenset(
    {ProjectStatus.approved, ProjectStatus.delivered, ProjectStatus.archived}
)
REVIEWABLE_PROJECT_STATUSES: frozenset[ProjectStatus] = frozenset(
    {ProjectStatus.in_review, ProjectStatus.changes_requested}
)


class AgentStatus(StrEnum):
    idle = "idle"
    pending = "pending"
    running = "running"
    failed = "failed"
    agent_configuration_required = "agent_configuration_required"


BUSY_AGENT_STATUSES: frozenset[AgentStatus] = frozenset({AgentStatus.pending, AgentStatus.running})


class ChangeClassification(StrEnum):
    in_scope = "in_scope"
    out_of_scope = "out_of_scope"
    ambiguous = "ambiguous"


class ChangeRequestStatus(StrEnum):
    proposed = "proposed"
    accepted = "accepted"
    rejected = "rejected"


class ChangeDecision(StrEnum):
    """The two terminal decisions a professional can take on a proposed change request."""

    accepted = "accepted"
    rejected = "rejected"


class AuthorRole(StrEnum):
    """Who wrote a stored message (`messages.author_role`)."""

    client = "client"
    professional = "professional"
    agent = "agent"


class InputAuthor(StrEnum):
    """Authors an API caller may attribute new input to."""

    client = "client"
    professional = "professional"


class BriefSource(StrEnum):
    """Origin of a brief version (`brief_versions.source`)."""

    api = "api"
    mcp = "mcp"
    agent = "agent"
    telegram = "telegram"
    professional = "professional"
    client = "client"


class DocumentStatus(StrEnum):
    draft = "draft"
    approved = "approved"
    delivered = "delivered"


class ExportFormat(StrEnum):
    md = "md"
    pdf = "pdf"
    docx = "docx"


EXPORT_MIME_TYPES: dict[ExportFormat, str] = {
    ExportFormat.md: "text/markdown; charset=utf-8",
    ExportFormat.pdf: "application/pdf",
    ExportFormat.docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class RequirementType(StrEnum):
    functional = "functional"
    rule = "rule"
    data = "data"
    integration = "integration"
    nonfunctional = "nonfunctional"


class Priority(StrEnum):
    must = "must"
    should = "should"


class RiskSeverity(StrEnum):
    red = "red"
    yellow = "yellow"
    green = "green"


class ScopeSection(StrEnum):
    """Sections of the structured brief behind template 7.1 (JSON keys of `briefs.data`)."""

    summary = "summary"
    requirements = "requirements"
    questions = "questions"
    risks = "risks"
    included = "included"
    excluded = "excluded"
    assumptions = "assumptions"
    acceptance_criteria = "acceptanceCriteria"
    estimates = "estimates"
    next_steps = "nextSteps"
    glossary = "glossary"
    decisions = "decisions"
    resolved_questions = "resolvedQuestions"


class DecisionStatus(StrEnum):
    """Lifecycle of a decision record captured while grilling the scope."""

    proposed = "proposed"
    accepted = "accepted"
    superseded = "superseded"


class ImageMimeType(StrEnum):
    jpeg = "image/jpeg"
    png = "image/png"
    webp = "image/webp"


IMAGE_EXTENSIONS: dict[ImageMimeType, str] = {
    ImageMimeType.jpeg: ".jpg",
    ImageMimeType.png: ".png",
    ImageMimeType.webp: ".webp",
}


class CredentialKind(StrEnum):
    """How a request authenticated."""

    api_key = "api_key"
    oauth = "oauth"
    local = "local"


class AgentMode(StrEnum):
    """How queued projects reach the server-side scope agent.

    - `worker`: a background loop in a long-lived process (Docker, Render).
    - `inline`: the request that queued the project runs the agent before answering (Vercel).
    - `off`: projects stay queued; `POST /api/agent/run` (cron) processes them.
    """

    worker = "worker"
    inline = "inline"
    off = "off"
