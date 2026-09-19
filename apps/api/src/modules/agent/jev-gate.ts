import { experimental_evaluate as evaluate } from 'ai';
import { BriefData } from '@scopeprofit/contracts';

export const JEV_MODEL = 'typesafe-ai/jev';

export type JevDecision = {
  needsMoreInfo: boolean;
  probability: number;
};

export function needsClarification(probability: number): boolean {
  return probability >= 0.5;
}

export function enforceClarificationQuestion(
  brief: BriefData,
  previousQuestions: BriefData['questions'],
  shouldAsk: boolean,
): BriefData {
  const previousIds = new Set(previousQuestions.map((question) => question.id));
  const newQuestions = brief.questions.filter((question) => !previousIds.has(question.id));

  if (shouldAsk && newQuestions.length !== 1) {
    throw new Error('LLM_CLARIFICATION_QUESTION_COUNT_INVALID');
  }

  if (!shouldAsk && newQuestions.length) {
    return {
      ...brief,
      questions: brief.questions.filter((question) => previousIds.has(question.id)),
    };
  }

  return brief;
}

export async function evaluateBriefCompleteness(state: any): Promise<JevDecision> {
  const result = await evaluate({
    model: JEV_MODEL,
    state,
    questions: {
      needsMoreInfo: {
        type: 'boolean',
        instructions:
          '¿El brief todavía necesita información del cliente antes de poder estimar el alcance?',
      },
    },
  });
  const probability = result.answers.needsMoreInfo.probability;
  return { needsMoreInfo: needsClarification(probability), probability };
}
