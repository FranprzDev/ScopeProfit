import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  blocking_only: z.boolean().optional().describe('Only questions that block the estimate'),
};

export const metadata: ToolMetadata = {
  name: 'list_pending_questions',
  description:
    'Open questions that still need an answer from the client. Questions with blocksEstimate=true prevent approval.',
  annotations: { ...readOnly, title: 'List pending questions' },
};

export default async function list_pending_questions(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.listPendingQuestions(user, {
      projectId: args.project_id,
      blockingOnly: args.blocking_only,
    }),
  );
}
