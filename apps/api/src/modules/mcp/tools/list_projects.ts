import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';
import type { InferSchema, ToolMetadata } from 'xmcp';

import { readOnly, executeTool } from '../tool-contracts';

export const schema = {
  status: z.nativeEnum(ProjectStatus).optional().describe('Only projects in this status'),
  include_archived: z.boolean().optional().describe('Include archived projects (default false)'),
  limit: z.number().int().min(1).max(100).optional().describe('Page size, default 20'),
  cursor: z.string().uuid().optional().describe('next_cursor from a previous call'),
};

export const metadata: ToolMetadata = {
  name: 'list_projects',
  description:
    'List ScopeProfit projects (newest activity first) with status, TLDR and number of blocking questions. Use it to find a project_id.',
  annotations: { ...readOnly, title: 'List scope projects' },
};

export default async function list_projects(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.listProjects(user, {
      status: args.status,
      includeArchived: args.include_archived,
      limit: args.limit,
      cursor: args.cursor,
    }),
  );
}
