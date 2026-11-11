import { createHmac } from 'node:crypto';
import { encryptionKey, secureEqual } from '../../security';

export type ExportFormat = 'pdf' | 'docx' | 'md';
export type ExportArtifact = 'document' | 'quote';
export type ExportClaim = {
  projectId: string;
  version: number;
  format: ExportFormat;
  exp: number;
  artifact: ExportArtifact;
};

const sign = (payload: string) =>
  createHmac('sha256', encryptionKey()).update(`document-export:${payload}`).digest('base64url');

export const exportTtlMinutes = () => {
  const value = Number(process.env.MCP_EXPORT_URL_TTL_MINUTES ?? 60);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 7 * 24 * 60) : 60;
};

/** Public base URL where this API is reachable directly (no Next.js proxy). */
export const publicApiUrl = () =>
  (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT ?? 3001}`).replace(
    /\/+$/,
    '',
  );

/** Creates a short-lived, unauthenticated download link for one document or quote artifact. */
export function exportUrl(
  projectId: string,
  version: number,
  format: ExportFormat,
  artifact: ExportArtifact = 'document',
) {
  const exp = Date.now() + exportTtlMinutes() * 60_000;
  const claim: Record<string, unknown> = { projectId, version, format, exp };
  // Document links keep the exact legacy payload so existing signatures stay valid.
  if (artifact !== 'document') claim.artifact = artifact;
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  return {
    url: `${publicApiUrl()}/api/exports/${payload}.${sign(payload)}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

export type ExportTokenVerification =
  { status: 'ok'; claim: ExportClaim } | { status: 'expired' } | { status: 'invalid' };

/** Verifies a signed export token and says WHY it failed when it does. */
export function verifyExportTokenDetailed(raw: string): ExportTokenVerification {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !secureEqual(sign(payload), signature))
    return { status: 'invalid' };
  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const artifact = claim.artifact === undefined ? 'document' : claim.artifact;
    if (
      typeof claim.projectId !== 'string' ||
      !Number.isInteger(claim.version) ||
      !['pdf', 'docx', 'md'].includes(String(claim.format)) ||
      typeof claim.exp !== 'number' ||
      (artifact !== 'document' && artifact !== 'quote')
    )
      return { status: 'invalid' };
    if (claim.exp < Date.now()) return { status: 'expired' };
    return {
      status: 'ok',
      claim: {
        projectId: claim.projectId,
        version: claim.version as number,
        format: claim.format as ExportFormat,
        exp: claim.exp,
        artifact,
      },
    };
  } catch {
    return { status: 'invalid' };
  }
}

export function verifyExportToken(raw: string): ExportClaim | null {
  const result = verifyExportTokenDetailed(raw);
  return result.status === 'ok' ? result.claim : null;
}
