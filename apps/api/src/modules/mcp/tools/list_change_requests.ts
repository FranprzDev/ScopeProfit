import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = { project_id: projectId };

export const metadata: ToolMetadata = {
  name: 'list_change_requests',
  description:
    'Change requests with status, original classification and baseBriefVersion. classificationCurrent=false means the scope changed; reassess against the current brief. Classifications are keyword suggestions, not semantic decisions.',
  annotations: { ...readOnly, title: 'List change requests' },
};

export default async function list_change_requests(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) => tools.listChangeRequests(user, args.project_id));
}
