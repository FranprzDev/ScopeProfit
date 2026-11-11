import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  decision: z
    .enum(['accepted', 'rejected'])
    .describe("The client's answer, as reported to the professional"),
};

export const metadata: ToolMetadata = {
  name: 'decide_quote',
  description:
    "Record the client's decision on a quote. There is no client portal: the professional shares the export_quote link themselves and registers the outcome here. Works on draft quotes (marked sent first) and sent quotes; an already-decided quote fails. Ask the user for confirmation first.",
  annotations: {
    ...{
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    title: 'Decide quote',
  },
};

export default async function decide_quote(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.decideQuote(user, {
      projectId: args.project_id,
      decision: args.decision,
    }),
  );
}
