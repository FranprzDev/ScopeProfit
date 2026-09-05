import { BadRequestException, Controller, Get, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Body } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AgentService } from '../agent/agent.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../prisma.service';
import { ok, SESSION_COOKIE } from '../../response';
import { fail } from '../../security';

class MessageDto { @IsString() @MaxLength(1_000_000) content!: string; }

@Controller('projects/:id')
export class ChatController {
  constructor(private auth: AuthService, private agent: AgentService, private storage: StorageService, private db: PrismaService) {}
  private token(req: Request) { return (req.headers['x-project-token'] as string) || undefined; }
  private user(req: Request) { return this.auth.session(req.cookies?.[SESSION_COOKIE]); }

  @Post('messages') async send(@Req() req: Request, @Param('id') id: string, @Body() body: MessageDto) {
    const user = await this.user(req);
    const project = await this.auth.project(user, id, this.token(req));
    if (['approved', 'delivered', 'archived'].includes(project.status)) fail('PROJECT_LOCKED');
    if (!body.content.trim() || Buffer.byteLength(body.content, 'utf8') > 1024 * 1024) fail('INVALID_TEXT');
    const message = await this.db.message.create({ data: { projectId: id, threadId: id, authorId: user.id, authorRole: user.role, content: body.content } });
    await this.agent.enqueue(id);
    return ok(this.view(message));
  }

  @Get('messages') async list(@Req() req: Request, @Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const user = await this.user(req);
    await this.auth.project(user, id, this.token(req));
    const n = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 30;
    const items = await this.db.message.findMany({ where: { projectId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: n + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { files: true } });
    const more = items.length > n; if (more) items.pop();
    return ok({ items: items.map((m) => this.view(m)), nextCursor: more ? items.at(-1)!.id : null });
  }

  @Post('files') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@Req() req: Request, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    const user = await this.user(req);
    const project = await this.auth.project(user, id, this.token(req));
    if (['approved', 'delivered', 'archived'].includes(project.status)) fail('PROJECT_LOCKED');
    if (!file) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Image file is required' });
    const { mimeType, size } = await this.storage.validateImage(file);
    const path = `${id}/uploads/${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    const written = await this.storage.write(path, file.buffer);
    const message = await this.db.message.create({ data: { projectId: id, threadId: id, authorId: user.id, authorRole: user.role, content: '[imagen]' } });
    const saved = await this.db.file.create({ data: { projectId: id, messageId: message.id, name: file.originalname, mimeType, size, path: written.path, checksum: written.checksum } });
    await this.agent.enqueue(id);
    return ok({ ...this.view(message), files: [{ id: saved.id, name: saved.name, mimeType: saved.mimeType, size: saved.size }] });
  }

  private view(m: any) {
    return { id: m.id, projectId: m.projectId, authorRole: m.authorRole, content: m.content, createdAt: m.createdAt.toISOString(), files: (m.files ?? []).map((f: any) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })) };
  }
}
