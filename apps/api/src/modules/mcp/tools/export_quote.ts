import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  format: z.enum(['pdf', 'docx']).describe('File format'),
};

export const metadata: ToolMetadata = {
  name: 'export_quote',
  description:
    'Get a temporary signed download URL for the quote of a project as PDF or editable DOCX. Review the quote before sharing the link.',
  annotations: { ...write, title: 'Export quote' },
};

export default async function export_quote(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.exportQuote(user, { projectId: args.project_id, format: args.format }),
  );
}
