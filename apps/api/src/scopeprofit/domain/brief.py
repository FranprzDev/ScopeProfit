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

from scopeprofit.enums import DecisionStatus, Priority, RequirementType, RiskSeverity, ScopeSection
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
    depends_on: Annotated[list[Text], Field(max_length=50)] = Field(
        default=[], description="Ids of questions that must be answered before this one can be asked"
    )
    recommended_answer: Text = Field(default="", description="Answer the interviewer recommends; 'yes' accepts it")


class ResolvedQuestion(BriefModel):
    """A question settled during grilling, kept so the decision is never lost."""

    id: Text
    question: Text
    answer: Text
    round: Annotated[int, Field(ge=1, le=1000)]
    accepted_recommendation: bool = False


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
    activities: Text = Field(default="", description="Main activities of this stage, shown in the hours table")

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.max_hours < self.min_hours:
            raise ValueError("maxHours must be >= minHours")
        return self


class GlossaryTerm(BriefModel):
    """The project's own word for a thing, agreed with the client (domain language, no implementation)."""

    term: Annotated[str, Field(min_length=1, max_length=200)]
    definition: Annotated[str, Field(min_length=1, max_length=2_000)]
    avoid: Annotated[list[Annotated[str, Field(max_length=200)]], Field(max_length=20)] = []


class DecisionRecord(BriefModel):
    """A scope decision that is hard to reverse, surprising without context and a real trade-off."""

    id: Text
    title: Annotated[str, Field(min_length=1, max_length=300)]
    decision: Annotated[str, Field(min_length=1, max_length=4_000)] = Field(
        description="1-3 sentences: the context, what was decided and why"
    )
    considered_options: Annotated[list[Text], Field(max_length=20)] = []
    consequences: Text = ""
    status: DecisionStatus = DecisionStatus.accepted


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
    glossary: Annotated[list[GlossaryTerm], Field(max_length=300)] = []
    decisions: Annotated[list[DecisionRecord], Field(max_length=200)] = []
    resolved_questions: Annotated[list[ResolvedQuestion], Field(max_length=1_000)] = []

    @model_validator(mode="after")
    def _question_graph(self) -> Self:
        open_ids = [question.id for question in self.questions]
        if len(set(open_ids)) != len(open_ids):
            raise ValueError("question ids must be unique")
        resolved_ids = {question.id for question in self.resolved_questions}
        if resolved_ids & set(open_ids):
            raise ValueError("a question cannot be both open and resolved")
        known = set(open_ids) | resolved_ids
        for question in self.questions:
            for dependency in question.depends_on:
                if dependency == question.id or dependency not in known:
                    raise ValueError(f"{question.id}: dependsOn must reference other known question ids")
        if _has_cycle({question.id: question.depends_on for question in self.questions}):
            raise ValueError("question dependencies must not form a cycle")
        terms = [term.term.casefold() for term in self.glossary]
        if len(set(terms)) != len(terms):
            raise ValueError("glossary terms must be unique")
        decision_ids = [decision.id for decision in self.decisions]
        if len(set(decision_ids)) != len(decision_ids):
            raise ValueError("decision ids must be unique")
        return self

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

    def frontier(self) -> list[Question]:
        """Open questions whose prerequisites are all settled: the next grilling round, asked together."""
        open_ids = {question.id for question in self.questions}
        return [q for q in self.questions if not any(dependency in open_ids for dependency in q.depends_on)]

    def current_round(self) -> int:
        """1 before anything is answered; one more than the last answered round afterwards."""
        rounds = [question.round for question in self.resolved_questions]
        return max(rounds) + 1 if rounds else 1


def _has_cycle(edges: dict[str, list[str]]) -> bool:
    visiting: set[str] = set()
    done: set[str] = set()

    def visit(node: str) -> bool:
        if node in done:
            return False
        if node in visiting:
            return True
        visiting.add(node)
        for target in edges.get(node, []):
            if target in edges and visit(target):
                return True
        visiting.discard(node)
        done.add(node)
        return False

    return any(visit(node) for node in edges)


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
    ScopeSection.glossary: "glossary",
    ScopeSection.decisions: "decisions",
    ScopeSection.resolved_questions: "resolved_questions",
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
_ID_LISTS = (
    ScopeSection.requirements,
    ScopeSection.questions,
    ScopeSection.risks,
    ScopeSection.decisions,
    ScopeSection.resolved_questions,
)
_KEYED_LISTS: dict[ScopeSection, str] = {ScopeSection.estimates: "module", ScopeSection.glossary: "term"}


def _item_key(section: ScopeSection, item: dict[str, object]) -> str:
    return str(item.get(_KEYED_LISTS.get(section, "id")))


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
        elif section in _ID_LISTS or section in _KEYED_LISTS:
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


def preserve_records(previous: BriefData, drafted: BriefData) -> BriefData:
    """A redraft keeps every settled answer, glossary term and decision of the previous version.

    New terms and decisions from the draft are added; entries with the same key keep the draft's
    wording. Resolved questions are history and always come from `previous`."""
    terms = {term.term.casefold(): term for term in previous.glossary}
    for term in drafted.glossary:
        terms[term.term.casefold()] = term
    decisions = {decision.id: decision for decision in previous.decisions}
    for decision in drafted.decisions:
        decisions[decision.id] = decision
    resolved_ids = {question.id for question in previous.resolved_questions}
    payload = drafted.to_json()
    payload["glossary"] = [term.model_dump(mode="json") for term in terms.values()]
    payload["decisions"] = [decision.model_dump(mode="json") for decision in decisions.values()]
    payload["resolvedQuestions"] = [question.model_dump(mode="json") for question in previous.resolved_questions]
    payload["questions"] = [q.model_dump(mode="json") for q in drafted.questions if q.id not in resolved_ids]
    return parse_brief(payload)


def resolve_questions(brief: BriefData, answers: list[tuple[str, str]]) -> BriefData:
    """Moves answered open questions into `resolvedQuestions`, all stamped with the current round.

    An answer of "yes" (or "sí") to a question with a recommended answer accepts the recommendation."""
    by_id = {question.id: question for question in brief.questions}
    round_number = brief.current_round()
    resolved = list(brief.resolved_questions)
    answered: set[str] = set()
    for question_id, answer in answers:
        question = by_id.get(question_id)
        if question is None or question_id in answered:
            raise DomainError(ErrorCode.question_not_found, f"No open question {question_id}")
        accepted = bool(question.recommended_answer) and answer.strip().casefold().rstrip(".!") in ACCEPT_WORDS
        resolved.append(
            ResolvedQuestion(
                id=question.id,
                question=question.question,
                answer=question.recommended_answer if accepted else answer.strip(),
                round=round_number,
                accepted_recommendation=accepted,
            )
        )
        answered.add(question_id)
    payload = brief.to_json()
    payload["questions"] = [q.model_dump(mode="json") for q in brief.questions if q.id not in answered]
    payload["resolvedQuestions"] = [question.model_dump(mode="json") for question in resolved]
    return parse_brief(payload)


ACCEPT_WORDS = frozenset({"yes", "y", "sí", "si", "ok", "dale", "de acuerdo", "agreed"})
