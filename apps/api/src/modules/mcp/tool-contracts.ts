import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { User } from '@prisma/client';
import type { ScopeToolsService } from './scope-tools.service';
import { getScopeToolContext } from './tool-context';

export const projectId = z
  .string()
  .uuid()
  .describe('Project id (UUID) returned by create_project or list_projects');

export const SECTION_SHAPES = `Value shape per section:
- summary: string (max 5 lines)
- requirements: [{id:"RF-01", description, type:"functional"|"rule"|"data"|"integration"|"nonfunctional", priority:"must"|"should", source:<exact quote from a message>, sourceMessageId:<message UUID>, systemNote}]
- questions: [{id:"Q1", question, reason, blocksEstimate:boolean}]
- risks: [{id:"R1", description, impact, mitigation, severity:"red"|"yellow"|"green"}]
- included | excluded | assumptions | acceptanceCriteria | nextSteps: string[]
- estimates: [{module, minHours:number, maxHours:number (>= minHours), uncertainty}]
- quoteValidity: {issuedOn:"YYYY-MM-DD", days:integer (1..3650)} or null to remove. Optional commercial validity, set only from the professional's explicit policy. No default applies to other users. Ask for the issuance date; never reset it on export. A 7-day policy is available by setting days:7. Expiry requires a new quote based on availability/workload; prices may rise or fall, never change automatically. This does not turn hour estimates into prices or change accepted commitments.
- diagrams: [{title, source:<Mermaid text, max 5000 chars>}] (max 8) or null to remove. Rendered with Pele and embedded as figures inside the PDF, DOCX and Markdown exports. Use flowchart, sequence or other Mermaid diagrams only when they clarify processes, actors or flows; the source must render or the write is rejected.
The value REPLACES the whole section.`;

type ToolResult = Record<string, unknown>;

function result(data: ToolResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

export function toolError(error: unknown): CallToolResult {
  let code = 'INTERNAL_ERROR';
  let message = 'Unable to complete the request';
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    code = 'VERSION_CONFLICT';
    message = 'Project changed during this request; read its current version and retry';
  } else if (error instanceof HttpException) {
    const body = error.getResponse();
    if (body && typeof body === 'object') {
      const detail = body as Record<string, unknown>;
      code = typeof detail.code === 'string' ? detail.code : error.message;
      message = typeof detail.message === 'string' ? detail.message : code;
    } else {
      code = error.message;
      message = error.message;
    }
  }
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: { error: { code, message } },
  };
}

export async function executeTool(
  fn: (tools: ScopeToolsService, user: User) => Promise<ToolResult>,
): Promise<CallToolResult> {
  try {
    const { tools, user } = getScopeToolContext();
    return result(await fn(tools, user));
  } catch (error) {
    return toolError(error);
  }
}

export const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
export const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
