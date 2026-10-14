"""ScopeProfit MCP tools and the scope grilling prompt, built on the official `mcp` Python SDK.

Every tool acts as the authenticated principal of the current request (`current_principal`), declares
MCP annotations (readOnlyHint / destructiveHint / openWorldHint / idempotentHint), publishes an output
schema (its return model) and, for ChatGPT apps, `securitySchemes` in `_meta`. There is no pricing.
"""

import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Annotated, Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import ToolAnnotations
from pydantic import EmailStr, Field

from scopeprofit import __version__
from scopeprofit.container import Services
from scopeprofit.domain.branding import DEFAULT_BRANDING, Branding
from scopeprofit.domain.brief import BriefData, DecisionRecord, GlossaryTerm, Question
from scopeprofit.domain.views import (
    AddedInput,
    AnswersWrite,
    Approval,
    Archived,
    BrandingView,
    BriefDiff,
    BriefVersions,
    BriefWrite,
    ChangeRequests,
    ChangeRequestView,
    Conversation,
    CreatedProject,
    DocumentVersions,
    ExportLink,
    GrillRound,
    ProjectDetail,
    ProjectPage,
    Profile,
    ScopeDocument,
    SectionWrite,
    Tldr,
)
from scopeprofit.enums import (
    BriefSource,
    ChangeDecision,
    DecisionStatus,
    ExportFormat,
    InputAuthor,
    ProjectStatus,
    ScopeSection,
)
from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.services.accounts import Principal
from scopeprofit.services.grilling import Answer
from scopeprofit.services.oauth import SCOPE

current_principal: ContextVar[Principal | None] = ContextVar("scopeprofit_mcp_principal", default=None)
"""Set by the HTTP endpoint (bearer token) or the stdio entrypoint (API key) for each request."""

SECURITY_SCHEMES: list[dict[str, object]] = [{"type": "oauth2", "scopes": [SCOPE]}]

INSTRUCTIONS = (
    "ScopeProfit turns a messy client idea into a versioned scope brief and a template 7.1 document "
    "(PDF/DOCX/Markdown). Workflow: create_project → add_client_input with what the client said → run the "
    "grilling interview (get_question_round, ask_questions, submit_answers; record_glossary_term and "
    "record_decision as terms and hard decisions crystallise) until the round is empty → fill the remaining "
    "sections with update_scope_section → review get_scope_document → export_document → approve_scope. "
    "Use the grill_scope prompt for the interview. ScopeProfit never prices work: estimates are hours only."
)

ProjectId = Annotated[uuid.UUID, Field(description="Project id returned by create_project or list_projects")]
ExpectedVersion = Annotated[
    int, Field(ge=0, description="Brief version you read last (briefVersion); a newer version returns a conflict")
]


@dataclass(frozen=True)
class Hints:
    read_only: bool
    destructive: bool = False
    idempotent: bool = False
    open_world: bool = False

    def annotations(self, title: str) -> ToolAnnotations:
        return ToolAnnotations(
            title=title,
            read_only_hint=self.read_only,
            destructive_hint=self.destructive,
            idempotent_hint=self.idempotent,
            open_world_hint=self.open_world,
        )


READ = Hints(read_only=True, idempotent=True)
WRITE = Hints(read_only=False)
IDEMPOTENT_WRITE = Hints(read_only=False, idempotent=True)


def principal() -> Principal:
    found = current_principal.get()
    if found is None:
        raise ToolError(f"{ErrorCode.unauthenticated.value}: connect your ScopeProfit account first")
    return found


async def run[T](call: Awaitable[T]) -> T:
    """Domain errors become tool errors with their stable code, readable by the model."""
    try:
        return await call
    except DomainError as error:
        raise ToolError(f"{error.code.value}: {error.message}") from error


def build_mcp(services: Services) -> MCPServer:
    server = MCPServer(
        "scopeprofit",
        title="ScopeProfit",
        description="Messy client idea → grilled, versioned scope brief → template 7.1 document (PDF/DOCX).",
        instructions=INSTRUCTIONS,
        website_url=services.settings.public_api_url,
        version=__version__,
    )
    scope = services.scope
    grilling = services.grilling

    def tool[**P, R](
        name: str, title: str, description: str, hints: Hints, *, meta: dict[str, object] | None = None
    ) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
        def register(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
            server.add_tool(
                fn,
                name=name,
                title=title,
                description=description,
                annotations=hints.annotations(title),
                meta={"securitySchemes": SECURITY_SCHEMES, **(meta or {})},
                structured_output=True,
            )
            return fn

        return register

    # ----- account -------------------------------------------------------------------------

    @tool(
        "whoami",
        "Who am I",
        "Return the profile behind this connection: a stable opaque id plus the account email.",
        READ,
        meta={"openai/profile": True},
    )
    async def whoami() -> Profile:
        caller = principal()
        return Profile(id=str(caller.user_id), email=caller.email, nickname=caller.email)

    @tool("get_branding", "Get document branding", "Brand name, tagline, colors and cover title used in documents.", READ)
    async def get_branding() -> BrandingView:
        branding = await services.accounts.branding(principal().user_id)
        return BrandingView(branding=branding, is_default=branding == DEFAULT_BRANDING)

    @tool(
        "set_branding",
        "Set document branding",
        "Save the brand name, tagline, colors (#RRGGBB) and two-line cover title used on the cover and headers of "
        "future documents. Pass reset=true to return to the neutral ScopeProfit branding.",
        IDEMPOTENT_WRITE,
    )
    async def set_branding(branding: Branding | None = None, reset: bool = False) -> BrandingView:
        if branding is None and not reset:
            raise ToolError(f"{ErrorCode.validation_failed.value}: pass branding, or reset=true")
        saved = await services.accounts.set_branding(principal().user_id, None if reset else branding)
        return BrandingView(branding=saved, is_default=saved == DEFAULT_BRANDING)

    # ----- projects ------------------------------------------------------------------------

    @tool("list_projects", "List projects", "List your scope projects, newest first, with cursor paging.", READ)
    async def list_projects(
        status: ProjectStatus | None = None,
        cursor: str | None = None,
        limit: Annotated[int, Field(ge=1, le=50)] = 20,
    ) -> ProjectPage:
        return await run(scope.list_projects(principal(), status=status, cursor=cursor, limit=limit))

    @tool("create_project", "Create project", "Start a scope project for one client idea.", WRITE)
    async def create_project(
        name: Annotated[str, Field(min_length=1, max_length=200)],
        client_email: EmailStr | None = None,
    ) -> CreatedProject:
        return await run(scope.create_project(principal(), name, client_email))

    @tool("get_project", "Get project", "Status, versions and counters of one project.", READ)
    async def get_project(project_id: ProjectId) -> ProjectDetail:
        return await run(scope.get_project(principal(), project_id))

    @tool(
        "archive_project",
        "Archive project",
        "Archive a project. It stays readable but can no longer be edited.",
        Hints(read_only=False, destructive=True, idempotent=True),
    )
    async def archive_project(project_id: ProjectId) -> Archived:
        return await run(scope.archive(principal(), project_id))

    @tool(
        "add_client_input",
        "Add client input",
        "Store what the client said, verbatim, plus optional public image URLs (screenshots, sketches). Every "
        "requirement must later quote one of these messages. analyze=true queues the server-side agent.",
        Hints(read_only=False, open_world=True),
    )
    async def add_client_input(
        project_id: ProjectId,
        text: Annotated[str, Field(max_length=100_000)] | None = None,
        image_urls: Annotated[list[str], Field(max_length=5)] | None = None,
        author: InputAuthor = InputAuthor.client,
        analyze: bool = False,
    ) -> AddedInput:
        return await run(
            scope.add_input(
                principal(), project_id, text=text, image_urls=image_urls or [], author=author, analyze=analyze
            )
        )

    @tool("get_conversation", "Get conversation", "Stored client messages with their ids (for sources).", READ)
    async def get_conversation(
        project_id: ProjectId, limit: Annotated[int, Field(ge=1, le=200)] = 100
    ) -> Conversation:
        return await run(scope.get_conversation(principal(), project_id, limit))

    @tool("get_tldr", "Get TL;DR", "Five-line summary, blocking questions and hour range of a project.", READ)
    async def get_tldr(project_id: ProjectId) -> Tldr:
        return await run(scope.get_tldr(principal(), project_id))

    # ----- grilling ------------------------------------------------------------------------

    @tool(
        "get_question_round",
        "Get question round",
        "The next grilling round: every open question whose prerequisites are settled, with recommended answers "
        "and a ready-to-show Markdown version. done=true means the frontier is empty.",
        READ,
    )
    async def get_question_round(project_id: ProjectId) -> GrillRound:
        return await run(grilling.question_round(principal(), project_id))

    @tool(
        "ask_questions",
        "Ask questions",
        "Add open questions to the design tree. Give each a recommendedAnswer worded so 'yes' accepts it, and "
        "dependsOn with the ids of questions that must be answered first. Returns the recomputed round.",
        WRITE,
    )
    async def ask_questions(
        project_id: ProjectId,
        expected_version: ExpectedVersion,
        questions: Annotated[list[Question], Field(min_length=1, max_length=30)],
    ) -> GrillRound:
        return await run(grilling.ask_questions(principal(), project_id, expected_version, questions))

    @tool(
        "submit_answers",
        "Submit answers",
        "Record the person's answers to questions of the current round (all at once). Each answer is stored "
        "verbatim as a client message (usable as a requirement source), moved to resolvedQuestions and the next "
        "round is returned. 'yes' accepts the recommended answer.",
        WRITE,
    )
    async def submit_answers(
        project_id: ProjectId,
        expected_version: ExpectedVersion,
        answers: Annotated[list[Answer], Field(min_length=1, max_length=30)],
        author: InputAuthor = InputAuthor.client,
    ) -> AnswersWrite:
        return await run(grilling.submit_answers(principal(), project_id, expected_version, answers, author))

    @tool(
        "record_glossary_term",
        "Record glossary term",
        "Record a domain term the moment it is agreed: a tight definition of what it IS (no implementation "
        "detail) and the synonyms to avoid. Replaces a term with the same name.",
        IDEMPOTENT_WRITE,
    )
    async def record_glossary_term(
        project_id: ProjectId,
        expected_version: ExpectedVersion,
        term: Annotated[str, Field(min_length=1, max_length=200)],
        definition: Annotated[str, Field(min_length=1, max_length=2_000)],
        avoid: Annotated[list[str], Field(max_length=20)] | None = None,
    ) -> BriefWrite:
        entry = GlossaryTerm(term=term, definition=definition, avoid=avoid or [])
        return await run(grilling.record_term(principal(), project_id, expected_version, entry))

    @tool(
        "record_decision",
        "Record decision",
        "Record a scope decision only when it is hard to reverse, surprising without context AND the result of "
        "a real trade-off. 1-3 sentences: context, decision, why. Replaces a decision with the same id.",
        IDEMPOTENT_WRITE,
    )
    async def record_decision(
        project_id: ProjectId,
        expected_version: ExpectedVersion,
        decision_id: Annotated[str, Field(min_length=1, max_length=50, description="e.g. D-01")],
        title: Annotated[str, Field(min_length=1, max_length=300)],
        decision: Annotated[str, Field(min_length=1, max_length=4_000)],
        considered_options: Annotated[list[str], Field(max_length=20)] | None = None,
        consequences: str = "",
        status: DecisionStatus = DecisionStatus.accepted,
    ) -> BriefWrite:
        record = DecisionRecord(
            id=decision_id,
            title=title,
            decision=decision,
            considered_options=considered_options or [],
            consequences=consequences,
            status=status,
        )
        return await run(grilling.record_decision(principal(), project_id, expected_version, record))

    # ----- brief ---------------------------------------------------------------------------

    @tool(
        "get_scope_document",
        "Get scope document",
        "The current brief (JSON) and the template 7.1 document rendered as Markdown.",
        READ,
    )
    async def get_scope_document(project_id: ProjectId) -> ScopeDocument:
        return await run(scope.scope_document(principal(), project_id))

    @tool(
        "update_scope_section",
        "Update scope section",
        "Replace one brief section (summary, requirements, risks, included, excluded, assumptions, "
        "acceptanceCriteria, estimates, nextSteps, glossary, decisions, questions). Requirements must quote a "
        "stored message exactly. Estimates are hours only, never prices. Creates a new brief and document version.",
        WRITE,
    )
    async def update_scope_section(
        project_id: ProjectId,
        expected_version: ExpectedVersion,
        section: ScopeSection,
        value: object,
    ) -> SectionWrite:
        if section is ScopeSection.resolved_questions:
            raise ToolError(f"{ErrorCode.invalid_section_value.value}: answer questions with submit_answers")
        return await run(scope.update_section(principal(), project_id, expected_version, section, value))

    @tool(
        "replace_brief",
        "Replace brief",
        "Replace the whole brief at once (all sections). Prefer update_scope_section for single changes.",
        WRITE,
    )
    async def replace_brief(project_id: ProjectId, expected_version: ExpectedVersion, brief: BriefData) -> BriefWrite:
        return await run(scope.replace_brief(principal(), project_id, expected_version, brief, BriefSource.mcp))

    @tool("list_brief_versions", "List brief versions", "Every saved brief version, newest first.", READ)
    async def list_brief_versions(project_id: ProjectId) -> BriefVersions:
        return await run(scope.brief_versions(principal(), project_id))

    @tool(
        "diff_brief_versions",
        "Diff brief versions",
        "Keys added, removed or changed between two brief versions (requirements, questions, glossary, ...).",
        READ,
    )
    async def diff_brief_versions(
        project_id: ProjectId,
        from_version: Annotated[int, Field(ge=1)],
        to_version: Annotated[int, Field(ge=1)],
    ) -> BriefDiff:
        return await run(scope.brief_diff(principal(), project_id, from_version, to_version))

    # ----- documents -----------------------------------------------------------------------

    @tool(
        "render_document",
        "Render document",
        "Render the template 7.1 document (Markdown, PDF and DOCX) for the current brief as a new version.",
        WRITE,
    )
    async def render_document(project_id: ProjectId) -> DocumentVersions:
        await run(scope.regenerate(principal(), project_id))
        return await run(scope.document_versions(principal(), project_id))

    @tool("list_document_versions", "List document versions", "Rendered document versions and formats.", READ)
    async def list_document_versions(project_id: ProjectId) -> DocumentVersions:
        return await run(scope.document_versions(principal(), project_id))

    @tool(
        "export_document",
        "Export document",
        "A short-lived download link for the document as pdf, docx or md (latest version unless given).",
        READ,
    )
    async def export_document(
        project_id: ProjectId,
        format: ExportFormat = ExportFormat.pdf,  # noqa: A002 - the MCP argument name clients use
        version: Annotated[int, Field(ge=1)] | None = None,
    ) -> ExportLink:
        return await run(scope.export(principal(), project_id, format, version))

    @tool(
        "approve_scope",
        "Approve scope",
        "Approve a document version (locks the project). It is emailed to the client only when "
        "send_to_client=true; by default it is not sent and download links are returned.",
        Hints(read_only=False, destructive=True, open_world=True),
    )
    async def approve_scope(
        project_id: ProjectId,
        document_version: Annotated[int, Field(ge=1)],
        send_to_client: bool = False,
        client_email: EmailStr | None = None,
    ) -> Approval:
        return await run(
            scope.approve(
                principal(),
                project_id,
                document_version,
                send_to_client=send_to_client,
                client_email=client_email,
            )
        )

    # ----- change requests -----------------------------------------------------------------

    @tool(
        "log_change_request",
        "Log change request",
        "Record a change the client asks for after the scope was approved; it is classified as in scope, out of "
        "scope or ambiguous against the brief.",
        WRITE,
    )
    async def log_change_request(
        project_id: ProjectId, request: Annotated[str, Field(min_length=1, max_length=10_000)]
    ) -> ChangeRequestView:
        return await run(scope.log_change_request(principal(), project_id, request))

    @tool("list_change_requests", "List change requests", "Change requests of a project, newest first.", READ)
    async def list_change_requests(project_id: ProjectId) -> ChangeRequests:
        return await run(scope.list_change_requests(principal(), project_id))

    @tool(
        "decide_change_request",
        "Decide change request",
        "Accept or reject a proposed change request.",
        IDEMPOTENT_WRITE,
    )
    async def decide_change_request(
        project_id: ProjectId, change_request_id: uuid.UUID, decision: ChangeDecision
    ) -> ChangeRequestView:
        return await run(scope.decide_change_request(principal(), project_id, change_request_id, decision))

    # ----- prompt --------------------------------------------------------------------------

    @server.prompt(
        name="grill_scope",
        title="Grill a client idea into a scope",
        description="Interview the person relentlessly, in rounds, until the scope is unambiguous; record the "
        "glossary and decisions as they crystallise, then produce the template 7.1 document.",
    )
    async def grill_scope(project_id: str, language: Literal["es", "en"] = "es") -> str:
        return grill_prompt(project_id, language)

    return server


def grill_prompt(project_id: str, language: str) -> str:
    reply_in = "Spanish" if language == "es" else "English"
    return (
        f"You are scoping ScopeProfit project {project_id}. Talk to the person in {reply_in}; tool arguments and "
        "ids stay as they are.\n\n"
        "1. Read the state: get_project, get_conversation and get_question_round.\n"
        "2. Map the scope as a design tree: every decision branches into the decisions that hang off it. Add the "
        "open questions with ask_questions, each with a recommendedAnswer worded so that 'yes' accepts it and "
        "dependsOn listing the questions that must be settled first.\n"
        "3. Work in rounds. A round is the whole frontier returned by get_question_round: ask every question of "
        "the round at once (show its `formatted` Markdown), then stop and wait for the answers. Never ask a "
        "question whose prerequisite is still open in the same round.\n"
        "4. Send all answers of the round with submit_answers (store them verbatim). Add the follow-up questions "
        "the answers unlock with ask_questions and continue with the next round.\n"
        "5. Facts are your job, decisions are theirs: never ask for something you can read from the conversation "
        "or the brief. Each decision is put to the person and you wait.\n"
        "6. As language settles, call record_glossary_term immediately (one tight definition of what the term IS, "
        "plus words to avoid). Challenge words that conflict with the glossary and invent concrete edge-case "
        "scenarios to sharpen fuzzy terms.\n"
        "7. Call record_decision only for decisions that are hard to reverse, surprising without context and a "
        "real trade-off. Most rounds produce none.\n"
        "8. The interview ends when get_question_round returns done=true and the person confirms you share one "
        "understanding. Then fill summary, requirements (quoting stored messages exactly), included, excluded, "
        "assumptions, acceptanceCriteria, estimates (hours per stage with activities, never prices) and nextSteps "
        "with update_scope_section, review get_scope_document and share export_document links (pdf and docx).\n"
        "9. Never approve or send anything to the client unless the person explicitly asks (approve_scope with "
        "send_to_client=false by default)."
    )
