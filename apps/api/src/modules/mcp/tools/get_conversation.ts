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
  message_id: z
    .string()
    .uuid()
    .optional()
    .describe('Read one stored message, including additional content chunks'),
  content_offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('nextContentOffset from a prior message chunk; requires message_id'),
  before_message_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Return the page of messages older than this message id; omit for the most recent page',
    ),
};

export const metadata: ToolMetadata = {
  name: 'get_conversation',
  description:
    'A recent page of stored client/professional/agent messages of a project, oldest first within the page, with message ids and a nextCursor used to fetch older messages. Long messages return explicit content-completeness flags and nextContentOffset. Use message_id with content_offset to retrieve remaining exact text. Do not treat previews as full evidence. Needed to cite exact sources in requirements.',
  annotations: { ...readOnly, title: 'Get project conversation' },
};

export default async function get_conversation(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.getConversation(user, {
      projectId: args.project_id,
      limit: args.limit,
      beforeMessageId: args.before_message_id,
      messageId: args.message_id,
      contentOffset: args.content_offset,
    }),
  );
}
