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

export function verifyExportToken(raw: string): ExportClaim | null {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !secureEqual(sign(payload), signature)) return null;
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
      claim.exp < Date.now() ||
      (artifact !== 'document' && artifact !== 'quote')
    )
      return null;
    return {
      projectId: claim.projectId,
      version: claim.version as number,
      format: claim.format as ExportFormat,
      exp: claim.exp,
      artifact,
    };
  } catch {
    return null;
  }
}
