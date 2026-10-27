import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { write, executeTool } from '../tool-contracts';

export const schema = {
  name: z.string().min(1).max(200).describe('Short project name, e.g. "Booking app for Acme"'),
  client_name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Client or company display name for scope and quote documents; separate from the email destination',
    ),
  client_email: z
    .string()
    .email()
    .optional()
    .describe('Client email; the approved PDF/DOCX is emailed here on approve_scope'),
};

export const metadata: ToolMetadata = {
  name: 'create_project',
  description:
    'Create a new scoping project for a client idea. Returns project_id. Then send the client material with add_client_input.',
  annotations: { ...write, title: 'Create scope project' },
};

export default async function create_project(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.createProject(user, {
      name: args.name,
      clientEmail: args.client_email,
      clientName: args.client_name,
    }),
  );
}
