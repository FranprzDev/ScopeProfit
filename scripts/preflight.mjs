import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

if (process.argv.includes('--generate-secrets')) {
  process.stdout.write(`ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nTELEGRAM_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}\n`);
  process.exit(0);
}
if (existsSync('.env')) process.loadEnvFile('.env');
const required = ['POSTGRES_PASSWORD', 'WEB_URL', 'ENCRYPTION_KEY', 'SESSION_SECRET', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_AUTHORIZED_USER_IDS'];
const errors = required.filter(key => !process.env[key] || /replace-with|example\.com/.test(process.env[key])).map(key => `${key}: missing or placeholder`);
if (!/^https:\/\//.test(process.env.WEB_URL || '')) errors.push('WEB_URL: production requires HTTPS');
if (Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64').length !== 32) errors.push('ENCRYPTION_KEY: expected 32 random bytes encoded as base64');
if ((process.env.SESSION_SECRET || '').length < 32) errors.push('SESSION_SECRET: expected at least 32 characters');
if (!/^\d+(,\d+)*$/.test(process.env.TELEGRAM_AUTHORIZED_USER_IDS || '')) errors.push('TELEGRAM_AUTHORIZED_USER_IDS: expected comma-separated numeric IDs');
if (errors.length) {
  process.stderr.write(`Production configuration is incomplete:\n${errors.map(error => `- ${error}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('Local production configuration passed. Provider credentials, verified sender, HTTPS and real delivery still require live verification.\n');
