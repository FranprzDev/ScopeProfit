/**
 * Worker port of apps/api/src/modules/mcp/image-fetch.ts. Keeps the contract (https-only,
 * public hosts, 10 MB cap) using fetch. DNS-level SSRF checks rely on the Workers runtime,
 * which cannot reach private or loopback addresses from the edge.
 */
import { fail } from '../../../api/src/security';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function isPrivateIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (bare === 'localhost' || bare.endsWith('.localhost') || bare.endsWith('.internal'))
    return true;
  if (bare === '::1' || bare.startsWith('fe80:') || bare.startsWith('fc') || bare.startsWith('fd'))
    return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return false;
}

export async function fetchImage(
  raw: string,
): Promise<{ buffer: Buffer; mimeType: string; originalname: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('INVALID_IMAGE_URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) fail('INVALID_IMAGE_URL');
  if (isPrivateIpLiteral(url.hostname))
    fail('INVALID_IMAGE_URL', 400, 'Image URL must resolve to a public address');

  const response = await fetch(url.href, {
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
    headers: { accept: 'image/jpeg,image/png,image/webp' },
  }).catch(() => fail('IMAGE_FETCH_FAILED', 502));
  if (!response.ok) fail('IMAGE_FETCH_FAILED', 502);
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const extension = EXTENSIONS[mime];
  if (!extension) fail('INVALID_IMAGE', 400, 'URL did not return a JPEG, PNG or WebP image');
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) fail('IMAGE_TOO_LARGE', 413, 'Image limit is 10 MB');

  const reader = response.body?.getReader();
  if (!reader) fail('IMAGE_FETCH_FAILED', 502);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      fail('IMAGE_TOO_LARGE', 413, 'Image limit is 10 MB');
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (mime === 'image/webp' && buffer.toString('ascii', 8, 12) !== 'WEBP')
    fail('INVALID_IMAGE', 400, 'URL did not return a JPEG, PNG or WebP image');
  const base = (url.pathname.split('/').pop() || 'image').replace(/\.[^.]*$/, '').slice(0, 80);
  return { buffer, mimeType: mime, originalname: `${base}${extension}` };
}
