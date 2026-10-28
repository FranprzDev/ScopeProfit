import { z } from 'zod';
import type { InferSchema, ToolMetadata } from 'xmcp';
import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  file_id: z.string().uuid().describe('Image fileId from get_conversation'),
};
export const metadata: ToolMetadata = {
  name: 'get_input_image',
  description:
    'Read a stored screenshot or sketch as native MCP image content. Use the fileId from get_conversation. Large files return a labeled scaled preview. Confirm image-derived facts as client text before citing requirements.',
  annotations: { ...readOnly, title: 'Read stored input image' },
};
export default async function get_input_image(args: InferSchema<typeof schema>) {
  return executeTool(
    (tools, user) =>
      tools.getInputImage(user, { projectId: args.project_id, fileId: args.file_id }),
    (value) => {
      const { data, mimeType, ...metadata } = value;
      return {
        content: [
          { type: 'text', text: JSON.stringify(metadata) },
          { type: 'image', data: String(data), mimeType: String(mimeType) },
        ],
        structuredContent: metadata,
      };
    },
  );
}
