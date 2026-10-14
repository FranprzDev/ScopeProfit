"""The structured, versioned brief behind template 7.1.

JSON keys stay camelCase (`sourceMessageId`, `blocksEstimate`, ...) because that is how briefs are
stored in `briefs.data` and `brief_versions.data` and how MCP clients already send them.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic.alias_generators import to_camel

from scopeprofit.enums import Priority, RequirementType, RiskSeverity, ScopeSection
from scopeprofit.errors import DomainError, ErrorCode

Text = Annotated[str, Field(max_length=10_000)]
TextList = Annotated[list[Text], Field(max_length=200)]


class BriefModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
        serialize_by_alias=True,
    )


class Requirement(BriefModel):
    id: Text
    description: Text
    type: RequirementType
    priority: Priority
    source: Text = Field(description="Exact quote from the message referenced by sourceMessageId")
    source_message_id: uuid.UUID
    system_note: Text


class Question(BriefModel):
    id: Text
    question: Text
    reason: Text
    blocks_estimate: bool


class Risk(BriefModel):
    id: Text
    description: Text
    impact: Text
    mitigation: Text
    severity: RiskSeverity


class Estimate(BriefModel):
    module: Text
    min_hours: Annotated[float, Field(ge=0, le=100_000, allow_inf_nan=False)]
    max_hours: Annotated[float, Field(ge=0, le=100_000, allow_inf_nan=False)]
    uncertainty: Text

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.max_hours < self.min_hours:
            raise ValueError("maxHours must be >= minHours")
        return self


class BriefData(BriefModel):
    summary: Text = ""
    requirements: Annotated[list[Requirement], Field(max_length=200)] = []
    questions: Annotated[list[Question], Field(max_length=100)] = []
    risks: Annotated[list[Risk], Field(max_length=100)] = []
    included: TextList = []
    excluded: TextList = []
    assumptions: TextList = []
    acceptance_criteria: TextList = []
    estimates: Annotated[list[Estimate], Field(max_length=100)] = []
    next_steps: TextList = []

    def to_json(self) -> dict[str, object]:
        return self.model_dump(mode="json")

    def blocking_questions(self) -> list[Question]:
        return [question for question in self.questions if question.blocks_estimate]

    def total_hours(self) -> tuple[float, float]:
        minimum = 0.0
        maximum = 0.0
        for estimate in self.estimates:
            minimum += estimate.min_hours
            maximum += estimate.max_hours
        return minimum, maximum


SECTION_FIELDS: dict[ScopeSection, str] = {
    ScopeSection.summary: "summary",
    ScopeSection.requirements: "requirements",
    ScopeSection.questions: "questions",
    ScopeSection.risks: "risks",
    ScopeSection.included: "included",
    ScopeSection.excluded: "excluded",
    ScopeSection.assumptions: "assumptions",
    ScopeSection.acceptance_criteria: "acceptance_criteria",
    ScopeSection.estimates: "estimates",
    ScopeSection.next_steps: "next_steps",
}


def _issues(error: ValidationError, limit: int = 5) -> str:
    parts: list[str] = []
    for issue in error.errors()[:limit]:
        location = ".".join(str(part) for part in issue["loc"]) or "value"
        parts.append(f"{location} {issue['msg']}")
    return "; ".join(parts)


def parse_brief(data: object) -> BriefData:
    """Validates stored or submitted brief JSON; raises INVALID_BRIEF with the first issues."""
    try:
        return BriefData.model_validate(data)
    except ValidationError as error:
        raise DomainError(ErrorCode.invalid_brief, _issues(error)) from error


def replace_section(brief: BriefData, section: ScopeSection, value: object) -> BriefData:
    """Returns a copy of `brief` with one section replaced and fully re-validated."""
    payload = brief.to_json()
    payload[section.value] = value
    try:
        return BriefData.model_validate(payload)
    except ValidationError as error:
        raise DomainError(ErrorCode.invalid_section_value, f"{section.value}: {_issues(error)}") from error


@dataclass(frozen=True)
class SourceMessage:
    id: uuid.UUID
    content: str


def validate_sources(brief: BriefData, messages: Iterable[SourceMessage]) -> None:
    """Every requirement must quote, verbatim, the stored message it cites."""
    contents = {message.id: message.content for message in messages}
    for requirement in brief.requirements:
        content = contents.get(requirement.source_message_id)
        quote = requirement.source.strip()
        if content is None or not quote or requirement.source not in content:
            raise DomainError(
                ErrorCode.invalid_requirement_source,
                f"{requirement.id}: source must be an exact quote from the message whose id is "
                "sourceMessageId (see get_conversation)",
            )


class DiffKind(StrEnum):
    added = "added"
    removed = "removed"
    changed = "changed"


class BriefDiffEntry(BaseModel):
    key: str
    kind: DiffKind
    before: object | None = None
    after: object | None = None


_STRING_LISTS = (
    ScopeSection.included,
    ScopeSection.excluded,
    ScopeSection.assumptions,
    ScopeSection.acceptance_criteria,
    ScopeSection.next_steps,
)
_ID_LISTS = (ScopeSection.requirements, ScopeSection.questions, ScopeSection.risks)


def _item_key(section: ScopeSection, item: dict[str, object]) -> str:
    key = item.get("module") if section is ScopeSection.estimates else item.get("id")
    return str(key)


def diff_briefs(before: BriefData, after: BriefData) -> list[BriefDiffEntry]:
    """Keys added, removed or changed between two brief versions, sorted by key."""
    old = before.to_json()
    new = after.to_json()
    entries: list[BriefDiffEntry] = []
    for section in ScopeSection:
        previous = old[section.value]
        current = new[section.value]
        if section in _STRING_LISTS:
            assert isinstance(previous, list)
            assert isinstance(current, list)
            previous_items = {str(item) for item in previous}
            current_items = {str(item) for item in current}
            for item in current_items - previous_items:
                entries.append(BriefDiffEntry(key=f"{section.value}.{item}", kind=DiffKind.added, after=item))
            for item in previous_items - current_items:
                entries.append(BriefDiffEntry(key=f"{section.value}.{item}", kind=DiffKind.removed, before=item))
        elif section in _ID_LISTS or section is ScopeSection.estimates:
            assert isinstance(previous, list)
            assert isinstance(current, list)
            previous_by_key = {_item_key(section, item): item for item in previous}
            for item in current:
                key = _item_key(section, item)
                old_item = previous_by_key.pop(key, None)
                if old_item is None:
                    entries.append(BriefDiffEntry(key=f"{section.value}.{key}", kind=DiffKind.added, after=item))
                elif old_item != item:
                    entries.append(
                        BriefDiffEntry(key=f"{section.value}.{key}", kind=DiffKind.changed, before=old_item, after=item)
                    )
            for key, item in previous_by_key.items():
                entries.append(BriefDiffEntry(key=f"{section.value}.{key}", kind=DiffKind.removed, before=item))
        elif previous != current:
            entries.append(BriefDiffEntry(key=section.value, kind=DiffKind.changed, before=previous, after=current))
    return sorted(entries, key=lambda entry: entry.key)


def approval_blocker(brief: BriefData) -> DomainError | None:
    """The first rule that prevents approving a document built from `brief`, if any."""
    incomplete = (
        not brief.summary.strip()
        or not brief.requirements
        or not brief.included
        or not brief.excluded
        or not brief.assumptions
        or not brief.acceptance_criteria
        or not brief.next_steps
        or not brief.estimates
        or any(not requirement.source.strip() for requirement in brief.requirements)
    )
    if incomplete:
        return DomainError(ErrorCode.document_incomplete, "Complete the required document sections before approval")
    if any(risk.severity is RiskSeverity.red and not risk.mitigation.strip() for risk in brief.risks):
        return DomainError(ErrorCode.unmitigated_risk, "Red risks require an explicit mitigation or assumption")
    if brief.blocking_questions():
        return DomainError(ErrorCode.estimate_blocked, "Resolve blocking questions before approval")
    return None
