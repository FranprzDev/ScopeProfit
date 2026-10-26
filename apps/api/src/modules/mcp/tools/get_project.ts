import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = { project_id: projectId };

export const metadata: ToolMetadata = {
  name: 'get_project',
  description:
    'Status of one project: lifecycle status, background agent status, brief/document versions and counts. Use it to poll after add_client_input.',
  annotations: { ...readOnly, title: 'Get project status' },
};

export default async function get_project(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) => tools.getProject(user, args.project_id));
}
