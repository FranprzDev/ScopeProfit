import { Injectable } from '@nestjs/common';
import { User, Prisma, ProjectStatus } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { AgentService } from '../agent/agent.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../../prisma.service';
import { QuotesService } from '../pricing/quotes.service';
import { fail } from '../../security';
import { validateBrief } from '../brief/brief.validation';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

@Injectable()
export class McpService {
  constructor(
    private auth: AuthService,
    private projects: ProjectsService,
    private agent: AgentService,
    private documents: DocumentsService,
    private db: PrismaService,
    private quotes: QuotesService,
  ) {}

  tools(): McpTool[] {
    return [
      {
        name: 'presu_list_projects',
        description: 'Lista los proyectos del usuario autenticado.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'presu_create_project',
        description: 'Crea un proyecto nuevo para el usuario autenticado.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 200 },
            clientEmail: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_get_project',
        description: 'Obtiene un proyecto con Brief y documento actuales.',
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' } },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_send_message',
        description: 'Envía un mensaje del cliente/profesional al proyecto.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
          },
          required: ['projectId', 'content'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_list_messages',
        description: 'Lista mensajes de un proyecto.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_get_brief',
        description: 'Obtiene el Brief estructurado actual de un proyecto.',
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' } },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_get_state',
        description:
          'Obtiene estado del proyecto, versión de Brief/documento y preguntas bloqueantes.',
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' } },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_update_brief',
        description: 'Actualiza el Brief estructurado de un proyecto con validación de versión.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            expectedVersion: { type: 'integer', minimum: 0 },
            data: { type: 'object' },
          },
          required: ['projectId', 'expectedVersion', 'data'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_generate_document',
        description: 'Genera el documento/PDF base a partir del Brief actual.',
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' } },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_generate_quote',
        description: 'Genera una cotización borrador a partir del Brief y la RateCard del usuario.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            rateCardId: { type: 'string', format: 'uuid' },
          },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_get_quote',
        description: 'Obtiene la cotización actual de un proyecto.',
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string', format: 'uuid' } },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_download_quote',
        description: 'Descarga la cotización en PDF o DOCX como base64.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            format: { type: 'string', enum: ['pdf', 'docx'] },
          },
          required: ['projectId', 'format'],
          additionalProperties: false,
        },
      },
      {
        name: 'presu_access_status',
        description:
          'Devuelve el estado de créditos/uso gratuitos del usuario (placeholder hasta P5).',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ];
  }

  async callTool(user: User, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'presu_list_projects': {
        return this.projects.list(user, 100);
      }
      case 'presu_create_project': {
        const projectName = String(args.name ?? '').trim();
        if (!projectName) fail('INVALID_PROJECT_NAME', 400);
        const clientEmail = args.clientEmail ? String(args.clientEmail) : undefined;
        return this.projects.create(user, projectName, clientEmail);
      }
      case 'presu_get_project': {
        const projectId = String(args.projectId);
        const project = await this.auth.project(user, projectId);
        return {
          id: project.id,
          name: project.name,
          clientEmail: project.clientEmail,
          status: project.status,
          agentStatus: project.agentStatus,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
          brief: project.brief
            ? {
                version: project.brief.version,
                data: project.brief.data,
                updatedAt: project.brief.updatedAt.toISOString(),
              }
            : undefined,
          document: project.document?.versions?.[0]
            ? {
                version: project.document.versions[0].version,
                briefVersion: project.document.versions[0].briefVersion,
                status: project.document.versions[0].status,
                formats: Object.keys(project.document.versions[0].artifacts ?? {}),
              }
            : null,
        };
      }
      case 'presu_send_message': {
        const projectId = String(args.projectId);
        const content = String(args.content ?? '');
        const project = await this.auth.project(user, projectId);
        if (
          project.status === ProjectStatus.approved ||
          project.status === ProjectStatus.delivered ||
          project.status === ProjectStatus.archived
        )
          fail('PROJECT_LOCKED');
        if (!content.trim() || Buffer.byteLength(content, 'utf8') > 1024 * 1024)
          fail('INVALID_TEXT');
        const message = await this.db.message.create({
          data: {
            projectId,
            threadId: projectId,
            authorId: user.id,
            authorRole: user.role,
            content,
          },
        });
        await this.agent.enqueue(projectId);
        return {
          id: message.id,
          projectId: message.projectId,
          authorRole: message.authorRole,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        };
      }
      case 'presu_list_messages': {
        const projectId = String(args.projectId);
        await this.auth.project(user, projectId);
        const limit = Math.min(100, Math.max(1, Number(args.limit ?? 30)));
        const items = await this.db.message.findMany({
          where: { projectId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          include: { files: true },
        });
        return {
          items: items.map((m) => ({
            id: m.id,
            projectId: m.projectId,
            authorRole: m.authorRole,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            files: m.files.map((f) => ({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
            })),
          })),
        };
      }
      case 'presu_get_brief': {
        const projectId = String(args.projectId);
        const project = await this.auth.project(user, projectId);
        if (!project.brief) fail('BRIEF_NOT_FOUND', 404);
        return {
          version: project.brief.version,
          data: project.brief.data,
          updatedAt: project.brief.updatedAt.toISOString(),
        };
      }
      case 'presu_get_state': {
        const projectId = String(args.projectId);
        const project = await this.auth.project(user, projectId);
        const brief = project.brief;
        const document = project.document?.versions?.[0];
        const pendingQuestions = (brief ? validateBrief(brief.data).questions : []).filter(
          (q) => q.blocksEstimate,
        );
        return {
          briefVersion: brief?.version ?? 0,
          documentVersion: document?.version ?? 0,
          agentStatus: project.agentStatus,
          pendingQuestions,
          updatedAt: project.updatedAt.toISOString(),
          status: project.status,
        };
      }
      case 'presu_update_brief': {
        const projectId = String(args.projectId);
        const expectedVersion = Number(args.expectedVersion);
        const project = await this.auth.project(user, projectId);
        if (
          project.status === ProjectStatus.approved ||
          project.status === ProjectStatus.delivered ||
          project.status === ProjectStatus.archived
        )
          fail('PROJECT_LOCKED');
        const brief = validateBrief(args.data);
        const saved = await this.db.$transaction(async (tx) => {
          const updated = await tx.brief.updateMany({
            where: { projectId, version: expectedVersion },
            data: { version: { increment: 1 }, data: brief as unknown as Prisma.InputJsonValue },
          });
          if (!updated.count) fail('VERSION_CONFLICT');
          await tx.briefVersion.create({
            data: {
              projectId,
              version: expectedVersion + 1,
              data: brief as unknown as Prisma.InputJsonValue,
              source: user.role,
              actorId: user.id,
            },
          });
          return tx.brief.findUniqueOrThrow({ where: { projectId } });
        });
        return {
          version: saved.version,
          data: saved.data,
          updatedAt: saved.updatedAt.toISOString(),
        };
      }
      case 'presu_generate_document': {
        const projectId = String(args.projectId);
        await this.auth.project(user, projectId);
        const version = await this.documents.generate(projectId, user.id);
        return {
          version: version.version,
          briefVersion: version.briefVersion,
          status: version.status,
          formats: Object.keys(version.artifacts ?? {}),
        };
      }
      case 'presu_generate_quote': {
        const projectId = String(args.projectId);
        const rateCardId = args.rateCardId ? String(args.rateCardId) : undefined;
        return this.quotes.generate(user, projectId, rateCardId);
      }
      case 'presu_get_quote': {
        const projectId = String(args.projectId);
        return this.quotes.get(user, projectId);
      }
      case 'presu_download_quote': {
        const projectId = String(args.projectId);
        const format = String(args.format);
        const file = await this.quotes.download(user, projectId, format);
        return {
          name: file.name,
          mimeType: file.mimeType,
          base64: file.buffer.toString('base64'),
        };
      }
      case 'presu_access_status': {
        return {
          freeQuotes: { used: 0, limit: 5 },
          freeGrillingStarts: { used: 0, limit: 10 },
          note: 'Contadores persistentes se implementan en P5; este endpoint es placeholder.',
        };
      }
      default:
        fail('UNKNOWN_TOOL', 404);
    }
    return null;
  }

  extractUser(req: Request) {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    return this.auth.session(token).catch(() => null);
  }
}
