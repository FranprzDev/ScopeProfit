import { Injectable } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { emptyBrief } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';
@Injectable()
export class ProjectsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}
  async create(user: User, name: string, clientName?: string) {
    const displayName = clientName?.trim();
    if (displayName !== undefined && (!displayName || displayName.length > 200))
      fail('INVALID_CLIENT_NAME', 400, 'Client name must be between 1 and 200 characters');
    const project = await this.db.project.create({
      data: {
        name,
        ownerId: user.id,
        clientName: displayName,
        brief: { create: { data: emptyBrief() as unknown as Prisma.InputJsonValue } },
        document: { create: {} },
      },
    });
    await this.db.auditEvent.create({
      data: {
        projectId: project.id,
        actorId: user.id,
        action: 'project_created',
        result: 'success',
      },
    });
    return project;
  }
  async list(user: User, limit = 30, cursor?: string) {
    const items = await this.db.project.findMany({
      where: user.role === 'professional' ? {} : { ownerId: user.id },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        clientName: true,
        status: true,
        agentStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const more = items.length > limit;
    if (more) items.pop();
    return { items, nextCursor: more ? items.at(-1)!.id : null };
  }
  async archive(id: string, user: User) {
    this.auth.professional(user);
    await this.db.project.update({ where: { id }, data: { status: 'archived' } });
    await this.db.auditEvent.create({
      data: { projectId: id, actorId: user.id, action: 'project_archived', result: 'success' },
    });
    return { archived: true };
  }
}
