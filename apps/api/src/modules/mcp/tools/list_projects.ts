import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';
import type { InferSchema, ToolMetadata } from 'xmcp';

import { readOnly, executeTool } from '../tool-contracts';

export const schema = {
  order: z
    .enum(['activity', 'created'])
    .optional()
    .describe(
      'activity is the default live view; use created for stable exhaustive pagination across activity updates',
    ),
  status: z.nativeEnum(ProjectStatus).optional().describe('Only projects in this status'),
  include_archived: z.boolean().optional().describe('Include archived projects (default false)'),
  limit: z.number().int().min(1).max(100).optional().describe('Page size, default 20'),
  cursor: z
    .string()
    .uuid()
    .optional()
    .describe('nextCursor from a previous call; retain the same order and filters'),
};

export const metadata: ToolMetadata = {
  name: 'list_projects',
  description:
    'List ScopeProfit projects (newest activity first) with status, TLDR and number of blocking questions. Use it to find a project_id. For exhaustive traversal while projects change, use order=created on every page; activity ordering can skip moved projects.',
  annotations: { ...readOnly, title: 'List scope projects' },
};

export default async function list_projects(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.listProjects(user, {
      order: args.order,
      status: args.status,
      includeArchived: args.include_archived,
      limit: args.limit,
      cursor: args.cursor,
    }),
  );
}
