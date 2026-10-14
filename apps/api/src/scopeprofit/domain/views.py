"""Response models shared by the REST API, the MCP tools (as output schemas) and Telegram.

Fields serialize in camelCase, the wire format the previous backend and its MCP clients used.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from scopeprofit.domain.branding import Branding
from scopeprofit.domain.brief import BriefData, BriefDiffEntry, Question
from scopeprofit.enums import (
    AgentStatus,
    AuthorRole,
    ChangeClassification,
    ChangeRequestStatus,
    ExportFormat,
    ProjectStatus,
    ScopeSection,
)


class View(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


class ProjectListItem(View):
    project_id: uuid.UUID
    name: str
    status: ProjectStatus
    agent_status: AgentStatus
    tldr: str | None = Field(description="Executive summary of the brief, if any")
    blocking_questions: int
    updated_at: datetime


class ProjectPage(View):
    projects: list[ProjectListItem]
    next_cursor: str | None = Field(description="Pass as `cursor` to get the next page")


class CreatedProject(View):
    project_id: uuid.UUID
    name: str
    status: ProjectStatus
    client_email: str | None
    next: str


class DocumentState(View):
    version: int
    status: str
    brief_version: int
    up_to_date: bool


class ProjectCounts(View):
    messages: int
    requirements: int
    pending_questions: int
    blocking_questions: int
    risks: int


class ProjectDetail(View):
    project_id: uuid.UUID
    name: str
    status: ProjectStatus
    agent_status: AgentStatus
    agent_error: str | None
    client_email: str | None
    brief_version: int
    document: DocumentState | None
    counts: ProjectCounts
    editable: bool
    created_at: datetime
    updated_at: datetime


class AddedMessage(View):
    message_id: uuid.UUID
    kind: str = Field(description="'text' or 'image'")
    file_id: uuid.UUID | None = None


class AddedInput(View):
    project_id: uuid.UUID
    added: list[AddedMessage]
    agent_status: AgentStatus
    next: str


class StoredFile(View):
    file_id: uuid.UUID
    name: str
    mime_type: str
    size: int


class ConversationMessage(View):
    message_id: uuid.UUID
    author_role: AuthorRole | str
    content: str
    files: list[StoredFile]
    created_at: datetime


class Conversation(View):
    project_id: uuid.UUID
    messages: list[ConversationMessage]


class HourRange(View):
    min: float
    max: float


class TopQuestion(View):
    id: str
    question: str


class Tldr(View):
    project_id: uuid.UUID
    name: str
    status: ProjectStatus
    agent_status: AgentStatus
    brief_version: int
    tldr: str
    requirements: int
    blocking_questions: int
    top_questions: list[TopQuestion]
    red_risks: int
    estimate_hours: HourRange | None


class PendingQuestions(View):
    project_id: uuid.UUID
    brief_version: int
    questions: list[Question]


class BriefState(View):
    project_id: uuid.UUID
    brief_version: int
    document_version: int | None
    brief: BriefData


class BriefWrite(View):
    project_id: uuid.UUID
    brief_version: int
    document_version: int


class SectionWrite(BriefWrite):
    section: ScopeSection


class AnsweredQuestion(BriefWrite):
    answered_question_id: str
    message_id: uuid.UUID


class ScopeDocument(View):
    project_id: uuid.UUID
    template: str = "7.1"
    brief_version: int
    document_version: int | None
    document_status: str | None
    document_up_to_date: bool
    markdown: str
    brief: BriefData


class VersionRef(View):
    version: int
    source: str
    actor_id: str | None


class BriefDiff(View):
    project_id: uuid.UUID
    from_: VersionRef = Field(alias="from")
    to: VersionRef
    changes: list[BriefDiffEntry]


class ExportLink(View):
    project_id: uuid.UUID
    version: int
    format: ExportFormat
    url: str
    expires_at: datetime


class DownloadLinks(View):
    pdf: ExportLink
    docx: ExportLink


class Approval(View):
    project_id: uuid.UUID
    document_version: int
    status: str
    emailed_to_client: bool
    downloads: DownloadLinks


class DocumentVersionView(View):
    id: uuid.UUID
    version: int
    brief_version: int
    status: str
    created_at: datetime
    formats: list[ExportFormat]


class DocumentVersions(View):
    project_id: uuid.UUID
    versions: list[DocumentVersionView]


class Archived(View):
    project_id: uuid.UUID
    status: ProjectStatus


class ChangeRequestView(View):
    change_request_id: uuid.UUID
    request: str
    classification: ChangeClassification
    status: ChangeRequestStatus
    base_brief_version: int
    created_at: datetime


class ChangeRequests(View):
    project_id: uuid.UUID
    change_requests: list[ChangeRequestView]


class RoundQuestion(View):
    id: str
    question: str
    reason: str
    recommended_answer: str
    blocks_estimate: bool


class WaitingQuestion(View):
    id: str
    question: str
    waits_for: list[str] = Field(description="Open question ids that must be answered first")


class GrillRound(View):
    """The next grilling round: every open question whose prerequisites are settled, asked together."""

    project_id: uuid.UUID
    brief_version: int
    round: int
    questions: list[RoundQuestion]
    waiting: list[WaitingQuestion]
    resolved: int
    glossary_terms: int
    decisions: int
    done: bool = Field(description="True when no question is open: the frontier is empty")
    formatted: str = Field(description="The round as Markdown, ready to show the person being interviewed")
    next: str


class AnswersWrite(BriefWrite):
    resolved_question_ids: list[str]
    message_ids: list[uuid.UUID]
    next_round: GrillRound


class Profile(View):
    """OpenAI apps profile contract: a stable opaque id plus display metadata."""

    id: str
    email: str | None = None
    nickname: str | None = None


class BriefVersionItem(View):
    version: int
    source: str
    actor_id: str | None
    created_at: datetime
    open_questions: int
    resolved_questions: int
    glossary_terms: int
    decisions: int


class BriefVersions(View):
    project_id: uuid.UUID
    current_version: int
    versions: list[BriefVersionItem]


class BrandingView(View):
    branding: Branding
    is_default: bool
