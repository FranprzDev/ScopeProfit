import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from './projects.service';
import { DocumentsService } from '../documents/documents.service';
import { ok, SESSION_COOKIE } from '../../response';
import { fail } from '../../security';

class CreateProjectDto { @IsString() @MaxLength(200) name!: string; @IsOptional() @IsEmail() clientEmail?: string; }
class LinkActionDto { @IsIn(['regenerate', 'revoke', 'expire']) action!: 'regenerate' | 'revoke' | 'expire'; @IsOptional() @IsISO8601() expiresAt?: string; }
class ApproveDto { @IsInt() @Min(0) version!: number; }

@Controller('projects')
export class ProjectsController {
  constructor(private auth: AuthService, private projects: ProjectsService, private documents: DocumentsService) {}
  private token(req: Request) { return (req.headers['x-project-token'] as string) || undefined; }
  private user(req: Request) { return this.auth.session(req.cookies?.[SESSION_COOKIE]); }

  @Post() async create(@Req() req: Request, @Body() body: CreateProjectDto) {
    const user = await this.user(req);
    return ok(await this.projects.create(user, body.name, body.clientEmail));
  }

  @Get() async list(@Req() req: Request, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const user = await this.user(req);
    return ok(await this.projects.list(user, limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 30, cursor));
  }

  @Get(':id') async get(@Req() req: Request, @Param('id') id: string) {
    const user = await this.user(req);
    const project = await this.auth.project(user, id, this.token(req));
    return ok(await this.view(project));
  }

  @Get(':id/state') async state(@Req() req: Request, @Param('id') id: string) {
    const user = await this.user(req);
    const project: any = await this.auth.project(user, id, this.token(req));
    const brief = project.brief;
    const document = project.document?.versions?.[0];
    const pendingQuestions = (brief?.data?.questions ?? []).filter((q: any) => q.blocksEstimate);
    return ok({ briefVersion: brief?.version ?? 0, documentVersion: document?.version ?? 0, agentStatus: project.agentStatus, pendingQuestions, updatedAt: project.updatedAt.toISOString(), status: project.status });
  }

  @Post(':id/archive') async archive(@Req() req: Request, @Param('id') id: string) {
    const user = await this.user(req);
    return ok(await this.projects.archive(id, user));
  }

  @Patch(':id/link') async link(@Req() req: Request, @Param('id') id: string, @Body() body: LinkActionDto) {
    const user = await this.user(req);
    if (body.action === 'expire' && !body.expiresAt) fail('INVALID_EXPIRATION');
    return ok(await this.projects.link(id, user, body.action, body.expiresAt ? new Date(body.expiresAt) : undefined));
  }

  @Post(':id/approve') async approve(@Req() req: Request, @Param('id') id: string, @Body() body: ApproveDto) {
    const user = await this.user(req);
    this.auth.professional(user);
    return ok(await this.documents.approve(id, user.id, body.version));
  }

  private async view(project: any) {
    const document = project.document?.versions?.[0];
    return {
      id: project.id, name: project.name, clientEmail: project.clientEmail, status: project.status, agentStatus: project.agentStatus,
      createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(),
      clientUrl: await this.projects.clientUrl(project.id),
      brief: project.brief ? { version: project.brief.version, data: project.brief.data, updatedAt: project.brief.updatedAt.toISOString() } : undefined,
      document: document ? { id: document.id, version: document.version, briefVersion: document.briefVersion, status: document.status, editorContent: document.editorContent ?? null, createdAt: document.createdAt.toISOString(), formats: Object.keys(document.artifacts ?? {}) } : null,
    };
  }
}
