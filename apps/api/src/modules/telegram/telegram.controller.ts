import { Controller, Headers, HttpCode, Post, Body } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TelegramService } from './telegram.service';
import { secureEqual, fail } from '../../security';
import { ok } from '../../response';

@Controller('telegram')
export class TelegramController {
  constructor(private telegram: TelegramService, private db: PrismaService) {}

  @Post('webhook') @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string, @Body() update: any) {
    if (!secret || !secureEqual(secret, process.env.TELEGRAM_WEBHOOK_SECRET || '')) fail('FORBIDDEN', 403);
    const updateId = String(update?.update_id ?? '');
    if (!updateId) fail('INVALID_UPDATE');
    const claimed = await this.db.telegramUpdate.createMany({ data: [{ id: updateId, status: 'processing' }] }).catch(() => ({ count: 0 }));
    if (!claimed.count) return ok({ received: true });
    await this.telegram.handleUpdate(update);
    await this.db.telegramUpdate.update({ where: { id: updateId }, data: { status: 'processed' } }).catch(() => undefined);
    return ok({ received: true });
  }
}
