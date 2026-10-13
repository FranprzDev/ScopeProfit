import 'reflect-metadata';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email.service';
import { AuthService } from '../modules/auth/auth.service';
import { ApiKeysService } from '../modules/mcp/api-keys.service';

const usage = `Usage:
  mcp:keys create --telegram-id <id> [--label <label>]   Issue an API key (printed once)
  mcp:keys list                                          List keys (no secrets)
  mcp:keys revoke <key-id>                               Revoke a key and its OAuth grants
  mcp:keys set-ai-key --telegram-id <id>                 Store the owner's Gemini key from SCOPEPROFIT_AI_KEY

The Telegram id must be listed in TELEGRAM_AUTHORIZED_USER_IDS.`;

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const db = new PrismaService();
  const auth = new AuthService(db, new EmailService());
  const keys = new ApiKeysService(db, auth);
  try {
    if (command === 'create') {
      const telegramId = option(args, '--telegram-id');
      if (!telegramId) throw new Error(usage);
      const created = await keys.createForTelegramId(telegramId, option(args, '--label') ?? 'mcp');
      process.stdout.write(
        `API key ${created.id} (${created.label}) created. Store it now, it is not shown again:\n${created.key}\n`,
      );
    } else if (command === 'list') {
      for (const key of await keys.list())
        process.stdout.write(
          `${key.id}  ${key.prefix}…  ${key.label}  ${key.revokedAt ? 'revoked' : 'active'}  last used: ${key.lastUsedAt?.toISOString() ?? 'never'}\n`,
        );
    } else if (command === 'revoke' && args[0]) {
      const { revoked } = await keys.revoke(args[0]);
      process.stdout.write(revoked ? 'Revoked.\n' : 'No active key with that id.\n');
    } else if (command === 'set-ai-key') {
      const telegramId = option(args, '--telegram-id');
      const aiKey = process.env.SCOPEPROFIT_AI_KEY;
      if (!telegramId || !aiKey) throw new Error(usage);
      await auth.saveKey(await auth.telegramUser(telegramId), aiKey);
      process.stdout.write('AI key stored (encrypted).\n');
    } else {
      process.stdout.write(`${usage}\n`);
      process.exitCode = command ? 1 : 0;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
