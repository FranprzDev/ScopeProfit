"""Scope grilling: a relentless interview in rounds that settles the scope before the document.

Adapted to ScopeProfit from Matt Pocock's `grilling` and `domain-modeling` skills
(https://github.com/mattpocock/skills, MIT). Open questions form a dependency tree; a round is the
whole frontier (every open question whose prerequisites are settled). Answers move questions into
`resolvedQuestions` stamped with their round, agreed domain terms go to the glossary and hard
decisions become decision records, each write producing a new brief version and document.
"""

import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from scopeprofit.domain.brief import (
    BriefData,
    DecisionRecord,
    GlossaryTerm,
    Question,
    parse_brief,
    resolve_questions,
)
from scopeprofit.domain.views import AnswersWrite, BriefWrite, GrillRound, RoundQuestion, WaitingQuestion
from scopeprofit.enums import BriefSource, InputAuthor
from scopeprofit.errors import DomainError, ErrorCode, conflict
from scopeprofit.services.accounts import Principal
from scopeprofit.services.scope import ScopeService
from scopeprofit.services.storage import validate_text


class Answer(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    question_id: str = Field(min_length=1, max_length=200)
    answer: str = Field(
        min_length=1,
        max_length=20_000,
        description="The person's answer. 'yes' (or 'sí') accepts the recommended answer.",
    )


@dataclass
class BriefChange:
    """A brief transformation plus the conversation messages it records as evidence."""

    apply: Callable[[BriefData], BriefData]
    messages: list[str] = field(default_factory=list)
    author: InputAuthor = InputAuthor.professional


@dataclass(frozen=True)
class Written:
    write: BriefWrite
    brief: BriefData
    message_ids: list[uuid.UUID]


def format_round(round_number: int, questions: Sequence[Question]) -> str:
    blocks = []
    for index, question in enumerate(questions, start=1):
        recommendation = question.recommended_answer or "No recommendation: the person decides."
        blocks.append(
            f"❓ **Q{index}** - **{question.id}**: {question.question}\n\n_{question.reason}_\n\n➡️ {recommendation}"
        )
    return f"### Round {round_number}\n\n" + "\n\n---\n\n".join(blocks)


def build_round(project_id: uuid.UUID, version: int, brief: BriefData) -> GrillRound:
    frontier = brief.frontier()
    open_ids = {question.id for question in brief.questions}
    frontier_ids = {question.id for question in frontier}
    waiting = [
        WaitingQuestion(id=q.id, question=q.question, waits_for=[d for d in q.depends_on if d in open_ids])
        for q in brief.questions
        if q.id not in frontier_ids
    ]
    done = not brief.questions
    round_number = brief.current_round()
    return GrillRound(
        project_id=project_id,
        brief_version=version,
        round=round_number,
        questions=[
            RoundQuestion(
                id=q.id,
                question=q.question,
                reason=q.reason,
                recommended_answer=q.recommended_answer,
                blocks_estimate=q.blocks_estimate,
            )
            for q in frontier
        ],
        waiting=waiting,
        resolved=len(brief.resolved_questions),
        glossary_terms=len(brief.glossary),
        decisions=len(brief.decisions),
        done=done,
        formatted=format_round(round_number, frontier) if frontier else "",
        next=(
            "The frontier is empty. Confirm with the person that you share one understanding of the scope, then "
            "fill any missing sections with update_scope_section and review the document (get_scope_document)."
            if done
            else "Ask every question of this round at once, word each so 'yes' accepts the recommendation, wait "
            "for the answers and send them together with submit_answers. Add follow-up questions with "
            "ask_questions (dependsOn their prerequisites); record agreed terms with record_glossary_term and "
            "hard-to-reverse trade-offs with record_decision as soon as they crystallise."
        ),
    )


class GrillingService:
    def __init__(self, scope: ScopeService) -> None:
        self.scope = scope

    async def question_round(self, principal: Principal, project_id: uuid.UUID) -> GrillRound:
        state = await self.scope.get_brief(principal, project_id)
        return build_round(project_id, state.brief_version, state.brief)

    async def _write(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        expected_version: int,
        change: BriefChange,
    ) -> Written:
        async with self.scope.db.session() as session:
            project = await self.scope.editable(session, principal, project_id)
            brief, version = self.scope.brief_of(project)
            if version != expected_version:
                raise conflict(
                    ErrorCode.version_conflict,
                    f"Brief is at version {version}; fetch the round again with get_question_round and retry",
                )
            updated = change.apply(brief)
            messages = [
                self.scope.input_message(project_id, principal, change.author.value, m) for m in change.messages
            ]
            session.add_all(messages)
            await session.flush()
            new_version = await self.scope.save_brief(
                session, project_id, expected_version, updated, BriefSource.mcp, principal.user_id
            )
            document_version = await self.scope.generate_document(session, project_id, principal.user_id)
            await session.commit()
        return Written(
            BriefWrite(project_id=project_id, brief_version=new_version, document_version=document_version),
            updated,
            [message.id for message in messages],
        )

    async def ask_questions(
        self, principal: Principal, project_id: uuid.UUID, expected_version: int, questions: list[Question]
    ) -> GrillRound:
        if not questions:
            raise DomainError(ErrorCode.validation_failed, "Send at least one question")

        def apply(brief: BriefData) -> BriefData:
            payload = brief.to_json()
            payload["questions"] = [q.model_dump(mode="json") for q in [*brief.questions, *questions]]
            return parse_brief(payload)

        written = await self._write(principal, project_id, expected_version, BriefChange(apply))
        return build_round(project_id, written.write.brief_version, written.brief)

    async def submit_answers(
        self,
        principal: Principal,
        project_id: uuid.UUID,
        expected_version: int,
        answers: list[Answer],
        author: InputAuthor = InputAuthor.client,
    ) -> AnswersWrite:
        if not answers:
            raise DomainError(ErrorCode.validation_failed, "Send at least one answer")
        cleaned = [(answer.question_id, validate_text(answer.answer.strip())) for answer in answers]
        messages: list[str] = []

        def apply(brief: BriefData) -> BriefData:
            frontier = {question.id: question for question in brief.frontier()}
            if not brief.questions:
                raise DomainError(ErrorCode.no_open_questions, "There are no open questions")
            for question_id, answer in cleaned:
                question = frontier.get(question_id)
                if question is None:
                    raise DomainError(
                        ErrorCode.question_not_found,
                        f"{question_id} is not in the current round (unknown, answered or waiting on a prerequisite)",
                    )
                messages.append(f"{question.id} — {question.question}\n{answer}")
            return resolve_questions(brief, cleaned)

        change = BriefChange(apply, messages=messages, author=author)
        written = await self._write(principal, project_id, expected_version, change)
        return AnswersWrite(
            project_id=project_id,
            brief_version=written.write.brief_version,
            document_version=written.write.document_version,
            resolved_question_ids=[question_id for question_id, _ in cleaned],
            message_ids=written.message_ids,
            next_round=build_round(project_id, written.write.brief_version, written.brief),
        )

    async def record_term(
        self, principal: Principal, project_id: uuid.UUID, expected_version: int, term: GlossaryTerm
    ) -> BriefWrite:
        def apply(brief: BriefData) -> BriefData:
            others = [t for t in brief.glossary if t.term.casefold() != term.term.casefold()]
            payload = brief.to_json()
            payload["glossary"] = [*[t.model_dump(mode="json") for t in others], term.model_dump(mode="json")]
            return parse_brief(payload)

        return (await self._write(principal, project_id, expected_version, BriefChange(apply))).write

    async def record_decision(
        self, principal: Principal, project_id: uuid.UUID, expected_version: int, decision: DecisionRecord
    ) -> BriefWrite:
        def apply(brief: BriefData) -> BriefData:
            payload = brief.to_json()
            records = [d.model_dump(mode="json") for d in brief.decisions if d.id != decision.id]
            payload["decisions"] = [*records, decision.model_dump(mode="json")]
            return parse_brief(payload)

        return (await self._write(principal, project_id, expected_version, BriefChange(apply))).write
