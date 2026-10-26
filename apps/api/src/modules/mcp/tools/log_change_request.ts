import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  request: z.string().min(1).max(10_000).describe('The requested change, verbatim'),
};

export const metadata: ToolMetadata = {
  name: 'log_change_request',
  description:
    'Record a change the client asks for after scoping. It is classified against the scope as in_scope, out_of_scope or ambiguous.',
  annotations: { ...write, title: 'Log change request' },
};

export default async function log_change_request(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.logChangeRequest(user, { projectId: args.project_id, request: args.request }),
  );
}
