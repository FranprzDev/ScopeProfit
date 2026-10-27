import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { write, executeTool } from '../tool-contracts';

export const schema = {
  name: z.string().min(1).max(200).describe('Short project name, e.g. "Booking app for Acme"'),
  client_email: z
    .string()
    .email()
    .optional()
    .describe(
      'Client email; used for delivery only when approve_scope explicitly sets send_to_client=true',
    ),
};

export const metadata: ToolMetadata = {
  name: 'create_project',
  description:
    'Create a new scoping project for a client idea. Returns project_id. Then send the client material with add_client_input.',
  annotations: { ...write, title: 'Create scope project' },
};

export default async function create_project(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.createProject(user, { name: args.name, clientEmail: args.client_email }),
  );
}
