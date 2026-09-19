import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';

@Injectable()
export class ChangeRequestsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  async create(projectId: string, request: string, actorId: string) {
    const project: any = await this.db.project.findUnique({
      where: { id: projectId },
      include: { brief: true },
    });
    if (!project?.brief) fail('BRIEF_NOT_FOUND', 404);
    const text = request.trim().toLowerCase();
    if (!text) fail('INVALID_CHANGE_REQUEST', 400);
    const included = project.brief.data.included as string[];
    const excluded = project.brief.data.excluded as string[];
    const classification = excluded.some((item) => text.includes(item.toLowerCase()))
      ? 'out_of_scope'
      : included.some((item) => text.includes(item.toLowerCase()))
        ? 'in_scope'
        : 'ambiguous';
    return this.db.$transaction(async (tx) => {
      const change = await tx.changeRequest.create({
        data: {
          projectId,
          actorId,
          baseBriefVersion: project.brief.version,
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

  async list(projectId: string, user: any) {
    await this.auth.project(user, projectId);
    return this.db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  }

  async decide(projectId: string, id: string, status: 'accepted' | 'rejected', user: any) {
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
}
