import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = { project_id: projectId };

export const metadata: ToolMetadata = {
  name: 'get_scope_document',
  description:
    'The current scope document rendered with fixed template 7.1 as Markdown, plus the structured brief and its brief_version (needed by update_scope_section).',
  annotations: { ...readOnly, title: 'Get scope document (template 7.1)' },
};

export default async function get_scope_document(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) => tools.getScopeDocument(user, args.project_id));
}
