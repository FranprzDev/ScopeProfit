import { createHmac } from 'node:crypto';
import type { Response } from 'express';
import { encryptionKey, secureEqual } from '../../security';

export type ConsentClaim = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  resource?: string;
  exp: number;
};

const sign = (payload: string) =>
  createHmac('sha256', encryptionKey()).update(`oauth-consent:${payload}`).digest('base64url');

/** Signs the validated authorization request so the consent form cannot be tampered with. */
export function signConsent(claim: ConsentClaim) {
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyConsent(raw: unknown): ConsentClaim | null {
  if (typeof raw !== 'string') return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !secureEqual(sign(payload), signature)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ConsentClaim;
    if (
      typeof claim.clientId !== 'string' ||
      typeof claim.redirectUri !== 'string' ||
      typeof claim.codeChallenge !== 'string' ||
      !Array.isArray(claim.scopes) ||
      typeof claim.exp !== 'number' ||
      claim.exp < Date.now()
    )
      return null;
    return claim;
  } catch {
    return null;
  }
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/** Self-contained consent page: the professional pastes a ScopeProfit API key to approve access. */
export function consentPage(
  res: Response,
  input: { clientName: string; payload: string; redirectUri: string; error?: string },
) {
  let redirectOrigin = '';
  try {
    redirectOrigin = new URL(input.redirectUri).origin;
  } catch {
    redirectOrigin = '';
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${redirectOrigin}; frame-ancestors 'none'; base-uri 'none'`,
  );
  res.status(input.error ? 401 : 200).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect ScopeProfit</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#111}
input,button{font:inherit;width:100%;padding:.6rem;margin-top:.5rem;box-sizing:border-box}
button{background:#111;color:#fff;border:0;border-radius:.4rem;cursor:pointer}.e{color:#b00020}</style></head>
<body><h1>Connect ScopeProfit</h1>
<p><strong>${escape(input.clientName)}</strong> wants to manage your ScopeProfit projects
(create projects, add client input, edit and approve scope documents).</p>
${input.error ? `<p class="e">${escape(input.error)}</p>` : ''}
<form method="post" action="/oauth/consent">
<input type="hidden" name="request" value="${escape(input.payload)}">
<label for="api_key">ScopeProfit API key</label>
<input id="api_key" name="api_key" type="password" autocomplete="off" required placeholder="sp_live_...">
<button type="submit">Allow access</button>
</form>
<p><small>Create a key with <code>pnpm --filter @scopeprofit/api run mcp:keys create</code>.
Revoking the key revokes this connection.</small></p>
</body></html>`);
}
