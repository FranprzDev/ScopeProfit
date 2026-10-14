"""The scope workflow: projects, client input, the versioned brief, template 7.1 documents,
approval and change requests. REST, MCP and Telegram all call this service, and every query is
scoped to the calling principal's own projects."""

import asyncio
import base64
import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from http import HTTPStatus

from sqlalchemy import Select, and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from scopeprofit.db.models import (
    Brief,
    BriefVersion,
    ChangeRequest,
    Document,
    DocumentVersion,
    File,
    Message,
    Project,
    User,
)
from scopeprofit.db.session import Database
from scopeprofit.domain.branding import DEFAULT_BRANDING, Branding
from scopeprofit.domain.brief import (
    BriefData,
    SourceMessage,
    approval_blocker,
    diff_briefs,
    parse_brief,
    replace_section,
    resolve_questions,
    validate_sources,
)
from scopeprofit.domain.views import (
    AddedInput,
    AddedMessage,
    AnsweredQuestion,
    Approval,
    Archived,
    BriefDiff,
    BriefState,
    BriefWrite,
    ChangeRequests,
    ChangeRequestView,
    Conversation,
    ConversationMessage,
    CreatedProject,
    DocumentState,
    DocumentVersions,
    DocumentVersionView,
    DownloadLinks,
    ExportLink,
    HourRange,
    PendingQuestions,
    ProjectCounts,
    ProjectDetail,
    ProjectListItem,
    ProjectPage,
    ScopeDocument,
    SectionWrite,
    StoredFile,
    Tldr,
    TopQuestion,
    VersionRef,
)
from scopeprofit.enums import (
    BUSY_AGENT_STATUSES,
    EXPORT_MIME_TYPES,
    LOCKED_PROJECT_STATUSES,
    REVIEWABLE_PROJECT_STATUSES,
    AgentStatus,
    AuthorRole,
    BriefSource,
    ChangeClassification,
    ChangeDecision,
    ChangeRequestStatus,
    DocumentStatus,
    ExportFormat,
    InputAuthor,
    ProjectStatus,
    RiskSeverity,
    ScopeSection,
)
from scopeprofit.errors import DomainError, ErrorCode, conflict, not_found
from scopeprofit.render.template71 import DocumentContext, render_all, render_markdown
from scopeprofit.security import utcnow
from scopeprofit.services.accounts import AuditAction, Principal, audit
from scopeprofit.services.email import Attachment, EmailSender
from scopeprofit.services.exports import ExportSigner
from scopeprofit.services.images import ImageBytes, ImageFetcher
from scopeprofit.services.storage import Storage, validate_text

DEFAULT_CLIENT_NAME = "Cliente"
DEFAULT_AUTHOR = "Profesional"
IMAGE_PLACEHOLDER = "[imagen]"


@dataclass(frozen=True)
class Download:
    content: bytes
    filename: str
    mime_type: str


def _encode_cursor(updated_at: datetime, project_id: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(f"{updated_at.isoformat()}|{project_id}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        stamp, _, raw_id = base64.urlsafe_b64decode(cursor.encode()).decode().partition("|")
        return datetime.fromisoformat(stamp), uuid.UUID(raw_id)
    except (ValueError, UnicodeDecodeError) as error:
        raise DomainError(ErrorCode.validation_failed, "Invalid cursor") from error


def classify_change(request: str, brief: BriefData) -> ChangeClassification:
    """Textual match against the brief's excluded items first, then included ones."""
    text = request.strip().lower()
    for item in brief.excluded:
        if item.lower() in text:
            return ChangeClassification.out_of_scope
    for item in brief.included:
        if item.lower() in text:
            return ChangeClassification.in_scope
    return ChangeClassification.ambiguous


class ScopeService:
    def __init__(
        self,
        db: Database,
        storage: Storage,
        email: EmailSender,
        exports: ExportSigner,
        images: ImageFetcher,
    ) -> None:
        self.db = db
        self.storage = storage
        self.email = email
        self.exports = exports
        self.images = images
        self.agent_runner: Callable[[uuid.UUID], Awaitable[None]] | None = None
        """Set in AGENT_MODE=inline: runs the agent for a project right after it is queued."""

    # ----- helpers -------------------------------------------------------------------------

    @staticmethod
    def _owned(principal: Principal, project_id: uuid.UUID) -> Select[Project]:
        return select(Project).where(Project.id == project_id, Project.owner_id == principal.user_id)

    async def _project(
        self, session: AsyncSession, principal: Principal, project_id: uuid.UUID, *, lock: bool = False
    ) -> Project:
        query = self._owned(principal, project_id).options(selectinload(Project.brief), selectinload(Project.document))
        if lock:
            query = query.with_for_update(of=Project)
        project = await session.scalar(query)
        if project is None:
            raise not_found(ErrorCode.project_not_found, "No project with that id in your account")
        return project

    async def _editable(self, session: AsyncSession, principal: Principal, project_id: uuid.UUID) -> Project:
        project = await self._project(session, principal, project_id, lock=True)
        if project.status in LOCKED_PROJECT_STATUSES:
            raise conflict(ErrorCode.project_locked, f"Project is {project.status.value} and can no longer be edited")
        return project

    @staticmethod
    def _brief_of(project: Project) -> tuple[BriefData, int]:
        if project.brief is None:
            return BriefData(), 0
        return parse_brief(project.brief.data), project.brief.version

    @staticmethod
    async def _latest_version(session: AsyncSession, project: Project) -> DocumentVersion | None:
        if project.document is None:
            return None
        return await session.scalar(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == project.document.id)
            .order_by(DocumentVersion.version.desc())
            .limit(1)
        )

    async def run_agent_inline(self, project_id: uuid.UUID) -> None:
        if self.agent_runner is not None:
            await self.agent_runner(project_id)

    @staticmethod
    async def enqueue_agent(session: AsyncSession, project_id: uuid.UUID) -> None:
        await session.execute(
            update(Project)
            .where(
                Project.id == project_id,
                Project.status.not_in(LOCKED_PROJECT_STATUSES),
                Project.agent_status != AgentStatus.running,
            )
            .values(agent_status=AgentStatus.pending, agent_error=None)
        )

    async def _messages(self, session: AsyncSession, project_id: uuid.UUID) -> list[SourceMessage]:
        rows = await session.execute(select(Message.id, Message.content).where(Message.project_id == project_id))
        return [SourceMessage(row.id, row.content) for row in rows]

    async def save_brief(
        self,
        session: AsyncSession,
        project_id: uuid.UUID,
        expected_version: int,
        brief: BriefData,
        source: BriefSource,
        actor_id: uuid.UUID | None,
    ) -> int:
        """Optimistic-locked write of the brief plus its immutable version row."""
        result = await session.execute(
            update(Brief)
            .where(Brief.project_id == project_id, Brief.version == expected_version)
            .values(version=Brief.version + 1, data=brief.to_json(), updated_at=utcnow())
        )
        if not getattr(result, "rowcount", 0):
            raise conflict(ErrorCode.version_conflict, "Brief changed; re-read it with get_scope_document and retry")
        version = expected_version + 1
        session.add(
            BriefVersion(
                project_id=project_id,
                version=version,
                data=brief.to_json(),
                source=source.value,
                actor_id=str(actor_id) if actor_id else None,
            )
        )
        audit(
            session,
            AuditAction.brief_updated,
            project_id=project_id,
            actor_id=actor_id,
            metadata={"version": version, "source": source.value},
        )
        return version

    async def generate_document(self, session: AsyncSession, project_id: uuid.UUID, actor_id: uuid.UUID | None) -> int:
        """Renders template 7.1 for the current brief and stores a new document version.

        Runs inside the caller's transaction, which must hold the project row lock."""
        project = await session.scalar(
            select(Project)
            .options(selectinload(Project.brief), selectinload(Project.document))
            .where(Project.id == project_id)
        )
        if project is None or project.brief is None:
            raise not_found(ErrorCode.brief_not_found)
        if project.status in LOCKED_PROJECT_STATUSES:
            raise conflict(ErrorCode.project_locked, "Project is not editable")
        owner = await session.get(User, project.owner_id)
        document = project.document
        if document is None:
            document = Document(project_id=project_id, current_version=0)
            session.add(document)
            await session.flush()
        locked = await session.scalar(select(Document).where(Document.id == document.id).with_for_update())
        assert locked is not None
        version = locked.current_version + 1
        context = DocumentContext(
            project_name=project.name,
            client_name=project.client_email or DEFAULT_CLIENT_NAME,
            author=(owner.email if owner else None) or DEFAULT_AUTHOR,
            date=utcnow(),
            version=version,
            brief=parse_brief(project.brief.data),
            branding=Branding.model_validate(owner.branding) if owner and owner.branding else DEFAULT_BRANDING,
        )
        rendered = await asyncio.to_thread(render_all, context)
        generation = uuid.uuid4().hex
        artifacts: dict[str, object] = {}
        for export_format, content in rendered.items():
            stored = await self.storage.write(
                f"{project_id}/documents/{version}/{generation}.{export_format.value}", content, session
            )
            artifacts[export_format.value] = stored.to_json()
        locked.current_version = version
        session.add(
            DocumentVersion(
                document_id=locked.id,
                version=version,
                brief_version=project.brief.version,
                data={
                    "projectName": context.project_name,
                    "clientName": context.client_name,
                    "author": context.author,
                    "date": context.date.isoformat(),
                    "version": version,
                    "brief": context.brief.to_json(),
                    "editorContent": None,
                },
                editor_content=None,
                status=DocumentStatus.draft.value,
                artifacts=artifacts,
            )
        )
        project.status = ProjectStatus.in_review
        audit(
            session,
            AuditAction.document_generated,
            project_id=project_id,
            actor_id=actor_id,
            metadata={"version": version, "briefVersion": project.brief.version},
        )
        return version

    # ----- projects -------------------------------------------------------------------------

    async def list_projects(
        self,
        principal: Principal,
        *,
        status: ProjectStatus | None = None,
        include_archived: bool = False,
        limit: int = 20,
        cursor: str | None = None,
    ) -> ProjectPage:
        limit = max(1, min(100, limit))
        query = (
            select(Project)
            .options(selectinload(Project.brief))
            .where(Project.owner_id == principal.user_id)
            .order_by(Project.updated_at.desc(), Project.id.asc())
            .limit(limit + 1)
        )
        if status is not None:
            query = query.where(Project.status == status)
        elif not include_archived:
            query = query.where(Project.status != ProjectStatus.archived)
        if cursor:
            stamp, last_id = _decode_cursor(cursor)
            query = query.where(
                or_(Project.updated_at < stamp, and_(Project.updated_at == stamp, Project.id > last_id))
            )
        async with self.db.session() as session:
            projects = list(await session.scalars(query))
        more = len(projects) > limit
        projects = projects[:limit]
        items: list[ProjectListItem] = []
        for project in projects:
            brief, _ = self._brief_of(project)
            items.append(
                ProjectListItem(
                    project_id=project.id,
                    name=project.name,
                    status=project.status,
                    agent_status=project.agent_status,
                    tldr=brief.summary or None,
                    blocking_questions=len(brief.blocking_questions()),
                    updated_at=project.updated_at,
                )
            )
        last = projects[-1] if projects else None
        return ProjectPage(
            projects=items, next_cursor=_encode_cursor(last.updated_at, last.id) if more and last else None
        )

    async def create_project(self, principal: Principal, name: str, client_email: str | None = None) -> CreatedProject:
        clean = name.strip()[:200]
        if not clean:
            raise DomainError(ErrorCode.invalid_project_name, "Project name is required")
        async with self.db.session() as session:
            project = Project(
                name=clean,
                owner_id=principal.user_id,
                client_email=client_email.strip().lower() if client_email else None,
                status=ProjectStatus.draft,
                agent_status=AgentStatus.idle,
            )
            session.add(project)
            await session.flush()
            session.add(Brief(project_id=project.id, version=0, data=BriefData().to_json()))
            session.add(Document(project_id=project.id, current_version=0))
            audit(session, AuditAction.project_created, project_id=project.id, actor_id=principal.user_id)
            await session.commit()
        return CreatedProject(
            project_id=project.id,
            name=project.name,
            status=project.status,
            client_email=project.client_email,
            next="Send what the client said (text and image URLs) with add_client_input.",
        )

    async def get_project(self, principal: Principal, project_id: uuid.UUID) -> ProjectDetail:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
            brief, brief_version = self._brief_of(project)
            latest = await self._latest_version(session, project)
            messages = await session.scalar(select(func.count()).where(Message.project_id == project_id))
        return ProjectDetail(
            project_id=project.id,
            name=project.name,
            status=project.status,
            agent_status=project.agent_status,
            agent_error=project.agent_error,
            client_email=project.client_email,
            brief_version=brief_version,
            document=DocumentState(
                version=latest.version,
                status=latest.status,
                brief_version=latest.brief_version,
                up_to_date=latest.brief_version == brief_version,
            )
            if latest
            else None,
            counts=ProjectCounts(
                messages=messages or 0,
                requirements=len(brief.requirements),
                pending_questions=len(brief.questions),
                blocking_questions=len(brief.blocking_questions()),
                risks=len(brief.risks),
            ),
            editable=project.status not in LOCKED_PROJECT_STATUSES,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    async def archive(self, principal: Principal, project_id: uuid.UUID) -> Archived:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id, lock=True)
            if project.status is not ProjectStatus.archived:
                project.status = ProjectStatus.archived
                audit(session, AuditAction.project_archived, project_id=project_id, actor_id=principal.user_id)
            await session.commit()
        return Archived(project_id=project_id, status=ProjectStatus.archived)

    # ----- client input ---------------------------------------------------------------------

    async def add_input(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        *,
        text: str | None = None,
        image_urls: Sequence[str] = (),
        images: Sequence[ImageBytes] = (),
        author: InputAuthor = InputAuthor.client,
        analyze: bool = True,
    ) -> AddedInput:
        clean = text.strip() if text else ""
        if not clean and not image_urls and not images:
            raise DomainError(ErrorCode.empty_input, "Provide text, image_urls or both")
        if clean:
            validate_text(clean)
        async with self.db.session() as session:
            await self._editable(session, principal, project_id)
            await session.rollback()
        fetched = [*images, *[await self.images.fetch(url) for url in image_urls]]
        added: list[AddedMessage] = []
        async with self.db.session() as session:
            await self._editable(session, principal, project_id)
            if clean:
                message = self._message(project_id, principal, author.value, clean)
                session.add(message)
                await session.flush()
                added.append(AddedMessage(message_id=message.id, kind="text"))
            for image in fetched:
                written = await self.storage.write(
                    f"{project_id}/uploads/{uuid.uuid4()}{_suffix(image)}", image.content, session
                )
                message = self._message(project_id, principal, author.value, IMAGE_PLACEHOLDER)
                session.add(message)
                await session.flush()
                stored = File(
                    project_id=project_id,
                    message_id=message.id,
                    name=image.name,
                    mime_type=image.mime_type.value,
                    size=len(image.content),
                    path=written.path,
                    checksum=written.checksum,
                )
                session.add(stored)
                await session.flush()
                added.append(AddedMessage(message_id=message.id, kind="image", file_id=stored.id))
            audit(
                session,
                AuditAction.input_added,
                project_id=project_id,
                actor_id=principal.user_id,
                metadata={"messages": len(added), "images": len(fetched), "authorRole": author.value},
            )
            if analyze:
                await self.enqueue_agent(session, project_id)
            await session.commit()
        if analyze:
            await self.run_agent_inline(project_id)
        async with self.db.session() as session:
            agent_status = await session.scalar(select(Project.agent_status).where(Project.id == project_id))
        return AddedInput(
            project_id=project_id,
            added=added,
            agent_status=agent_status or AgentStatus.idle,
            next=(
                "The server-side scope agent re-analyses the project in the background. Poll get_tldr "
                "or get_project, or draft the scope yourself with update_scope_section."
                if analyze
                else "Draft or refine the scope with update_scope_section, citing these message ids as sources."
            ),
        )

    @staticmethod
    def _message(project_id: uuid.UUID, principal: Principal, role: str, content: str) -> Message:
        return Message(
            project_id=project_id,
            thread_id=str(project_id),
            author_id=str(principal.user_id),
            author_role=role,
            content=content,
            created_at=utcnow(),
        )

    async def get_conversation(self, principal: Principal, project_id: uuid.UUID, limit: int = 100) -> Conversation:
        limit = max(1, min(200, limit))
        async with self.db.session() as session:
            await self._project(session, principal, project_id)
            rows = list(
                await session.scalars(
                    select(Message)
                    .options(selectinload(Message.files))
                    .where(Message.project_id == project_id)
                    .order_by(Message.created_at.desc(), Message.id.desc())
                    .limit(limit)
                )
            )
        return Conversation(
            project_id=project_id,
            messages=[
                ConversationMessage(
                    message_id=message.id,
                    author_role=message.author_role,
                    content=message.content,
                    files=[
                        StoredFile(file_id=file.id, name=file.name, mime_type=file.mime_type, size=file.size)
                        for file in message.files
                    ],
                    created_at=message.created_at,
                )
                for message in reversed(rows)
            ],
        )

    # ----- brief ----------------------------------------------------------------------------

    async def get_tldr(self, principal: Principal, project_id: uuid.UUID) -> Tldr:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
        brief, version = self._brief_of(project)
        total_min, total_max = brief.total_hours()
        return Tldr(
            project_id=project_id,
            name=project.name,
            status=project.status,
            agent_status=project.agent_status,
            brief_version=version,
            tldr=brief.summary or "No summary yet: add client input first.",
            requirements=len(brief.requirements),
            blocking_questions=len(brief.blocking_questions()),
            top_questions=[TopQuestion(id=q.id, question=q.question) for q in brief.questions[:3]],
            red_risks=sum(1 for risk in brief.risks if risk.severity is RiskSeverity.red),
            estimate_hours=HourRange(min=total_min, max=total_max) if brief.estimates else None,
        )

    async def pending_questions(
        self, principal: Principal, project_id: uuid.UUID, blocking_only: bool = False
    ) -> PendingQuestions:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
        brief, version = self._brief_of(project)
        questions = brief.blocking_questions() if blocking_only else list(brief.questions)
        return PendingQuestions(project_id=project_id, brief_version=version, questions=questions)

    async def get_brief(self, principal: Principal, project_id: uuid.UUID) -> BriefState:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
        brief, version = self._brief_of(project)
        return BriefState(
            project_id=project_id,
            brief_version=version,
            document_version=project.document.current_version if project.document else None,
            brief=brief,
        )

    async def replace_brief(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        expected_version: int,
        brief: BriefData,
        source: BriefSource,
        *,
        analyze: bool = False,
    ) -> BriefWrite:
        async with self.db.session() as session:
            await self._editable(session, principal, project_id)
            validate_sources(brief, await self._messages(session, project_id))
            version = await self.save_brief(session, project_id, expected_version, brief, source, principal.user_id)
            document_version = await self.generate_document(session, project_id, principal.user_id)
            if analyze:
                await self.enqueue_agent(session, project_id)
            await session.commit()
        if analyze:
            await self.run_agent_inline(project_id)
        return BriefWrite(project_id=project_id, brief_version=version, document_version=document_version)

    async def update_section(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        expected_version: int,
        section: ScopeSection,
        value: object,
        *,
        reanalyze: bool = False,
    ) -> SectionWrite:
        async with self.db.session() as session:
            project = await self._editable(session, principal, project_id)
            brief, version = self._brief_of(project)
            if version != expected_version:
                raise conflict(
                    ErrorCode.version_conflict,
                    f"Brief is at version {version}; re-read it with get_scope_document and retry",
                )
            updated = replace_section(brief, section, value)
            if section is ScopeSection.requirements:
                validate_sources(updated, await self._messages(session, project_id))
            new_version = await self.save_brief(
                session, project_id, expected_version, updated, BriefSource.mcp, principal.user_id
            )
            document_version = await self.generate_document(session, project_id, principal.user_id)
            if reanalyze:
                await self.enqueue_agent(session, project_id)
            await session.commit()
        if reanalyze:
            await self.run_agent_inline(project_id)
        return SectionWrite(
            project_id=project_id, section=section, brief_version=new_version, document_version=document_version
        )

    async def answer_question(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        question_id: str,
        answer: str,
        *,
        analyze: bool = False,
    ) -> AnsweredQuestion:
        clean = validate_text(answer.strip())
        async with self.db.session() as session:
            project = await self._editable(session, principal, project_id)
            brief, version = self._brief_of(project)
            question = next((q for q in brief.questions if q.id == question_id), None)
            if question is None:
                raise not_found(ErrorCode.question_not_found, f"No pending question {question_id}")
            message = self._message(
                project_id, principal, AuthorRole.client.value, f"{question.id} — {question.question}\n{clean}"
            )
            session.add(message)
            await session.flush()
            remaining = resolve_questions(brief, [(question.id, clean)])
            new_version = await self.save_brief(
                session, project_id, version, remaining, BriefSource.mcp, principal.user_id
            )
            document_version = await self.generate_document(session, project_id, principal.user_id)
            if analyze:
                await self.enqueue_agent(session, project_id)
            await session.commit()
        if analyze:
            await self.run_agent_inline(project_id)
        return AnsweredQuestion(
            project_id=project_id,
            answered_question_id=question.id,
            message_id=message.id,
            brief_version=new_version,
            document_version=document_version,
        )

    async def brief_diff(
        self, principal: Principal, project_id: uuid.UUID, from_version: int, to_version: int
    ) -> BriefDiff:
        async with self.db.session() as session:
            await self._project(session, principal, project_id)
            versions = {
                row.version: row
                for row in await session.scalars(
                    select(BriefVersion).where(
                        BriefVersion.project_id == project_id, BriefVersion.version.in_([from_version, to_version])
                    )
                )
            }
        before = versions.get(from_version)
        after = versions.get(to_version)
        if before is None or after is None:
            raise not_found(ErrorCode.brief_version_not_found)
        return BriefDiff(
            project_id=project_id,
            from_=VersionRef(version=before.version, source=before.source, actor_id=before.actor_id),
            to=VersionRef(version=after.version, source=after.source, actor_id=after.actor_id),
            changes=diff_briefs(parse_brief(before.data), parse_brief(after.data)),
        )

    # ----- documents ------------------------------------------------------------------------

    async def scope_document(self, principal: Principal, project_id: uuid.UUID) -> ScopeDocument:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
            latest = await self._latest_version(session, project)
        brief, version = self._brief_of(project)
        markdown = render_markdown(
            DocumentContext(
                project_name=project.name,
                client_name=project.client_email or DEFAULT_CLIENT_NAME,
                author=principal.email or DEFAULT_AUTHOR,
                date=utcnow(),
                version=latest.version if latest else 0,
                brief=brief,
            )
        )
        return ScopeDocument(
            project_id=project_id,
            brief_version=version,
            document_version=latest.version if latest else None,
            document_status=latest.status if latest else None,
            document_up_to_date=latest is not None and latest.brief_version == version,
            markdown=markdown,
            brief=brief,
        )

    async def regenerate(self, principal: Principal, project_id: uuid.UUID) -> int:
        async with self.db.session() as session:
            await self._editable(session, principal, project_id)
            version = await self.generate_document(session, project_id, principal.user_id)
            await session.commit()
        return version

    async def document_versions(self, principal: Principal, project_id: uuid.UUID) -> DocumentVersions:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
            rows = (
                list(
                    await session.scalars(
                        select(DocumentVersion)
                        .where(DocumentVersion.document_id == project.document.id)
                        .order_by(DocumentVersion.version.desc())
                    )
                )
                if project.document
                else []
            )
        return DocumentVersions(
            project_id=project_id,
            versions=[
                DocumentVersionView(
                    id=row.id,
                    version=row.version,
                    brief_version=row.brief_version,
                    status=row.status,
                    created_at=row.created_at,
                    formats=[ExportFormat(name) for name in row.artifacts if name in ExportFormat.__members__],
                )
                for row in rows
            ],
        )

    async def _artifact(
        self, session: AsyncSession, project_id: uuid.UUID, version: int, export_format: ExportFormat
    ) -> Download:
        row = await session.scalar(
            select(DocumentVersion)
            .join(Document, Document.id == DocumentVersion.document_id)
            .where(Document.project_id == project_id, DocumentVersion.version == version)
        )
        artifact = row.artifacts.get(export_format.value) if row else None
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            raise not_found(ErrorCode.document_not_found, "Document not found")
        return Download(
            content=await self.storage.read(str(artifact["path"]), session),
            filename=f"scope-{project_id}-v{version}.{export_format.value}",
            mime_type=EXPORT_MIME_TYPES[export_format],
        )

    async def download(
        self, principal: Principal, project_id: uuid.UUID, version: int, export_format: ExportFormat
    ) -> Download:
        async with self.db.session() as session:
            await self._project(session, principal, project_id)
            return await self._artifact(session, project_id, version, export_format)

    async def download_signed(self, token: str) -> Download:
        claim = self.exports.verify(token)
        if claim is None:
            raise not_found(ErrorCode.invalid_export_link, "Export link is invalid or expired")
        async with self.db.session() as session:
            return await self._artifact(session, claim.project_id, claim.version, claim.format)

    async def export(
        self, principal: Principal, project_id: uuid.UUID, export_format: ExportFormat, version: int | None = None
    ) -> ExportLink:
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
            latest = await self._latest_version(session, project)
            chosen = version if version is not None else (latest.version if latest else None)
            if chosen is None:
                raise not_found(
                    ErrorCode.document_not_found,
                    "No document has been generated yet: fill the scope with update_scope_section first",
                )
            await self._artifact(session, project_id, chosen, export_format)
        return self.exports.link(project_id, chosen, export_format)

    async def approve(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        document_version: int,
        *,
        send_to_client: bool = True,
        client_email: str | None = None,
    ) -> Approval:
        if send_to_client and not self.email.enabled:
            raise DomainError(
                ErrorCode.email_not_configured,
                "Email delivery is not configured on this server: pass send_to_client=false and share an "
                "export_document link instead",
                HTTPStatus.SERVICE_UNAVAILABLE,
            )
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id, lock=True)
            if client_email and not project.client_email:
                project.client_email = client_email.strip().lower()
            if send_to_client and not project.client_email:
                raise DomainError(
                    ErrorCode.client_email_required,
                    "Pass client_email, or send_to_client=false and share an export_document link instead",
                )
            if project.document is None or project.document.current_version != document_version:
                raise conflict(ErrorCode.version_conflict, "Approve the current document version")
            saved = await self._latest_version(session, project)
            brief, brief_version = self._brief_of(project)
            if saved is None or saved.version != document_version or saved.brief_version != brief_version:
                raise conflict(ErrorCode.version_conflict, "Document does not match the current brief")
            if saved.approved_at is None:
                if project.status not in REVIEWABLE_PROJECT_STATUSES or project.agent_status in BUSY_AGENT_STATUSES:
                    raise conflict(ErrorCode.project_not_reviewable, "Project is not ready for review")
                blocker = approval_blocker(brief)
                if blocker is not None:
                    raise blocker
                saved.status = DocumentStatus.approved.value
                saved.approved_by = str(principal.user_id)
                saved.approved_at = utcnow()
                saved.delivery_key = f"scopeprofit-{saved.id}"
                project.status = ProjectStatus.approved
                audit(
                    session,
                    AuditAction.document_approved,
                    project_id=project_id,
                    actor_id=principal.user_id,
                    metadata={"version": document_version},
                )
            await session.commit()
            recipient = project.client_email
        emailed = False
        if send_to_client and recipient:
            emailed = await self._deliver(project_id, document_version, recipient)
        return Approval(
            project_id=project_id,
            document_version=document_version,
            status=DocumentStatus.delivered.value if emailed else DocumentStatus.approved.value,
            emailed_to_client=emailed,
            downloads=DownloadLinks(
                pdf=self.exports.link(project_id, document_version, ExportFormat.pdf),
                docx=self.exports.link(project_id, document_version, ExportFormat.docx),
            ),
        )

    async def _deliver(self, project_id: uuid.UUID, version: int, recipient: str) -> bool:
        async with self.db.session() as session:
            saved = await session.scalar(
                select(DocumentVersion)
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(Document.project_id == project_id, DocumentVersion.version == version)
            )
            if saved is None or saved.approved_at is None:
                raise DomainError(ErrorCode.document_not_approved, "Document requires approval")
            if saved.delivered_at is not None:
                return True
            pdf = await self._artifact(session, project_id, version, ExportFormat.pdf)
            docx = await self._artifact(session, project_id, version, ExportFormat.docx)
            await self.email.send(
                recipient,
                "Tu alcance aprobado — Scope-to-Profit",
                "<p>Adjuntamos el alcance aprobado en PDF y Word editable.</p>",
                [Attachment(pdf.filename, pdf.content), Attachment(docx.filename, docx.content)],
                saved.delivery_key,
            )
            changed = await session.execute(
                update(DocumentVersion)
                .where(DocumentVersion.id == saved.id, DocumentVersion.delivered_at.is_(None))
                .values(delivered_at=utcnow(), status=DocumentStatus.delivered.value)
            )
            if getattr(changed, "rowcount", 0):
                await session.execute(
                    update(Project).where(Project.id == project_id).values(status=ProjectStatus.delivered)
                )
                audit(session, AuditAction.document_delivered, project_id=project_id, metadata={"version": version})
            await session.commit()
        return True

    # ----- change requests --------------------------------------------------------------

    @staticmethod
    def _change_view(change: ChangeRequest) -> ChangeRequestView:
        return ChangeRequestView(
            change_request_id=change.id,
            request=change.request,
            classification=change.classification,
            status=change.status,
            base_brief_version=change.base_brief_version,
            created_at=change.created_at,
        )

    async def log_change_request(self, principal: Principal, project_id: uuid.UUID, request: str) -> ChangeRequestView:
        clean = request.strip()
        if not clean:
            raise DomainError(ErrorCode.invalid_change_request, "Describe the requested change")
        async with self.db.session() as session:
            project = await self._project(session, principal, project_id)
            brief, version = self._brief_of(project)
            change = ChangeRequest(
                project_id=project_id,
                actor_id=principal.user_id,
                base_brief_version=version,
                request=clean[:10_000],
                classification=classify_change(clean, brief),
                status=ChangeRequestStatus.proposed,
            )
            session.add(change)
            await session.flush()
            audit(
                session,
                AuditAction.change_request_created,
                project_id=project_id,
                actor_id=principal.user_id,
                metadata={"changeRequestId": str(change.id), "classification": change.classification.value},
            )
            await session.commit()
        return self._change_view(change)

    async def list_change_requests(self, principal: Principal, project_id: uuid.UUID) -> ChangeRequests:
        async with self.db.session() as session:
            await self._project(session, principal, project_id)
            rows = await session.scalars(
                select(ChangeRequest)
                .where(ChangeRequest.project_id == project_id)
                .order_by(ChangeRequest.created_at.desc())
            )
            return ChangeRequests(project_id=project_id, change_requests=[self._change_view(row) for row in rows])

    async def decide_change_request(
        self, principal: Principal, project_id: uuid.UUID, change_id: uuid.UUID, decision: ChangeDecision
    ) -> ChangeRequestView:
        status = ChangeRequestStatus(decision.value)
        async with self.db.session() as session:
            await self._project(session, principal, project_id)
            change = await session.scalar(
                select(ChangeRequest)
                .where(
                    ChangeRequest.id == change_id,
                    ChangeRequest.project_id == project_id,
                    ChangeRequest.status == ChangeRequestStatus.proposed,
                )
                .with_for_update()
            )
            if change is None:
                raise not_found(ErrorCode.change_request_not_found)
            change.status = status
            action = (
                AuditAction.change_request_accepted
                if decision is ChangeDecision.accepted
                else AuditAction.change_request_rejected
            )
            audit(
                session,
                action,
                project_id=project_id,
                actor_id=principal.user_id,
                metadata={"changeRequestId": str(change_id)},
            )
            await session.commit()
        return self._change_view(change)


def _suffix(image: ImageBytes) -> str:
    return image.name[image.name.rfind(".") :] if "." in image.name else ""
