import { Injectable } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { ProjectsService } from '../projects/projects.service';
import { DocumentsService } from '../documents/documents.service';
import { AgentService } from '../agent/agent.service';
import { StorageService } from '../storage/storage.service';
import { markdown } from '../documents/render';
import { authorizedTelegramIds } from '../../security';

const short = (id: string) => id.replace(/-/g, '').slice(0, 12);

@Injectable()
export class TelegramService {
  readonly bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '1:placeholder');

  constructor(
    private db: PrismaService,
    private auth: AuthService,
    private projects: ProjectsService,
    private documents: DocumentsService,
    private agent: AgentService,
    private storage: StorageService,
  ) {
    this.register();
  }

  private authorized(id?: number) { return !!id && authorizedTelegramIds().includes(String(id)); }

  private async findProject(shortId: string) {
    const all = await this.db.project.findMany({ select: { id: true } });
    return all.find((p) => short(p.id) === shortId)?.id;
  }

  private projectLine(p: { status: string; agentStatus: string; name: string; brief: { data: any } | null }) {
    const pending = (p.brief?.data?.questions ?? []).filter((q: any) => q.blocksEstimate).length;
    const dot = p.status === 'approved' || p.status === 'delivered' ? '🟢' : pending > 0 ? '🟡' : '⚪️';
    return `${dot} ${p.name}${pending ? ` — ${pending} preguntas pendientes` : ''}`;
  }

  private detailKeyboard(id: string) {
    const s = short(id);
    return new InlineKeyboard()
      .text('📄 Ver borrador', `project:doc:${s}`).text('✏️ Editar doc', `project:edit:${s}`).row()
      .text('✅ Aprobar', `project:approve:${s}`).text('↩️ Rechazar', `project:reject:${s}`).row()
      .text('🔗 Gestionar link', `project:link:${s}`).text('🗃 Archivar', `project:archive:${s}`);
  }

  private async detailText(id: string) {
    const project = await this.db.project.findUniqueOrThrow({ where: { id }, include: { brief: true, document: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } } } });
    const doc = project.document?.versions[0];
    return `${this.projectLine(project as any)}\n\nEstado: ${project.status}\nTLDR: ${(project.brief?.data as any)?.summary || 'Sin resumen todavía'}${doc ? `\nDocumento v${doc.version} (${doc.status})` : ''}`;
  }

  private register() {
    const bot = this.bot;
    bot.use(async (ctx, next) => {
      const id = ctx.from?.id;
      if (!this.authorized(id)) { if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'No autorizado' }); return; }
      await this.auth.telegramUser(String(id));
      await next();
    });

    bot.command('help', (ctx) => ctx.reply('/createproject <nombre>\n/projects\n/tldr <id>\n/doc <id>\n/ask <id> <pregunta>\n/archive <id>\n/help\n\nAprobar y rechazar se hacen con los botones del detalle de cada proyecto.'));

    bot.command('createproject', async (ctx) => {
      const name = ctx.match?.toString().trim();
      if (!name) return void ctx.reply('Uso: /createproject <nombre>');
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      const project = await this.projects.create(user, name);
      await ctx.reply(`Proyecto creado: ${name}\n${project.clientUrl}`, { reply_markup: new InlineKeyboard().url('🔗 Abrir chat cliente', project.clientUrl) });
    });

    bot.command('projects', async (ctx) => {
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      const { items } = await this.projects.list(user, 50);
      if (!items.length) return void ctx.reply('Todavía no tenés proyectos. Usá /createproject <nombre>.');
      const full = await this.db.project.findMany({ where: { id: { in: items.map((p) => p.id) } }, include: { brief: true } });
      const keyboard = new InlineKeyboard();
      for (const p of full) keyboard.text(this.projectLine(p as any), `project:open:${short(p.id)}`).row();
      await ctx.reply('Tus proyectos:', { reply_markup: keyboard });
    });

    bot.command('tldr', async (ctx) => {
      const id = ctx.match?.toString().trim();
      const project = id && (await this.db.project.findUnique({ where: { id }, include: { brief: true } }));
      if (!project) return void ctx.reply('Uso: /tldr <id>');
      await ctx.reply((project.brief?.data as any)?.summary || 'Sin resumen todavía.');
    });

    bot.command('doc', async (ctx) => {
      const id = ctx.match?.toString().trim();
      if (!id) return void ctx.reply('Uso: /doc <id>');
      const latest = await this.documents.latest(id).catch(() => null);
      const project = await this.db.project.findUnique({ where: { id }, include: { brief: true } });
      if (!project?.brief) return void ctx.reply('Proyecto sin brief todavía.');
      const text = markdown({ projectName: project.name, clientName: project.clientEmail || 'Cliente', author: 'Profesional', date: new Date().toISOString(), version: latest?.version || 0, brief: project.brief.data as any, editorContent: (latest?.editorContent as any) ?? null });
      await ctx.reply(text.slice(0, 3900));
    });

    bot.command('ask', async (ctx) => {
      const [id, ...rest] = (ctx.match?.toString() || '').trim().split(' ');
      const question = rest.join(' ').trim();
      if (!id || !question) return void ctx.reply('Uso: /ask <id> <pregunta>');
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      await this.db.message.create({ data: { projectId: id, threadId: id, authorId: user.id, authorRole: 'professional', content: question } });
      await this.agent.enqueue(id);
      await ctx.reply('Pregunta enviada al chat del cliente.');
    });

    bot.command('archive', async (ctx) => {
      const id = ctx.match?.toString().trim();
      if (!id) return void ctx.reply('Uso: /archive <id>');
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      await this.projects.archive(id, user);
      await ctx.reply('Proyecto archivado.');
    });

    bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      const state = await this.db.telegramState.findUnique({ where: { userId: String(ctx.from!.id) } });
      if (!state || state.action !== 'awaiting_rejection_note' || !state.projectId || state.expiresAt < new Date()) return;
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      await this.db.$transaction([
        this.db.message.create({ data: { projectId: state.projectId, threadId: state.projectId, authorId: user.id, authorRole: 'professional', content: `Observación de revisión: ${ctx.message.text}` } }),
        this.db.project.updateMany({ where: { id: state.projectId }, data: { status: 'changes_requested' } }),
        this.db.telegramState.delete({ where: { userId: String(ctx.from!.id) } }),
      ]);
      await this.agent.enqueue(state.projectId);
      await ctx.reply('Observación registrada. El agente va a revisar el alcance completo.');
    });

    bot.on(['message:photo', 'message:document'], async (ctx) => {
      const state = await this.db.telegramState.findUnique({ where: { userId: String(ctx.from!.id) } });
      const projectId = state?.projectId;
      if (!projectId) return void ctx.reply('Indicá primero a qué proyecto pertenece este archivo con /ask <id> <texto>, o abrí el proyecto con /projects.');
      const fileId = ctx.message.photo ? ctx.message.photo.at(-1)!.file_id : ctx.message.document!.file_id;
      const name = ctx.message.document?.file_name || `${fileId}.jpg`;
      const mime = ctx.message.document?.mime_type || 'image/jpeg';
      const file = await ctx.api.getFile(fileId);
      const response = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const validated = await this.storage.validateImage({ buffer, mimetype: mime, originalname: name } as any).catch(() => null);
      if (!validated) return void ctx.reply('Solo se aceptan imágenes JPG, PNG o WebP de hasta 10 MB.');
      const written = await this.storage.write(`${projectId}/uploads/${randomUUID()}`, buffer);
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      const message = await this.db.message.create({ data: { projectId, threadId: projectId, authorId: user.id, authorRole: 'professional', content: '[imagen]' } });
      await this.db.file.create({ data: { projectId, messageId: message.id, name, mimeType: validated.mimeType, size: validated.size, path: written.path, checksum: written.checksum } });
      await this.agent.enqueue(projectId);
      await ctx.reply('Imagen guardada en el proyecto.');
    });

    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [, action, shortId, extra] = data.split(':');
      const id = await this.findProject(shortId);
      if (!id) { await ctx.answerCallbackQuery({ text: 'Proyecto no encontrado' }); return; }
      const user = await this.auth.telegramUser(String(ctx.from!.id));
      try {
        switch (action) {
          case 'open':
          case 'doc':
            await ctx.answerCallbackQuery();
            await ctx.reply(await this.detailText(id), { reply_markup: this.detailKeyboard(id) });
            return;
          case 'edit': {
            const url = await this.auth.adminLink(user, id);
            await ctx.answerCallbackQuery();
            await ctx.reply('Editar documento (enlace válido por 10 días):', { reply_markup: new InlineKeyboard().url('✏️ Abrir editor', url) });
            return;
          }
          case 'approve': {
            if (extra !== 'confirm') {
              await ctx.answerCallbackQuery();
              const project = await this.db.project.findUniqueOrThrow({ where: { id }, include: { document: true } });
              await ctx.reply(`¿Confirmás aprobar la versión ${project.document?.currentVersion ?? 0}? Esto entrega PDF y DOCX al cliente.`, { reply_markup: new InlineKeyboard().text('✅ Confirmar aprobación', `project:approve:${shortId}:confirm`).text('↩️ Cancelar', `project:open:${shortId}`) });
              return;
            }
            const project = await this.db.project.findUniqueOrThrow({ where: { id }, include: { document: true } });
            await this.documents.approve(id, user.id, project.document?.currentVersion ?? 0);
            await ctx.answerCallbackQuery({ text: 'Aprobado y entregado' });
            await ctx.reply('Proyecto aprobado. El cliente recibirá el PDF y el DOCX.');
            return;
          }
          case 'reject': {
            if (extra !== 'note') {
              await ctx.answerCallbackQuery();
              await ctx.reply('¿Qué querés hacer?', { reply_markup: new InlineKeyboard().text('Pedir cambios al agente', `project:reject:${shortId}:note`).text('Cancelar', `project:open:${shortId}`) });
              return;
            }
            await this.db.telegramState.upsert({ where: { userId: String(ctx.from!.id) }, create: { userId: String(ctx.from!.id), projectId: id, action: 'awaiting_rejection_note', expiresAt: new Date(Date.now() + 3600000) }, update: { projectId: id, action: 'awaiting_rejection_note', expiresAt: new Date(Date.now() + 3600000) } });
            await ctx.answerCallbackQuery();
            await ctx.reply('Escribí la observación para el agente en tu próximo mensaje.');
            return;
          }
          case 'link': {
            await ctx.answerCallbackQuery();
            await ctx.reply('Gestionar link del cliente:', { reply_markup: new InlineKeyboard().text('🔗 Regenerar link', `project:linkdo:${shortId}:regenerate`).text('🚫 Revocar acceso', `project:linkdo:${shortId}:revoke`).row().text('↩️ Cancelar', `project:open:${shortId}`) });
            return;
          }
          case 'linkdo': {
            const result = await this.projects.link(id, user, extra as 'regenerate' | 'revoke');
            await ctx.answerCallbackQuery({ text: 'Listo' });
            await ctx.reply(result.clientUrl ? `Nuevo link: ${result.clientUrl}` : 'Acceso revocado.');
            return;
          }
          case 'archive': {
            if (extra !== 'confirm') {
              await ctx.answerCallbackQuery();
              await ctx.reply('¿Confirmás archivar el proyecto?', { reply_markup: new InlineKeyboard().text('🗃 Confirmar', `project:archive:${shortId}:confirm`).text('↩️ Cancelar', `project:open:${shortId}`) });
              return;
            }
            await this.projects.archive(id, user);
            await ctx.answerCallbackQuery({ text: 'Archivado' });
            await ctx.reply('Proyecto archivado.');
            return;
          }
          default:
            await ctx.answerCallbackQuery();
        }
      } catch {
        await ctx.answerCallbackQuery({ text: 'No se pudo completar la acción' });
      }
    });
  }

  async handleUpdate(update: unknown) { await this.bot.handleUpdate(update as any); }
}
