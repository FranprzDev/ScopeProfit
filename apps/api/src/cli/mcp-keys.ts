import 'reflect-metadata';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email.service';
import { AuthService } from '../modules/auth/auth.service';
import { ApiKeysService } from '../modules/mcp/api-keys.service';

const usage = `Usage:
  mcp:keys create --email <email> [--label <label>] [--claim-legacy-telegram-id <id>]
                                                         Issue an API key (printed once)
  mcp:keys list                                          List keys (no secrets)
  mcp:keys revoke <key-id>                               Revoke a key and its OAuth grants
  mcp:keys set-ai-key --email <email>                       Store the owner's Gemini key from SCOPEPROFIT_AI_KEY

The email must be listed in PROFESSIONAL_EMAILS. --claim-legacy-telegram-id attaches
the email to an existing professional created before email authorization, keeping its projects.`;

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
      const email = option(args, '--email');
      if (!email) throw new Error(usage);
      const created = await keys.createForEmail(
        email,
        option(args, '--label') ?? 'mcp',
        option(args, '--claim-legacy-telegram-id'),
      );
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
      const email = option(args, '--email');
      const aiKey = process.env.SCOPEPROFIT_AI_KEY;
      if (!email || !aiKey) throw new Error(usage);
      await auth.saveKey(await auth.professionalUser(email), aiKey);
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
