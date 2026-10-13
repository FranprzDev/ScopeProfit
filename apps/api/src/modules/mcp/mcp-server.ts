import { HttpException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProjectStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { SCOPE_SECTIONS, ScopeToolsService } from './scope-tools.service';

export const MCP_SERVER_NAME = 'scopeprofit';
export const MCP_SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = `ScopeProfit turns a client's messy idea (text and images) into a formal, versioned scope document (template 7.1: summary, requirements with verbatim source quotes, blocking questions, risks with traffic light, scope included/excluded/assumptions/acceptance criteria, hour-range estimate, next steps).
Typical flow: create_project -> add_client_input (repeat) -> get_tldr / list_pending_questions -> answer_question or update_scope_section -> get_scope_document -> approve_scope -> export_document.
Rules: never invent requirements; every requirement must quote its source message exactly (get_conversation gives message ids). Estimates are hour ranges, never prices. Approval needs no blocking questions and no red risk without mitigation. Writes use optimistic locking: pass the brief_version you last read.`;

const projectId = z
  .string()
  .uuid()
  .describe('Project id (UUID) returned by create_project or list_projects');

const SECTION_SHAPES = `Value shape per section:
- summary: string (max 5 lines)
- requirements: [{id:"RF-01", description, type:"functional"|"rule"|"data"|"integration"|"nonfunctional", priority:"must"|"should", source:<exact quote from a message>, sourceMessageId:<message UUID>, systemNote}]
- questions: [{id:"Q1", question, reason, blocksEstimate:boolean}]
- risks: [{id:"R1", description, impact, mitigation, severity:"red"|"yellow"|"green"}]
- included | excluded | assumptions | acceptanceCriteria | nextSteps: string[]
- estimates: [{module, minHours:number, maxHours:number (>= minHours), uncertainty}]
The value REPLACES the whole section.`;

type ToolResult = Record<string, unknown>;

function result(data: ToolResult): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** Domain errors become tool errors the model can read and recover from, not protocol errors. */
export function toolError(error: unknown): CallToolResult {
  let code = 'INTERNAL_ERROR';
  let message = 'Unable to complete the request';
  if (error instanceof HttpException) {
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

async function run(fn: () => Promise<ToolResult>): Promise<CallToolResult> {
  try {
    return result(await fn());
  } catch (error) {
    return toolError(error);
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

/** Builds an MCP server whose tools act as the given professional. */
export function createScopeMcpServer(tools: ScopeToolsService, user: User) {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION, title: 'ScopeProfit' },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List scope projects',
      description:
        'List ScopeProfit projects (newest activity first) with status, TLDR and number of blocking questions. Use it to find a project_id.',
      inputSchema: {
        status: z.nativeEnum(ProjectStatus).optional().describe('Only projects in this status'),
        include_archived: z
          .boolean()
          .optional()
          .describe('Include archived projects (default false)'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, default 20'),
        cursor: z.string().uuid().optional().describe('next_cursor from a previous call'),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        tools.listProjects(user, {
          status: args.status,
          includeArchived: args.include_archived,
          limit: args.limit,
          cursor: args.cursor,
        }),
      ),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create scope project',
      description:
        'Create a new scoping project for a client idea. Returns project_id. Then send the client material with add_client_input.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(200)
          .describe('Short project name, e.g. "Booking app for Acme"'),
        client_email: z
          .string()
          .email()
          .optional()
          .describe('Client email; the approved PDF/DOCX is emailed here on approve_scope'),
      },
      annotations: write,
    },
    (args) =>
      run(() => tools.createProject(user, { name: args.name, clientEmail: args.client_email })),
  );

  server.registerTool(
    'get_project',
    {
      title: 'Get project status',
      description:
        'Status of one project: lifecycle status, background agent status, brief/document versions and counts. Use it to poll after add_client_input.',
      inputSchema: { project_id: projectId },
      annotations: readOnly,
    },
    (args) => run(() => tools.getProject(user, args.project_id)),
  );

  server.registerTool(
    'add_client_input',
    {
      title: 'Add client input',
      description:
        "Add what the client said or shared: free text and/or public image URLs (JPEG, PNG, WebP, max 10 MB, up to 5). Stored verbatim as messages that requirements can cite. Use author='professional' for your own follow-up questions to the client. By default the server-side scope agent re-analyses the project.",
      inputSchema: {
        project_id: projectId,
        text: z
          .string()
          .max(100_000)
          .optional()
          .describe('Client text, verbatim (do not summarise)'),
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
      },
      annotations: { ...write, openWorldHint: true },
    },
    (args) =>
      run(() =>
        tools.addClientInput(user, {
          projectId: args.project_id,
          text: args.text,
          imageUrls: args.image_urls,
          author: args.author,
          analyze: args.analyze,
        }),
      ),
  );

  server.registerTool(
    'get_conversation',
    {
      title: 'Get project conversation',
      description:
        'All stored client/professional/agent messages of a project, oldest first, with message ids. Needed to cite exact sources in requirements.',
      inputSchema: {
        project_id: projectId,
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Most recent N messages, default 100'),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() => tools.getConversation(user, { projectId: args.project_id, limit: args.limit })),
  );

  server.registerTool(
    'get_tldr',
    {
      title: 'Get project TLDR',
      description:
        'Short diagnosis of a project: summary, number of requirements, blocking questions (top 3), red risks and total hour range.',
      inputSchema: { project_id: projectId },
      annotations: readOnly,
    },
    (args) => run(() => tools.getTldr(user, args.project_id)),
  );

  server.registerTool(
    'list_pending_questions',
    {
      title: 'List pending questions',
      description:
        'Open questions that still need an answer from the client. Questions with blocksEstimate=true prevent approval.',
      inputSchema: {
        project_id: projectId,
        blocking_only: z.boolean().optional().describe('Only questions that block the estimate'),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        tools.listPendingQuestions(user, {
          projectId: args.project_id,
          blockingOnly: args.blocking_only,
        }),
      ),
  );

  server.registerTool(
    'answer_question',
    {
      title: 'Answer a pending question',
      description:
        "Record the client's answer to a pending question: stores it as a client message, removes the question from the brief and regenerates the document.",
      inputSchema: {
        project_id: projectId,
        question_id: z
          .string()
          .min(1)
          .describe('Question id, e.g. "Q1" (from list_pending_questions)'),
        answer: z.string().min(1).max(100_000).describe("The client's answer, verbatim"),
        analyze: z
          .boolean()
          .optional()
          .describe('Also queue the server-side agent to fold the answer in (default false)'),
      },
      annotations: write,
    },
    (args) =>
      run(() =>
        tools.answerQuestion(user, {
          projectId: args.project_id,
          questionId: args.question_id,
          answer: args.answer,
          analyze: args.analyze,
        }),
      ),
  );

  server.registerTool(
    'get_scope_document',
    {
      title: 'Get scope document (template 7.1)',
      description:
        'The current scope document rendered with fixed template 7.1 as Markdown, plus the structured brief and its brief_version (needed by update_scope_section).',
      inputSchema: { project_id: projectId },
      annotations: readOnly,
    },
    (args) => run(() => tools.getScopeDocument(user, args.project_id)),
  );

  server.registerTool(
    'update_scope_section',
    {
      title: 'Update a scope section',
      description: `Replace one section of the structured brief and regenerate the document (new brief and document versions). Fails with VERSION_CONFLICT if expected_version is stale. ${SECTION_SHAPES}`,
      inputSchema: {
        project_id: projectId,
        expected_version: z.number().int().min(0).describe('brief_version you last read'),
        section: z.enum(SCOPE_SECTIONS).describe('Section of template 7.1 to replace'),
        value: z.unknown().describe('New content for the section (see shapes in the description)'),
        reanalyze: z
          .boolean()
          .optional()
          .describe('Queue the server-side agent afterwards (default false)'),
      },
      annotations: write,
    },
    (args) =>
      run(() =>
        tools.updateScopeSection(user, {
          projectId: args.project_id,
          expectedVersion: args.expected_version,
          section: args.section,
          value: args.value,
          reanalyze: args.reanalyze,
        }),
      ),
  );

  server.registerTool(
    'approve_scope',
    {
      title: 'Approve scope',
      description:
        'Approve the current document version. Locks the project and, by default, emails the PDF and editable DOCX to the client. Requires: no blocking questions, no red risk without mitigation, all sections filled. Ask the user for confirmation first.',
      inputSchema: {
        project_id: projectId,
        document_version: z
          .number()
          .int()
          .min(1)
          .describe('Current document version (get_project or get_scope_document)'),
        send_to_client: z
          .boolean()
          .optional()
          .describe('Email PDF + DOCX to the client (default true)'),
        client_email: z
          .string()
          .email()
          .optional()
          .describe('Client email, if the project has none yet'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (args) =>
      run(() =>
        tools.approveScope(user, {
          projectId: args.project_id,
          documentVersion: args.document_version,
          sendToClient: args.send_to_client,
          clientEmail: args.client_email,
        }),
      ),
  );

  server.registerTool(
    'export_document',
    {
      title: 'Export document',
      description:
        'Get a temporary download URL for the scope document as PDF, editable DOCX or Markdown. Without version, uses the latest document (regenerated first if the brief changed).',
      inputSchema: {
        project_id: projectId,
        format: z.enum(['pdf', 'docx', 'md']).describe('File format'),
        version: z.number().int().min(1).optional().describe('Specific document version'),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        tools.exportDocument(user, {
          projectId: args.project_id,
          format: args.format,
          version: args.version,
        }),
      ),
  );

  server.registerTool(
    'archive_project',
    {
      title: 'Archive project',
      description:
        'Archive a project. It becomes read-only and is hidden from list_projects by default. Ask the user first.',
      inputSchema: { project_id: projectId },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => run(() => tools.archiveProject(user, args.project_id)),
  );

  server.registerTool(
    'log_change_request',
    {
      title: 'Log change request',
      description:
        'Record a change the client asks for after scoping. It is classified against the scope as in_scope, out_of_scope or ambiguous.',
      inputSchema: {
        project_id: projectId,
        request: z.string().min(1).max(10_000).describe('The requested change, verbatim'),
      },
      annotations: write,
    },
    (args) =>
      run(() =>
        tools.logChangeRequest(user, { projectId: args.project_id, request: args.request }),
      ),
  );

  server.registerTool(
    'list_change_requests',
    {
      title: 'List change requests',
      description: 'Change requests logged for a project with their classification and status.',
      inputSchema: { project_id: projectId },
      annotations: readOnly,
    },
    (args) => run(() => tools.listChangeRequests(user, args.project_id)),
  );

  return server;
}
