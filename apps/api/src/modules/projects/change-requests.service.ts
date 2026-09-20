import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';
import { ChangeClassification, ChangeRequestStatus, User } from '@prisma/client';
import { validateBrief } from '../brief/brief.validation';

@Injectable()
export class ChangeRequestsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
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
    const included = brief.included;
    const excluded = brief.excluded;
    const classification = this.classify(text, included, excluded);
    return this.db.$transaction(async (tx) => {
      const change = await tx.changeRequest.create({
        data: {
          projectId,
          actorId,
          baseBriefVersion,
          request: request.trim(),
          classification,
        },
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
    await this.auth.project(user, projectId);
    return this.db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  }

  async decide(projectId: string, id: string, status: ChangeRequestStatus, user: User) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    const updated = await this.db.changeRequest.updateMany({
      where: { id, projectId, status: 'proposed' },
      data: { status },
    });
    if (!updated.count) fail('CHANGE_REQUEST_NOT_FOUND', 404);
    await this.db.auditEvent.create({
      data: {
        projectId,
        actorId: user.id,
        action: `change_request.${status}`,
        result: 'success',
        metadata: { changeRequestId: id },
      },
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
