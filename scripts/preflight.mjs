import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

if (process.argv.includes('--generate-secrets')) {
  process.stdout.write(
    `ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\nSESSION_SECRET=${randomBytes(48).toString('hex')}\n`,
  );
  process.exit(0);
}
if (existsSync('.env')) process.loadEnvFile('.env');
const mcpOnly = process.argv.includes('--mcp-only');
const required = [
  'POSTGRES_PASSWORD',
  'WEB_URL',
  'PUBLIC_API_URL',
  'ENCRYPTION_KEY',
  'SESSION_SECRET',
  ...(mcpOnly ? [] : ['AI_GATEWAY_API_KEY', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL']),
];
const errors = required
  .filter((key) => !process.env[key] || /replace-with|example\.com/.test(process.env[key]))
  .map((key) => `${key}: missing or placeholder`);
if (!/^https:\/\//.test(process.env.WEB_URL || ''))
  errors.push('WEB_URL: production requires HTTPS');
if (!/^https:\/\//.test(process.env.PUBLIC_API_URL || ''))
  errors.push('PUBLIC_API_URL: production requires HTTPS (MCP endpoint and OAuth issuer)');
try {
  const apiUrl = new URL(process.env.PUBLIC_API_URL || '');
  if (apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash || apiUrl.username || apiUrl.password)
    errors.push(
      'PUBLIC_API_URL: expected an origin without a path, query, fragment or credentials',
    );
} catch {
  errors.push('PUBLIC_API_URL: invalid URL');
}
if (
  /^(1|true)$/i.test(process.env.MCP_ALLOW_PRIVATE_IMAGE_URLS || '') ||
  /^(1|true)$/i.test(process.env.MCP_ALLOW_HTTP_IMAGE_URLS || '')
)
  errors.push('MCP_ALLOW_*_IMAGE_URLS: testing-only flags must be disabled in production');
if (Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64').length !== 32)
  errors.push('ENCRYPTION_KEY: expected 32 random bytes encoded as base64');
if ((process.env.SESSION_SECRET || '').length < 32)
  errors.push('SESSION_SECRET: expected at least 32 characters');
if (errors.length) {
  process.stderr.write(
    `Production configuration is incomplete:\n${errors.map((error) => `- ${error}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  mcpOnly
    ? 'Local MCP configuration passed. HTTPS, OAuth and a real ChatGPT connection still require live verification. AI analysis and email are not validated.\n'
    : 'Local production configuration passed. Provider credentials, verified sender, HTTPS and real delivery still require live verification.\n',
);
