import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, ProjectStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { emptyBrief } from '@scopeprofit/contracts';
import type { BriefData, TiptapNode } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { DocumentsService } from '../documents/documents.service';
import { AgentService } from '../agent/agent.service';
import { StorageService } from '../storage/storage.service';
import { ChangeRequestsService } from '../projects/change-requests.service';
import { briefSchema, validateBrief, validateSources } from '../brief/brief.validation';
import { markdown } from '../documents/render';
import { fail } from '../../security';
import { fetchImage } from './image-fetch';
import { exportUrl, ExportFormat } from './export-links';

export { SCOPE_SECTIONS } from './scope-sections';
import type { ScopeSection } from './scope-sections';

const LOCKED: ProjectStatus[] = [
  ProjectStatus.approved,
  ProjectStatus.delivered,
  ProjectStatus.archived,
];
const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Transport-agnostic implementation of every MCP tool. Each method receives the authenticated
 * professional and plain arguments, reuses the existing domain services and returns JSON-safe data.
 */
@Injectable()
export class ScopeToolsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
    private projects: ProjectsService,
    private documents: DocumentsService,
    private agent: AgentService,
    private storage: StorageService,
    private changes: ChangeRequestsService,
  ) {}

  async listProjects(
    user: User,
    input: { status?: ProjectStatus; includeArchived?: boolean; limit?: number; cursor?: string },
  ) {
    this.auth.professional(user);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const items = await this.db.project.findMany({
      where: input.status
        ? { status: input.status }
        : input.includeArchived
          ? {}
          : { status: { not: ProjectStatus.archived } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { brief: true },
    });
    const more = items.length > limit;
    if (more) items.pop();
    return {
      projects: items.map((project) => {
        const brief = project.brief ? validateBrief(project.brief.data) : null;
        return {
          projectId: project.id,
          name: project.name,
          status: project.status,
          agentStatus: project.agentStatus,
          tldr: brief?.summary || null,
          blockingQuestions: brief?.questions.filter((q) => q.blocksEstimate).length ?? 0,
          updatedAt: project.updatedAt.toISOString(),
        };
      }),
      nextCursor: more ? items.at(-1)!.id : null,
    };
  }

  async createProject(
    user: User,
    input: { name: string; clientEmail?: string; clientName?: string },
  ) {
    const name = input.name.trim();
    if (!name) fail('INVALID_PROJECT_NAME', 400, 'Project name is required');
    const project = await this.projects.create(
      user,
      name.slice(0, 200),
      input.clientEmail,
      input.clientName,
    );
    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      clientEmail: project.clientEmail,
      clientName: project.clientName,
      legacyClientChatUrl: project.clientUrl,
      next: 'Send what the client said (text and image URLs) with add_client_input.',
    };
  }

  async getProject(user: User, projectId: string) {
    const project = await this.project(user, projectId);
    const brief = this.brief(project.brief?.data);
    const latest = project.document?.versions[0];
    const messages = await this.db.message.count({ where: { projectId } });
    return {
      projectId: project.id,
      name: project.name,
      status: project.status,
      agentStatus: project.agentStatus,
      agentError: project.agentError,
      clientEmail: project.clientEmail,
      clientName: project.clientName,
      briefVersion: project.brief?.version ?? 0,
      document: latest
        ? {
            version: latest.version,
            status: latest.status,
            briefVersion: latest.briefVersion,
            upToDate: latest.briefVersion === project.brief?.version,
          }
        : null,
      counts: {
        messages,
        requirements: brief.requirements.length,
        pendingQuestions: brief.questions.length,
        blockingQuestions: brief.questions.filter((q) => q.blocksEstimate).length,
        risks: brief.risks.length,
      },
      editable: !LOCKED.includes(project.status),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  async addClientInput(
    user: User,
    input: {
      projectId: string;
      text?: string;
      imageUrls?: string[];
      author?: 'client' | 'professional';
      analyze?: boolean;
    },
  ) {
    const project = await this.editable(user, input.projectId);
    const text = input.text?.trim();
    const imageUrls = input.imageUrls ?? [];
    if (!text && !imageUrls.length) fail('EMPTY_INPUT', 400, 'Provide text, image_urls or both');
    if (text) this.storage.validateText(text);
    const images = await Promise.all(imageUrls.map((url) => fetchImage(url)));
    const authorRole = input.author ?? 'client';
    const created: { messageId: string; kind: 'text' | 'image'; fileId?: string }[] = [];
    if (text) {
      const message = await this.db.message.create({
        data: {
          projectId: project.id,
          threadId: project.id,
          authorId: user.id,
          authorRole,
          content: text,
        },
      });
      created.push({ messageId: message.id, kind: 'text' });
    }
    for (const image of images) {
      const { mimeType, size } = await this.storage.validateImage({
        buffer: image.buffer,
        mimetype: image.mimeType,
        originalname: image.originalname,
        size: image.buffer.length,
      } as Express.Multer.File);
      const extension = image.originalname.slice(image.originalname.lastIndexOf('.'));
      const written = await this.storage.write(
        `${project.id}/uploads/${randomUUID()}${extension}`,
        image.buffer,
      );
      const message = await this.db.message.create({
        data: {
          projectId: project.id,
          threadId: project.id,
          authorId: user.id,
          authorRole,
          content: '[imagen]',
        },
      });
      const file = await this.db.file.create({
        data: {
          projectId: project.id,
          messageId: message.id,
          name: image.originalname,
          mimeType,
          size,
          path: written.path,
          checksum: written.checksum,
        },
      });
      created.push({ messageId: message.id, kind: 'image', fileId: file.id });
    }
    await this.db.auditEvent.create({
      data: {
        projectId: project.id,
        actorId: user.id,
        action: 'mcp.input_added',
        result: 'success',
        metadata: { messages: created.length, images: images.length, authorRole },
      },
    });
    const analyze = input.analyze ?? false;
    if (analyze) await this.agent.enqueue(project.id);
    const fresh = await this.db.project.findUniqueOrThrow({ where: { id: project.id } });
    return {
      projectId: project.id,
      added: created,
      agentStatus: fresh.agentStatus,
      next: analyze
        ? 'The server-side scope agent re-analyses the project in the background (needs the owner AI key). Poll get_tldr or get_project, or draft the scope yourself with update_scope_section.'
        : 'Draft or refine the scope with update_scope_section, citing these message ids as sources.',
    };
  }

  async getConversation(user: User, input: { projectId: string; limit?: number }) {
    await this.project(user, input.projectId);
    const limit = Math.min(200, Math.max(1, input.limit ?? 100));
    const messages = await this.db.message.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { files: true },
    });
    return {
      projectId: input.projectId,
      messages: messages.reverse().map((m) => ({
        messageId: m.id,
        authorRole: m.authorRole,
        content: m.content,
        files: m.files.map((f) => ({ fileId: f.id, name: f.name, mimeType: f.mimeType })),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async getTldr(user: User, projectId: string) {
    const project = await this.project(user, projectId);
    const brief = this.brief(project.brief?.data);
    const total = brief.estimates.reduce(
      (sum, e) => ({ min: sum.min + e.minHours, max: sum.max + e.maxHours }),
      { min: 0, max: 0 },
    );
    return {
      projectId,
      name: project.name,
      status: project.status,
      agentStatus: project.agentStatus,
      briefVersion: project.brief?.version ?? 0,
      tldr: brief.summary || 'No summary yet: add client input first.',
      requirements: brief.requirements.length,
      blockingQuestions: brief.questions.filter((q) => q.blocksEstimate).length,
      topQuestions: brief.questions.slice(0, 3).map((q) => ({ id: q.id, question: q.question })),
      redRisks: brief.risks.filter((r) => r.severity === 'red').length,
      estimateHours: brief.estimates.length ? total : null,
    };
  }

  async listPendingQuestions(user: User, input: { projectId: string; blockingOnly?: boolean }) {
    const project = await this.project(user, input.projectId);
    const brief = this.brief(project.brief?.data);
    return {
      projectId: input.projectId,
      briefVersion: project.brief?.version ?? 0,
      questions: brief.questions.filter((q) => !input.blockingOnly || q.blocksEstimate),
    };
  }

  async answerQuestion(
    user: User,
    input: { projectId: string; questionId: string; answer: string; analyze?: boolean },
  ) {
    const project = await this.editable(user, input.projectId);
    if (!project.brief) fail('BRIEF_NOT_FOUND', 404);
    const brief = this.brief(project.brief.data);
    const question = brief.questions.find((q) => q.id === input.questionId);
    if (!question) fail('QUESTION_NOT_FOUND', 404, `No pending question ${input.questionId}`);
    const answer = input.answer.trim();
    if (!answer) fail('INVALID_TEXT', 400, 'Answer is required');
    this.storage.validateText(answer);
    const message = await this.db.message.create({
      data: {
        projectId: project.id,
        threadId: project.id,
        authorId: user.id,
        authorRole: 'client',
        content: `${question.id} — ${question.question}\n${answer}`,
      },
    });
    const next = { ...brief, questions: brief.questions.filter((q) => q.id !== question.id) };
    const saved = await this.saveBrief(user, project.id, project.brief.version, next);
    if (input.analyze) await this.agent.enqueue(project.id);
    return {
      projectId: project.id,
      answeredQuestionId: question.id,
      messageId: message.id,
      ...saved,
    };
  }

  async getScopeDocument(user: User, projectId: string) {
    const project = await this.project(user, projectId);
    const brief = this.brief(project.brief?.data);
    const latest = project.document?.versions[0];
    const document = markdown({
      projectName: project.name,
      clientName: project.clientName || project.clientEmail || 'Cliente',
      author: user.email || 'Profesional',
      date: new Date().toISOString(),
      version: latest?.version ?? 0,
      brief,
      editorContent: (latest?.editorContent as unknown as TiptapNode | null) ?? null,
    });
    return {
      projectId,
      template: '7.1',
      briefVersion: project.brief?.version ?? 0,
      documentVersion: latest?.version ?? null,
      documentStatus: latest?.status ?? null,
      documentUpToDate: latest ? latest.briefVersion === project.brief?.version : false,
      markdown: document,
      brief,
    };
  }

  async updateScopeSection(
    user: User,
    input: {
      projectId: string;
      expectedVersion: number;
      section: ScopeSection;
      value: unknown;
      reanalyze?: boolean;
    },
  ) {
    const project = await this.editable(user, input.projectId);
    if (!project.brief) fail('BRIEF_NOT_FOUND', 404);
    if (project.brief.version !== input.expectedVersion)
      fail(
        'VERSION_CONFLICT',
        409,
        `Brief is at version ${project.brief.version}; re-read it with get_scope_document and retry`,
      );
    const parsed = briefSchema.shape[input.section].safeParse(input.value);
    if (!parsed.success)
      fail(
        'INVALID_SECTION_VALUE',
        400,
        `${input.section}: ${parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.') || 'value'} ${issue.message}`)
          .join('; ')}`,
      );
    const next = validateBrief({ ...this.brief(project.brief.data), [input.section]: parsed.data });
    if (input.section === 'requirements') {
      const messages = await this.db.message.findMany({
        where: { projectId: project.id },
        select: { id: true, content: true },
      });
      try {
        validateSources(next, messages);
      } catch {
        fail(
          'INVALID_REQUIREMENT_SOURCE',
          400,
          'Every requirement.source must be an exact quote from the message whose id is sourceMessageId (see get_conversation)',
        );
      }
    }
    const saved = await this.saveBrief(user, project.id, input.expectedVersion, next);
    if (input.reanalyze) await this.agent.enqueue(project.id);
    return { projectId: project.id, section: input.section, ...saved };
  }

  async approveScope(
    user: User,
    input: {
      projectId: string;
      documentVersion: number;
      sendToClient?: boolean;
      clientEmail?: string;
    },
  ) {
    this.auth.professional(user);
    const project = await this.project(user, input.projectId);
    const sendToClient = input.sendToClient ?? false;
    if (input.clientEmail && !project.clientEmail)
      await this.db.project.update({
        where: { id: project.id },
        data: { clientEmail: input.clientEmail.toLowerCase() },
      });
    if (sendToClient && !project.clientEmail && !input.clientEmail)
      fail(
        'CLIENT_EMAIL_REQUIRED',
        400,
        'Pass client_email, or send_to_client=false and share an export_document link instead',
      );
    const approved = await this.documents.approve(project.id, user.id, input.documentVersion, {
      deliver: sendToClient,
    });
    return {
      projectId: project.id,
      documentVersion: input.documentVersion,
      status: approved?.status ?? 'approved',
      emailedToClient: !!approved?.deliveredAt,
      downloads: {
        pdf: exportUrl(project.id, input.documentVersion, 'pdf'),
        docx: exportUrl(project.id, input.documentVersion, 'docx'),
      },
    };
  }

  async exportDocument(
    user: User,
    input: { projectId: string; format: ExportFormat; version?: number },
  ) {
    const project = await this.project(user, input.projectId);
    let version = input.version ?? project.document?.versions[0]?.version;
    const latest = project.document?.versions[0];
    const stale = !latest || latest.briefVersion !== project.brief?.version;
    if (input.version === undefined && stale && !LOCKED.includes(project.status))
      version = (await this.documents.generate(project.id, user.id)).version;
    if (!version) fail('DOCUMENT_NOT_FOUND', 404, 'No document has been generated yet');
    await this.documents.download(project.id, version, input.format);
    return {
      projectId: project.id,
      version,
      format: input.format,
      ...exportUrl(project.id, version, input.format),
    };
  }

  async archiveProject(user: User, projectId: string) {
    await this.project(user, projectId);
    await this.projects.archive(projectId, user);
    return { projectId, status: ProjectStatus.archived };
  }

  async logChangeRequest(user: User, input: { projectId: string; request: string }) {
    this.auth.professional(user);
    await this.project(user, input.projectId);
    const change = await this.changes.create(input.projectId, input.request, user.id);
    return {
      changeRequestId: change.id,
      classification: change.classification,
      status: change.status,
      baseBriefVersion: change.baseBriefVersion,
    };
  }

  async listChangeRequests(user: User, projectId: string) {
    const changes = await this.changes.list(projectId, user);
    return {
      projectId,
      changeRequests: changes.map((c) => ({
        changeRequestId: c.id,
        request: c.request,
        classification: c.classification,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  private brief(data: Prisma.JsonValue | undefined): BriefData {
    return data ? validateBrief(data) : emptyBrief();
  }

  private async project(user: User, projectId: string) {
    this.auth.professional(user);
    return this.auth.project(user, projectId);
  }

  private async editable(user: User, projectId: string) {
    const project = await this.project(user, projectId);
    if (LOCKED.includes(project.status))
      fail('PROJECT_LOCKED', 409, `Project is ${project.status} and can no longer be edited`);
    return project;
  }

  /** Optimistic-locked brief write + a new document version, mirroring PATCH /brief. */
  private async saveBrief(
    user: User,
    projectId: string,
    expectedVersion: number,
    brief: BriefData,
  ) {
    const document = await this.db.$transaction(
      async (tx) => {
        const updated = await tx.brief.updateMany({
          where: { projectId, version: expectedVersion },
          data: { version: { increment: 1 }, data: json(brief) },
        });
        if (!updated.count) fail('VERSION_CONFLICT', 409, 'Brief changed; re-read it and retry');
        await tx.briefVersion.create({
          data: {
            projectId,
            version: expectedVersion + 1,
            data: json(brief),
            source: 'mcp',
            actorId: user.id,
          },
        });
        return this.documents.saveDraft(tx, projectId, user.id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { briefVersion: expectedVersion + 1, documentVersion: document.version };
  }
}
