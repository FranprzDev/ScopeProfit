import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  text: z.string().max(100_000).optional().describe('Client text, verbatim (do not summarise)'),
  image_urls: z
    .array(z.string().url())
    .max(5)
    .optional()
    .describe('Public https URLs of screenshots, sketches or reference images'),
  author: z
    .enum(['client', 'professional'])
    .optional()
    .describe("Who wrote it: 'client' (default) or 'professional'"),
  analyze: z
    .boolean()
    .optional()
    .describe(
      'Queue the server-side scope agent (default true). Set false if you will draft the scope yourself.',
    ),
};

export const metadata: ToolMetadata = {
  name: 'add_client_input',
  description:
    "Add what the client said or shared: free text and/or public image URLs (JPEG, PNG, WebP, max 10 MB, up to 5). Stored verbatim as messages that requirements can cite. Use author='professional' for your own follow-up questions to the client. By default the server-side scope agent re-analyses the project.",
  annotations: { ...{ ...write, openWorldHint: true }, title: 'Add client input' },
};

export default async function add_client_input(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.addClientInput(user, {
      projectId: args.project_id,
      text: args.text,
      imageUrls: args.image_urls,
      author: args.author,
      analyze: args.analyze,
    }),
  );
}
