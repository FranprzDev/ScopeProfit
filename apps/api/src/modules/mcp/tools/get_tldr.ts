import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = { project_id: projectId };

export const metadata: ToolMetadata = {
  name: 'get_tldr',
  description:
    'Short diagnosis of a project: summary, number of requirements, blocking questions (top 3), red risks and total hour range.',
  annotations: { ...readOnly, title: 'Get project TLDR' },
};

export default async function get_tldr(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) => tools.getTldr(user, args.project_id));
}
