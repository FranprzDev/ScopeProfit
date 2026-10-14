"""REST API for the scope workflow. Every route acts on the caller's own projects."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Form, Query, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

from scopeprofit.api.deps import PrincipalDep, ServicesDep
from scopeprofit.domain.brief import BriefData
from scopeprofit.domain.views import (
    AddedInput,
    AnsweredQuestion,
    Approval,
    Archived,
    BriefDiff,
    BriefState,
    BriefWrite,
    ChangeRequests,
    ChangeRequestView,
    Conversation,
    CreatedProject,
    DocumentVersions,
    ExportLink,
    PendingQuestions,
    ProjectDetail,
    ProjectPage,
    ScopeDocument,
    SectionWrite,
    Tldr,
)
from scopeprofit.enums import BriefSource, ChangeDecision, ExportFormat, InputAuthor, ProjectStatus, ScopeSection
from scopeprofit.services.images import MAX_IMAGE_BYTES, validate_image

router = APIRouter(prefix="/api/projects", tags=["projects"])


class Body(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class CreateProject(Body):
    name: str = Field(min_length=1, max_length=200)
    client_email: EmailStr | None = None


class AddInput(Body):
    text: str | None = Field(default=None, max_length=100_000)
    image_urls: list[str] = Field(default_factory=list, max_length=5)
    author: InputAuthor = InputAuthor.client
    analyze: bool = True


class ReplaceBrief(Body):
    expected_version: int = Field(ge=0)
    data: BriefData
    analyze: bool = False


class UpdateSection(Body):
    expected_version: int = Field(ge=0)
    value: object
    reanalyze: bool = False


class Answer(Body):
    answer: str = Field(min_length=1, max_length=100_000)
    analyze: bool = False


class Approve(Body):
    document_version: int = Field(ge=1)
    send_to_client: bool = True
    client_email: EmailStr | None = None


class NewChangeRequest(Body):
    request: str = Field(min_length=1, max_length=10_000)


class Decide(Body):
    status: ChangeDecision


@router.get("", response_model=ProjectPage)
async def list_projects(
    services: ServicesDep,
    principal: PrincipalDep,
    project_status: Annotated[ProjectStatus | None, Query(alias="status")] = None,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
) -> ProjectPage:
    return await services.scope.list_projects(
        principal, status=project_status, include_archived=include_archived, limit=limit, cursor=cursor
    )


@router.post("", response_model=CreatedProject, status_code=status.HTTP_201_CREATED)
async def create_project(services: ServicesDep, principal: PrincipalDep, body: CreateProject) -> CreatedProject:
    return await services.scope.create_project(principal, body.name, body.client_email)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> ProjectDetail:
    return await services.scope.get_project(principal, project_id)


@router.post("/{project_id}/archive", response_model=Archived)
async def archive_project(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> Archived:
    return await services.scope.archive(principal, project_id)


@router.get("/{project_id}/tldr", response_model=Tldr)
async def get_tldr(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> Tldr:
    return await services.scope.get_tldr(principal, project_id)


@router.get("/{project_id}/messages", response_model=Conversation)
async def get_messages(
    services: ServicesDep,
    principal: PrincipalDep,
    project_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> Conversation:
    return await services.scope.get_conversation(principal, project_id, limit)


@router.post("/{project_id}/messages", response_model=AddedInput, status_code=status.HTTP_201_CREATED)
async def add_input(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, body: AddInput
) -> AddedInput:
    return await services.scope.add_input(
        principal, project_id, text=body.text, image_urls=body.image_urls, author=body.author, analyze=body.analyze
    )


@router.post("/{project_id}/files", response_model=AddedInput, status_code=status.HTTP_201_CREATED)
async def upload_image(
    services: ServicesDep,
    principal: PrincipalDep,
    project_id: uuid.UUID,
    file: UploadFile,
    author: Annotated[InputAuthor, Form()] = InputAuthor.client,
    analyze: Annotated[bool, Form()] = True,
) -> AddedInput:
    content = await file.read(MAX_IMAGE_BYTES + 1)
    image = validate_image(content, file.filename or "image", file.content_type)
    return await services.scope.add_input(principal, project_id, images=[image], author=author, analyze=analyze)


@router.get("/{project_id}/questions", response_model=PendingQuestions)
async def list_questions(
    services: ServicesDep,
    principal: PrincipalDep,
    project_id: uuid.UUID,
    blocking_only: Annotated[bool, Query(alias="blockingOnly")] = False,
) -> PendingQuestions:
    return await services.scope.pending_questions(principal, project_id, blocking_only)


@router.post("/{project_id}/questions/{question_id}/answer", response_model=AnsweredQuestion)
async def answer_question(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, question_id: str, body: Answer
) -> AnsweredQuestion:
    return await services.scope.answer_question(principal, project_id, question_id, body.answer, analyze=body.analyze)


@router.get("/{project_id}/brief", response_model=BriefState)
async def get_brief(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> BriefState:
    return await services.scope.get_brief(principal, project_id)


@router.put("/{project_id}/brief", response_model=BriefWrite)
async def replace_brief(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, body: ReplaceBrief
) -> BriefWrite:
    return await services.scope.replace_brief(
        principal, project_id, body.expected_version, body.data, BriefSource.api, analyze=body.analyze
    )


@router.patch("/{project_id}/brief/sections/{section}", response_model=SectionWrite)
async def update_section(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, section: ScopeSection, body: UpdateSection
) -> SectionWrite:
    return await services.scope.update_section(
        principal, project_id, body.expected_version, section, body.value, reanalyze=body.reanalyze
    )


@router.get("/{project_id}/brief/diff", response_model=BriefDiff)
async def brief_diff(
    services: ServicesDep,
    principal: PrincipalDep,
    project_id: uuid.UUID,
    from_version: Annotated[int, Query(alias="from", ge=0)],
    to_version: Annotated[int, Query(alias="to", ge=0)],
) -> BriefDiff:
    return await services.scope.brief_diff(principal, project_id, from_version, to_version)


@router.get("/{project_id}/document", response_model=ScopeDocument)
async def scope_document(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> ScopeDocument:
    return await services.scope.scope_document(principal, project_id)


@router.get("/{project_id}/documents", response_model=DocumentVersions)
async def document_versions(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> DocumentVersions:
    return await services.scope.document_versions(principal, project_id)


@router.post("/{project_id}/documents", response_model=DocumentVersions, status_code=status.HTTP_201_CREATED)
async def regenerate_document(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID
) -> DocumentVersions:
    await services.scope.regenerate(principal, project_id)
    return await services.scope.document_versions(principal, project_id)


@router.get(
    "/{project_id}/documents/{version}/{export_format}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}, "text/markdown": {}}}},
)
async def download_document(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, version: int, export_format: ExportFormat
) -> Response:
    file = await services.scope.download(principal, project_id, version, export_format)
    return Response(
        file.content,
        media_type=file.mime_type,
        headers={
            "content-disposition": f'attachment; filename="{file.filename}"',
            "cache-control": "private, no-store",
        },
    )


@router.post("/{project_id}/exports/{export_format}", response_model=ExportLink)
async def export_link(
    services: ServicesDep,
    principal: PrincipalDep,
    project_id: uuid.UUID,
    export_format: ExportFormat,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> ExportLink:
    return await services.scope.export(principal, project_id, export_format, version)


@router.post("/{project_id}/approve", response_model=Approval)
async def approve(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, body: Approve) -> Approval:
    return await services.scope.approve(
        principal,
        project_id,
        body.document_version,
        send_to_client=body.send_to_client,
        client_email=body.client_email,
    )


@router.get("/{project_id}/change-requests", response_model=ChangeRequests)
async def list_change_requests(services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID) -> ChangeRequests:
    return await services.scope.list_change_requests(principal, project_id)


@router.post("/{project_id}/change-requests", response_model=ChangeRequestView, status_code=status.HTTP_201_CREATED)
async def create_change_request(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, body: NewChangeRequest
) -> ChangeRequestView:
    return await services.scope.log_change_request(principal, project_id, body.request)


@router.patch("/{project_id}/change-requests/{change_id}", response_model=ChangeRequestView)
async def decide_change_request(
    services: ServicesDep, principal: PrincipalDep, project_id: uuid.UUID, change_id: uuid.UUID, body: Decide
) -> ChangeRequestView:
    return await services.scope.decide_change_request(principal, project_id, change_id, body.status)
