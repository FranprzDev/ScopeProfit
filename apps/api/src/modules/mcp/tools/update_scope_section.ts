import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';
import { SCOPE_SECTIONS } from '../scope-sections';
import { projectId, SECTION_SHAPES, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  expected_version: z.number().int().min(0).describe('brief_version you last read'),
  section: z.enum(SCOPE_SECTIONS).describe('Section of template 7.1 to replace'),
  value: z.unknown().describe('New content for the section (see shapes in the description)'),
  reanalyze: z
    .boolean()
    .optional()
    .describe('Queue the server-side agent afterwards (default false)'),
};

export const metadata: ToolMetadata = {
  name: 'update_scope_section',
  description: `Replace one section of the structured brief and regenerate the document (new brief and document versions). Fails with VERSION_CONFLICT if expected_version is stale. ${SECTION_SHAPES}`,
  annotations: { ...write, title: 'Update a scope section' },
};

export default async function update_scope_section(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.updateScopeSection(user, {
      projectId: args.project_id,
      expectedVersion: args.expected_version,
      section: args.section,
      value: args.value,
      reanalyze: args.reanalyze,
    }),
  );
}
