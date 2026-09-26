import { Injectable } from '@nestjs/common';
import {
  ChangeClassification,
  ChangeRequestStatus,
  Prisma,
  ProjectStatus,
  User,
} from '@prisma/client';
import type { BriefData } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';
import { validateBrief } from '../brief/brief.validation';
import { DocumentsService } from '../documents/documents.service';

const briefFields = new Set<keyof BriefData>([
  'summary',
  'requirements',
  'questions',
  'risks',
  'included',
  'excluded',
  'assumptions',
  'acceptanceCriteria',
  'estimates',
  'nextSteps',
]);

@Injectable()
export class ChangeRequestsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
    private documents: DocumentsService,
  ) {}

  async create(projectId: string, request: string, actorId: string) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      include: { brief: true },
    });
    if (!project?.brief) fail('BRIEF_NOT_FOUND', 404);
    const brief = validateBrief(project.brief.data);
    const baseBriefVersion = project.brief.version;
    const text = request.trim().toLowerCase();
    if (!text) fail('INVALID_CHANGE_REQUEST', 400);
    const classification = this.classify(text, brief.included, brief.excluded);
    return this.db.$transaction(async (tx) => {
      const change = await tx.changeRequest.create({
        data: { projectId, actorId, baseBriefVersion, request: request.trim(), classification },
      });
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId,
          action: 'change_request.created',
          result: 'success',
          metadata: { changeRequestId: change.id, classification },
        },
      });
      return change;
    });
  }

  async list(projectId: string, user: User) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    const [requests, events] = await Promise.all([
      this.db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } }),
      this.db.auditEvent.findMany({
        where: { projectId, action: { startsWith: 'change_request.' } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const users = await this.db.user.findMany({
      where: { id: { in: [...new Set(events.flatMap((event) => event.actorId ?? []))] } },
      select: { id: true, email: true },
    });
    const emails = new Map(users.map((actor) => [actor.id, actor.email]));
    return requests.map((request) => ({
      ...request,
      history: events
        .filter((event) => {
          const metadata = event.metadata;
          return (
            metadata !== null &&
            typeof metadata === 'object' &&
            'changeRequestId' in metadata &&
            metadata.changeRequestId === request.id
          );
        })
        .map((event) => ({
          action: event.action,
          result: event.result,
          actorId: event.actorId,
          actorEmail: event.actorId ? emails.get(event.actorId) : null,
          createdAt: event.createdAt,
        })),
    }));
  }

  async setPatch(
    projectId: string,
    id: string,
    baseBriefVersion: number,
    patch: Record<string, unknown>,
    user: User,
  ) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    const change = await this.db.changeRequest.findFirst({ where: { id, projectId } });
    if (!change) fail('CHANGE_REQUEST_NOT_FOUND', 404);
    if (change.status !== ChangeRequestStatus.proposed) fail('CHANGE_REQUEST_DECIDED', 409);
    if (change.baseBriefVersion !== baseBriefVersion) fail('VERSION_CONFLICT', 409);
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      include: { brief: true },
    });
    if (!project?.brief) fail('BRIEF_NOT_FOUND', 404);
    if (project.brief.version !== baseBriefVersion) fail('VERSION_CONFLICT', 409);
    const brief = validateBrief(project.brief.data);
    const keys = Object.keys(patch);
    if (!keys.length || keys.some((key) => !briefFields.has(key as keyof BriefData)))
      fail('INVALID_BRIEF_PATCH', 400);
    const validatedPatch = validateBrief({ ...brief, ...patch });
    const normalizedPatch = Object.fromEntries(
      keys.map((key) => [key, validatedPatch[key as keyof BriefData]]),
    );
    const saved = await this.db.changeRequest.updateMany({
      where: { id, projectId, status: ChangeRequestStatus.proposed },
      data: { patch: normalizedPatch as Prisma.InputJsonValue, lastError: null },
    });
    if (saved.count !== 1) fail('CHANGE_REQUEST_DECIDED', 409);
    return this.db.changeRequest.findUniqueOrThrow({ where: { id } });
  }

  async decide(projectId: string, id: string, status: ChangeRequestStatus, user: User) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    let change = await this.db.changeRequest.findFirst({ where: { id, projectId } });
    if (!change) fail('CHANGE_REQUEST_NOT_FOUND', 404);

    if (
      change.status === ChangeRequestStatus.accepted ||
      change.status === ChangeRequestStatus.rejected
    ) {
      if (change.status !== status) fail('CHANGE_REQUEST_DECISION_CONFLICT', 409);
      return change;
    }

    if (status === ChangeRequestStatus.rejected) {
      if (change.status !== ChangeRequestStatus.proposed)
        fail('CHANGE_REQUEST_DECISION_CONFLICT', 409);
      await this.db.$transaction(async (tx) => {
        const updated = await tx.changeRequest.updateMany({
          where: { id, projectId, status: ChangeRequestStatus.proposed },
          data: { status, decisionBy: user.id, decisionAt: new Date(), lastError: null },
        });
        if (updated.count !== 1) fail('CHANGE_REQUEST_DECISION_CONFLICT', 409);
        await tx.auditEvent.create({
          data: {
            projectId,
            actorId: user.id,
            action: 'change_request.rejected',
            result: 'success',
            metadata: { changeRequestId: id },
          },
        });
      });
      return this.db.changeRequest.findUniqueOrThrow({ where: { id } });
    }

    if (status !== ChangeRequestStatus.accepted) fail('INVALID_CHANGE_REQUEST_DECISION', 400);
    if (change.status === ChangeRequestStatus.proposed) {
      if (!change.patch) fail('CHANGE_REQUEST_PATCH_REQUIRED', 409);
      await this.db.$transaction(
        async (tx) => {
          const current = await tx.changeRequest.findFirst({ where: { id, projectId } });
          if (!current || current.status !== ChangeRequestStatus.proposed || !current.patch)
            fail('CHANGE_REQUEST_DECISION_CONFLICT', 409);
          const project = await tx.project.findUnique({
            where: { id: projectId },
            include: { brief: true },
          });
          if (!project?.brief) fail('BRIEF_NOT_FOUND', 404);
          if (
            project.status === ProjectStatus.approved ||
            project.status === ProjectStatus.delivered ||
            project.status === ProjectStatus.archived
          )
            fail('PROJECT_LOCKED', 409);
          if (project.brief.version !== current.baseBriefVersion) fail('VERSION_CONFLICT', 409);
          const base = validateBrief(project.brief.data);
          const patch = current.patch as Record<string, unknown>;
          const keys = Object.keys(patch);
          if (!keys.length || keys.some((key) => !briefFields.has(key as keyof BriefData)))
            fail('INVALID_BRIEF_PATCH', 400);
          const result = validateBrief({ ...base, ...patch });
          const version = current.baseBriefVersion + 1;
          const updatedBrief = await tx.brief.updateMany({
            where: { projectId, version: current.baseBriefVersion },
            data: { version, data: result as unknown as Prisma.InputJsonValue },
          });
          if (updatedBrief.count !== 1) fail('VERSION_CONFLICT', 409);
          await tx.briefVersion.create({
            data: {
              projectId,
              version,
              data: result as unknown as Prisma.InputJsonValue,
              source: 'change_request',
              actorId: user.id,
            },
          });
          const started = await tx.changeRequest.updateMany({
            where: { id, projectId, status: ChangeRequestStatus.proposed },
            data: {
              status: ChangeRequestStatus.applying,
              decisionBy: user.id,
              decisionAt: new Date(),
              appliedBriefVersion: version,
              lastError: null,
            },
          });
          if (started.count !== 1) fail('CHANGE_REQUEST_DECISION_CONFLICT', 409);
          await tx.auditEvent.create({
            data: {
              projectId,
              actorId: user.id,
              action: 'change_request.accepting',
              result: 'success',
              metadata: { changeRequestId: id, briefVersion: version },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      change = await this.db.changeRequest.findUniqueOrThrow({ where: { id } });
    }

    if (change.status !== ChangeRequestStatus.applying || !change.appliedBriefVersion)
      fail('CHANGE_REQUEST_DECISION_CONFLICT', 409);
    let document = await this.db.documentVersion.findFirst({
      where: { document: { projectId }, briefVersion: change.appliedBriefVersion },
      orderBy: { version: 'desc' },
    });
    if (!document) {
      try {
        document = await this.documents.generate(
          projectId,
          user.id,
          undefined,
          undefined,
          change.appliedBriefVersion,
        );
      } catch {
        document = await this.db.documentVersion.findFirst({
          where: { document: { projectId }, briefVersion: change.appliedBriefVersion },
          orderBy: { version: 'desc' },
        });
        if (!document) {
          await this.db.$transaction(async (tx) => {
            await tx.changeRequest.updateMany({
              where: { id, projectId, status: ChangeRequestStatus.applying },
              data: { lastError: 'DOCUMENT_GENERATION_FAILED' },
            });
            await tx.auditEvent.create({
              data: {
                projectId,
                actorId: user.id,
                action: 'change_request.accepting',
                result: 'failed',
                metadata: { changeRequestId: id, error: 'DOCUMENT_GENERATION_FAILED' },
              },
            });
          });
          fail('DOCUMENT_GENERATION_FAILED', 503);
        }
      }
    }
    if (document.briefVersion !== change.appliedBriefVersion) fail('VERSION_CONFLICT', 409);
    await this.db.$transaction(async (tx) => {
      const saved = await tx.changeRequest.updateMany({
        where: { id, projectId, status: ChangeRequestStatus.applying },
        data: {
          status: ChangeRequestStatus.accepted,
          documentVersion: document.version,
          lastError: null,
        },
      });
      if (saved.count) {
        await tx.auditEvent.create({
          data: {
            projectId,
            actorId: user.id,
            action: 'change_request.accepted',
            result: 'success',
            metadata: {
              changeRequestId: id,
              briefVersion: change.appliedBriefVersion,
              documentVersion: document.version,
            },
          },
        });
      }
    });
    return this.db.changeRequest.findUniqueOrThrow({ where: { id } });
  }

  private classify(text: string, included: string[], excluded: string[]) {
    for (const item of excluded) {
      if (text.includes(item.toLowerCase())) return ChangeClassification.out_of_scope;
    }
    for (const item of included) {
      if (text.includes(item.toLowerCase())) return ChangeClassification.in_scope;
    }
    return ChangeClassification.ambiguous;
  }
}
