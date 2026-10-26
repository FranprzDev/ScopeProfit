import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Most recent N messages, default 100'),
};

export const metadata: ToolMetadata = {
  name: 'get_conversation',
  description:
    'All stored client/professional/agent messages of a project, oldest first, with message ids. Needed to cite exact sources in requirements.',
  annotations: { ...readOnly, title: 'Get project conversation' },
};

export default async function get_conversation(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.getConversation(user, { projectId: args.project_id, limit: args.limit }),
  );
}
