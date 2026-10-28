import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, ProjectStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { emptyBrief } from '@scopeprofit/contracts';
import type { BriefData, DocumentData } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { DocumentsService } from '../documents/documents.service';
import { AgentService } from '../agent/agent.service';
import { StorageService } from '../storage/storage.service';
import { ChangeRequestsService } from '../projects/change-requests.service';
import { briefWriteSchema, validateBrief, validateSources } from '../brief/brief.validation';
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
    input: {
      status?: ProjectStatus;
      includeArchived?: boolean;
      limit?: number;
      cursor?: string;
      order?: 'activity' | 'created';
    },
  ) {
    this.auth.professional(user);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const stable = input.order === 'created';
    const anchor = input.cursor
      ? await this.db.project.findUnique({
          where: { id: input.cursor },
          select: { id: true, createdAt: true },
        })
      : null;
    if (input.cursor && !anchor) fail('INVALID_CURSOR', 400, 'Project cursor does not exist');
    const items = await this.db.project.findMany({
      where: {
        ...(input.status
          ? { status: input.status }
          : input.includeArchived
            ? {}
            : { status: { not: ProjectStatus.archived } }),
        ...(stable && anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: stable
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(!stable && input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
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
      order: input.order ?? 'activity',
      traversalGuidance: stable
        ? 'Creation order is stable across project activity. Keep the same filters and order on every page. New projects require a fresh traversal.'
        : 'Activity order is a live view, not an exhaustive traversal: concurrent activity can move unseen projects above your cursor. Use order=created for stable traversal.',
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
            matchesBriefVersion: latest.briefVersion === project.brief?.version,
            manualEditsRequireReview:
              (latest.data as unknown as DocumentData).manualEditsRequireReview === true,
          }
        : null,
      inputCoverageVerified: false,
      reviewGuidance:
        'Document freshness only compares document and brief versions. Read the conversation and check all affected sections; input coverage is not verified.',
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
    const text = input.text;
    const imageUrls = input.imageUrls ?? [];
    if (!text?.trim() && !imageUrls.length)
      fail('EMPTY_INPUT', 400, 'Provide text, image_urls or both');
    if (text) this.storage.validateText(text);
    const images = await Promise.all(imageUrls.map((url) => fetchImage(url)));
    const prepared = [];
    for (const image of images) {
      const validated = await this.storage.validateImage({
        buffer: image.buffer,
        mimetype: image.mimeType,
        originalname: image.originalname,
        size: image.buffer.length,
      } as Express.Multer.File);
      prepared.push({ ...image, ...validated });
    }
    const uploads: (Awaited<ReturnType<typeof fetchImage>> &
      Awaited<ReturnType<StorageService['write']>>)[] = [];
    const authorRole = input.author ?? 'client';
    const created = await (async () => {
      try {
        for (const image of prepared) {
          const extension = image.originalname.slice(image.originalname.lastIndexOf('.'));
          const written = await this.storage.write(
            `${project.id}/uploads/${randomUUID()}${extension}`,
            image.buffer,
          );
          uploads.push({ ...image, ...written });
        }
        return await this.db.$transaction(async (tx) => {
          const editable = await tx.project.updateMany({
            where: { id: project.id, status: { notIn: LOCKED } },
            data: { updatedAt: new Date() },
          });
          if (!editable.count) fail('PROJECT_LOCKED', 409, 'Project can no longer be edited');
          const added: { messageId: string; kind: 'text' | 'image'; fileId?: string }[] = [];
          if (text) {
            const message = await tx.message.create({
              data: {
                projectId: project.id,
                threadId: project.id,
                authorId: user.id,
                authorRole,
                content: text,
              },
            });
            added.push({ messageId: message.id, kind: 'text' });
          }
          for (const image of uploads) {
            const message = await tx.message.create({
              data: {
                projectId: project.id,
                threadId: project.id,
                authorId: user.id,
                authorRole,
                content: '[imagen]',
              },
            });
            const file = await tx.file.create({
              data: {
                projectId: project.id,
                messageId: message.id,
                name: image.originalname,
                mimeType: image.mimeType,
                size: image.size,
                path: image.path,
                checksum: image.checksum,
              },
            });
            added.push({ messageId: message.id, kind: 'image', fileId: file.id });
          }
          await tx.auditEvent.create({
            data: {
              projectId: project.id,
              actorId: user.id,
              action: 'mcp.input_added',
              result: 'success',
              metadata: { messages: added.length, images: images.length, authorRole },
            },
          });
          return added;
        });
      } catch (error) {
        await Promise.all(uploads.map((image) => this.storage.remove(image.path)));
        throw error;
      }
    })();
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

  async getConversation(
    user: User,
    input: {
      projectId: string;
      limit?: number;
      beforeMessageId?: string;
      messageId?: string;
      contentOffset?: number;
    },
  ) {
    await this.project(user, input.projectId);
    if (
      (input.messageId && input.beforeMessageId) ||
      (input.contentOffset !== undefined && !input.messageId)
    )
      fail(
        'INVALID_CURSOR',
        400,
        'Use message_id with content_offset, or before_message_id for older pages',
      );
    const limit = input.messageId ? 1 : Math.min(200, Math.max(1, input.limit ?? 100));
    const anchor = input.beforeMessageId
      ? await this.db.message.findFirst({
          where: { id: input.beforeMessageId, projectId: input.projectId },
          select: { id: true, createdAt: true },
        })
      : null;
    if (input.beforeMessageId && !anchor)
      fail('INVALID_CURSOR', 400, 'Cursor must identify a message in this project');
    const messages = await this.db.message.findMany({
      where: {
        projectId: input.projectId,
        ...(input.messageId ? { id: input.messageId } : {}),
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { files: true },
    });
    if (input.messageId && !messages.length) fail('MESSAGE_NOT_FOUND', 404);
    const selected = [];
    let used = 0;
    for (const message of messages.slice(0, limit)) {
      const offset = input.messageId ? (input.contentOffset ?? 0) : 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > message.content.length)
        fail('INVALID_CONTENT_OFFSET', 400);
      const end = Math.min(message.content.length, offset + 10_000);
      const item = {
        messageId: message.id,
        authorRole: message.authorRole,
        content: message.content.slice(offset, end),
        contentOffset: offset,
        contentLength: message.content.length,
        nextContentOffset: end < message.content.length ? end : null,
        contentComplete: offset === 0 && end === message.content.length,
        files: message.files.map((file) => ({
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
        })),
        createdAt: message.createdAt.toISOString(),
      };
      const size = JSON.stringify(item).length;
      if (selected.length && used + size > 30_000) break;
      selected.push(item);
      used += size;
    }
    const hasMore = !input.messageId && messages.length > selected.length;
    return {
      projectId: input.projectId,
      hasMore,
      nextCursor: hasMore ? selected.at(-1)!.messageId : null,
      messages: selected.reverse(),
      contentGuidance:
        'Incomplete content is explicitly marked. Retrieve remaining exact text with message_id and nextContentOffset as content_offset. Offsets count UTF-16 code units. Follow nextCursor as before_message_id for older messages.',
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
      topQuestions: [...brief.questions]
        .sort((a, b) => Number(b.blocksEstimate) - Number(a.blocksEstimate))
        .slice(0, 3)
        .map((q) => ({ id: q.id, question: q.question, blocksEstimate: q.blocksEstimate })),
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
    input: {
      projectId: string;
      questionId: string;
      answer: string;
      expectedVersion: number;
      analyze?: boolean;
    },
  ) {
    const project = await this.editable(user, input.projectId);
    if (!project.brief) fail('BRIEF_NOT_FOUND', 404);
    if (project.brief.version !== input.expectedVersion)
      fail(
        'VERSION_CONFLICT',
        409,
        'Question context changed; re-read pending questions before answering',
      );
    const brief = this.brief(project.brief.data);
    const question = brief.questions.find((q) => q.id === input.questionId);
    if (!question) fail('QUESTION_NOT_FOUND', 404, `No pending question ${input.questionId}`);
    if (brief.questions.filter((item) => item.id === input.questionId).length !== 1)
      fail('AMBIGUOUS_QUESTION_ID', 409, 'Give pending questions unique ids before answering');
    const answer = input.answer;
    if (!answer.trim()) fail('INVALID_TEXT', 400, 'Answer is required');
    this.storage.validateText(answer);
    const next = { ...brief, questions: brief.questions.filter((q) => q.id !== question.id) };
    const saved = await this.saveBrief(user, project.id, project.brief.version, next, {
      content: `${question.id} — ${question.question}\n${answer}`,
    });
    if (input.analyze) await this.agent.enqueue(project.id);
    return {
      projectId: project.id,
      answeredQuestionId: question.id,
      messageId: saved.messageId,
      reviewRequired: {
        sections: [
          'summary',
          'requirements',
          'risks',
          'included',
          'excluded',
          'assumptions',
          'acceptanceCriteria',
          'estimates',
          'nextSteps',
        ] satisfies ScopeSection[],
        reason:
          'Only the answered question was removed. Other sections may contradict the new answer.',
      },
      next: 'Read the answer and full scope. Update every affected section, including the summary. Read back the whole document to check for contradictions before asking the professional to review it. This checklist is not a semantic validation or approval.',
      ...saved,
    };
  }

  async getScopeDocument(user: User, projectId: string) {
    const project = await this.project(user, projectId);
    const brief = this.brief(project.brief?.data);
    const latest = project.document?.versions[0];
    const owner = await this.db.user.findUniqueOrThrow({ where: { id: project.ownerId } });
    const document = markdown(
      latest
        ? (latest.data as unknown as DocumentData)
        : {
            projectName: project.name,
            clientName: project.clientName || project.clientEmail || 'Cliente',
            author: owner.email || 'Profesional',
            date: new Date().toISOString(),
            version: 0,
            brief,
            editorContent: null,
          },
    );
    return {
      projectId,
      template: '7.1',
      briefVersion: project.brief?.version ?? 0,
      documentVersion: latest?.version ?? null,
      documentStatus: latest?.status ?? null,
      manualEditsRequireReview: latest
        ? (latest.data as unknown as DocumentData).manualEditsRequireReview === true
        : false,
      documentUpToDate: latest ? latest.briefVersion === project.brief?.version : false,
      documentMatchesBriefVersion: latest ? latest.briefVersion === project.brief?.version : false,
      inputCoverageVerified: false,
      reviewGuidance:
        'Document freshness only compares document and brief versions. Read the conversation and check all affected sections; input coverage is not verified.',
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
    const parsed = briefWriteSchema.shape[input.section].safeParse(input.value);
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
      manualEditsReviewed?: boolean;
    },
  ) {
    this.auth.professional(user);
    const project = await this.project(user, input.projectId);
    const sendToClient = input.sendToClient ?? false;
    if (sendToClient && !project.clientEmail && !input.clientEmail)
      fail(
        'CLIENT_EMAIL_REQUIRED',
        400,
        'Pass client_email, or send_to_client=false and share an export_document link instead',
      );
    const approved = await this.documents.approve(project.id, user.id, input.documentVersion, {
      deliver: sendToClient,
      clientEmail: input.clientEmail,
      manualEditsReviewed: input.manualEditsReviewed,
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
      inputCoverageVerified: false,
      reviewGuidance:
        'Exporting does not verify that client inputs are reflected in this document. Review the conversation and the exported version before sharing.',
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
    answer?: { content: string },
  ) {
    const saved = await this.db.$transaction(
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
        const message = answer
          ? await tx.message.create({
              data: {
                projectId,
                threadId: projectId,
                authorId: user.id,
                authorRole: 'client',
                content: answer.content,
              },
            })
          : null;
        const document = await this.documents.saveDraft(tx, projectId, user.id);
        return { document, message };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      briefVersion: expectedVersion + 1,
      documentVersion: saved.document.version,
      ...(saved.message ? { messageId: saved.message.id } : {}),
    };
  }
}
