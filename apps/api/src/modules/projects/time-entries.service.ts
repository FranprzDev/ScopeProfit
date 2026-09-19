import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';

@Injectable()
export class TimeEntriesService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  async list(projectId: string, user: any) {
    await this.auth.project(user, projectId);
    return this.db.timeEntry.findMany({ where: { projectId }, orderBy: { startedAt: 'desc' } });
  }

  async start(projectId: string, description: string, user: any, changeRequestId?: string) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    const active = await this.db.timeEntry.findFirst({
      where: { projectId, actorId: user.id, endedAt: null },
    });
    if (active) fail('TIME_ENTRY_ALREADY_RUNNING', 409);
    return this.db.timeEntry.create({
      data: {
        projectId,
        actorId: user.id,
        description: description.trim(),
        changeRequestId,
        startedAt: new Date(),
      },
    });
  }

  async stop(projectId: string, id: string, user: any) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    const entry = await this.db.timeEntry.findFirst({
      where: { id, projectId, actorId: user.id, endedAt: null },
    });
    if (!entry) fail('TIME_ENTRY_NOT_FOUND', 404);
    const endedAt = new Date();
    return this.db.timeEntry.update({
      where: { id },
      data: {
        endedAt,
        durationMinutes: Math.max(
          1,
          Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 60000),
        ),
      },
    });
  }
}
