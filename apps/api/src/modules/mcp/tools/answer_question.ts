import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  expected_version: z
    .number()
    .int()
    .min(0)
    .describe('briefVersion returned when reading the pending question; re-read if it changed'),
  question_id: z.string().min(1).describe('Question id, e.g. "Q1" (from list_pending_questions)'),
  answer: z.string().min(1).max(100_000).describe("The client's answer, verbatim"),
  analyze: z
    .boolean()
    .optional()
    .describe('Also queue the server-side agent to fold the answer in (default false)'),
};

export const metadata: ToolMetadata = {
  name: 'answer_question',
  description:
    "Record the client's answer to a pending question: requires the briefVersion read with the question, stores it as a client message, removes the question from the brief and saves a draft. Returns reviewRequired sections: review the summary and every other section against the answer, update affected sections, and read back the full document. Other content is not rewritten or semantically validated.",
  annotations: { ...write, title: 'Answer a pending question' },
};

export default async function answer_question(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.answerQuestion(user, {
      projectId: args.project_id,
      questionId: args.question_id,
      expectedVersion: args.expected_version,
      answer: args.answer,
      analyze: args.analyze,
    }),
  );
}
