import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  format: z.enum(['pdf', 'docx', 'md']).describe('File format'),
  version: z.number().int().min(1).optional().describe('Specific document version'),
};

export const metadata: ToolMetadata = {
  name: 'export_document',
  description:
    'Get a temporary download URL for the scope document as PDF, editable DOCX or Markdown. Without version, uses the latest document (regenerated first if the brief changed).',
  annotations: { ...write, title: 'Export document' },
};

export default async function export_document(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.exportDocument(user, {
      projectId: args.project_id,
      format: args.format,
      version: args.version,
    }),
  );
}
