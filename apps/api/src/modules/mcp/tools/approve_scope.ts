import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  document_version: z
    .number()
    .int()
    .min(1)
    .describe('Current document version (get_project or get_scope_document)'),
  send_to_client: z
    .boolean()
    .optional()
    .describe(
      'Email PDF + DOCX only when explicitly requested by the professional (default false)',
    ),
  manual_edits_reviewed: z
    .boolean()
    .optional()
    .describe(
      'Explicit confirmation that the professional reviewed all carried-forward manual terms against this document version; never infer from brief freshness',
    ),
  client_email: z.string().email().optional().describe('Client email, if the project has none yet'),
};

export const metadata: ToolMetadata = {
  name: 'approve_scope',
  description:
    'Approve the current document version. Locks the project without sending email by default. Set send_to_client=true only after the professional explicitly approves the recipient and delivery. Requires: no blocking questions, no red risk without mitigation, all sections filled. Ask the user for confirmation first.',
  annotations: {
    ...{
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    title: 'Approve scope',
  },
};

export default async function approve_scope(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.approveScope(user, {
      projectId: args.project_id,
      documentVersion: args.document_version,
      sendToClient: args.send_to_client,
      clientEmail: args.client_email,
      manualEditsReviewed: args.manual_edits_reviewed,
    }),
  );
}
