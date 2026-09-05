import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { IsInt, IsObject, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../prisma.service';
import { ok, SESSION_COOKIE } from '../../response';

class SaveEditorDto { @IsInt() @Min(0) expectedVersion!: number; @IsObject() editorContent!: unknown; }

@Controller('projects/:id/documents')
export class DocumentsController {
  constructor(private auth: AuthService, private documents: DocumentsService, private db: PrismaService) {}
  private token(req: Request) { return (req.headers['x-project-token'] as string) || undefined; }
  private user(req: Request) { return this.auth.session(req.cookies?.[SESSION_COOKIE]); }

  @Post('generate') async generate(@Req() req: Request, @Param('id') id: string) {
    const user = await this.user(req);
    await this.auth.project(user, id, this.token(req));
    return ok(this.view(await this.documents.generate(id, user.id)));
  }

  @Get() async list(@Req() req: Request, @Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const user = await this.user(req);
    await this.auth.project(user, id, this.token(req));
    const document = await this.db.document.findUnique({ where: { projectId: id } });
    if (!document) return ok({ items: [], nextCursor: null });
    const n = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 30;
    const items = await this.db.documentVersion.findMany({ where: { documentId: document.id }, orderBy: { version: 'desc' }, take: n + 1, ...(cursor ? { cursor: { documentId_version: { documentId: document.id, version: Number(cursor) } }, skip: 1 } : {}) });
    const more = items.length > n; if (more) items.pop();
    return ok({ items: items.map((v) => this.view(v)), nextCursor: more ? String(items.at(-1)!.version) : null });
  }

  @Patch('current') async saveEditor(@Req() req: Request, @Param('id') id: string, @Body() body: SaveEditorDto) {
    const user = await this.user(req);
    await this.auth.project(user, id, this.token(req));
    return ok(this.view(await this.documents.generate(id, user.id, body.editorContent as any, body.expectedVersion)));
  }

  @Get(':version/:format') async download(@Req() req: Request, @Param('id') id: string, @Param('version') version: string, @Param('format') format: 'md' | 'pdf' | 'docx', @Res() res: Response) {
    const user = await this.user(req);
    await this.auth.project(user, id, this.token(req));
    const { buffer, name, mimeType } = await this.documents.download(id, Number(version), format);
    res.setHeader('content-type', mimeType);
    res.setHeader('content-disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  }

  private view(v: any) {
    return { id: v.id, version: v.version, briefVersion: v.briefVersion, status: v.status, editorContent: v.editorContent ?? null, createdAt: v.createdAt.toISOString(), formats: Object.keys(v.artifacts ?? {}) };
  }
}
