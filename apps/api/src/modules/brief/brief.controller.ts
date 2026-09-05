import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { IsInt, IsObject, Min } from 'class-validator';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../../prisma.service';
import { validateBrief } from './brief.validation';
import { ok, SESSION_COOKIE } from '../../response';
import { fail } from '../../security';

class UpdateBriefDto { @IsInt() @Min(0) expectedVersion!: number; @IsObject() data!: unknown; }

@Controller('projects/:id/brief')
export class BriefController {
  constructor(private auth: AuthService, private agent: AgentService, private db: PrismaService) {}
  private token(req: Request) { return (req.headers['x-project-token'] as string) || undefined; }
  private user(req: Request) { return this.auth.session(req.cookies?.[SESSION_COOKIE]); }

  @Get() async get(@Req() req: Request, @Param('id') id: string) {
    const user = await this.user(req);
    const project: any = await this.auth.project(user, id, this.token(req));
    if (!project.brief) fail('BRIEF_NOT_FOUND', 404);
    return ok({ version: project.brief.version, data: project.brief.data, updatedAt: project.brief.updatedAt.toISOString() });
  }

  @Patch() async update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateBriefDto) {
    const user = await this.user(req);
    const project = await this.auth.project(user, id, this.token(req));
    if (['approved', 'delivered', 'archived'].includes(project.status)) fail('PROJECT_LOCKED');
    const brief = validateBrief(body.data);
    const saved = await this.db.$transaction(async (tx) => {
      const updated = await tx.brief.updateMany({ where: { projectId: id, version: body.expectedVersion }, data: { version: { increment: 1 }, data: brief as unknown as Prisma.InputJsonValue } });
      if (!updated.count) fail('VERSION_CONFLICT');
      await tx.briefVersion.create({ data: { projectId: id, version: body.expectedVersion + 1, data: brief as unknown as Prisma.InputJsonValue, source: user.role, actorId: user.id } });
      return tx.brief.findUniqueOrThrow({ where: { projectId: id } });
    });
    await this.agent.enqueue(id);
    return ok({ version: saved.version, data: saved.data, updatedAt: saved.updatedAt.toISOString() });
  }
}
