import { createHash, randomBytes } from 'node:crypto';
import type { Browser } from '@e2e-dev/web';
import { authorizedTelegramId, appBaseUrl } from './env';
import { query } from './db';

export const PROFESSIONAL_EMAIL = 'e2e-professional@scope.test';
export const CLIENT_EMAIL = 'e2e-client@scope.test';
export const TEST_EMAILS = [PROFESSIONAL_EMAIL, CLIENT_EMAIL];

async function ensureUser(email: string, role: 'professional' | 'client'): Promise<void> {
  const telegramId = role === 'professional' ? authorizedTelegramId() : null;
  if (telegramId)
    await query(
      'UPDATE users SET telegram_id = NULL WHERE telegram_id = $1 AND email IS DISTINCT FROM $2',
      [telegramId, email],
    );
  await query(
    `INSERT INTO users (id, email, role, telegram_id, created_at)
     VALUES (gen_random_uuid(), $1, $2::"Role", $3, now())
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, telegram_id = EXCLUDED.telegram_id`,
    [email, role, telegramId],
  );
}

export async function signIn(
  browser: Browser,
  email: string,
  role: 'professional' | 'client',
): Promise<string> {
  await ensureUser(email, role);
  const raw = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO magic_links (id, token_hash, email, expires_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, now() + interval '15 minutes', now())`,
    [createHash('sha256').update(raw).digest('hex'), email],
  );
  const response = await fetch(
    `${appBaseUrl()}/api/auth/magic-link/verify?token=${encodeURIComponent(raw)}`,
    { redirect: 'manual' },
  );
  const setCookie = response.headers.get('set-cookie') ?? '';
  const value = /sp_session=([^;]+)/.exec(setCookie)?.[1];
  if (response.status !== 302 || !value)
    throw new Error(
      `magic-link verify falló (${response.status}): location=${response.headers.get('location') ?? '-'} ${setCookie.slice(0, 160) || 'sin set-cookie'}`,
    );
  const session = decodeURIComponent(value);
  await browser.setCookies([
    {
      name: 'sp_session',
      value: session,
      url: appBaseUrl(),
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return session;
}
