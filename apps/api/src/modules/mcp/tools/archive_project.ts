import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, executeTool } from '../tool-contracts';

export const schema = { project_id: projectId };

export const metadata: ToolMetadata = {
  name: 'archive_project',
  description:
    'Archive a project. It becomes read-only and is hidden from list_projects by default. Ask the user first.',
  annotations: {
    ...{
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    title: 'Archive project',
  },
};

export default async function archive_project(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) => tools.archiveProject(user, args.project_id));
}
