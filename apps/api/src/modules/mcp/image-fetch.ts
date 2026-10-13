import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { fail } from '../../security';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const)
  blocked.addSubnet(network, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('INVALID_IMAGE_URL');
  }
  const allowHttp = process.env.MCP_ALLOW_HTTP_IMAGE_URLS === 'true';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))
    fail('INVALID_IMAGE_URL', 400, 'Image URLs must use https');
  if (url.username || url.password) fail('INVALID_IMAGE_URL');
  if (process.env.MCP_ALLOW_PRIVATE_IMAGE_URLS === 'true') return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => fail('INVALID_IMAGE_URL', 400, 'Unknown host'));
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address)))
    fail('INVALID_IMAGE_URL', 400, 'Image URL must resolve to a public address');
  return url;
}

/**
 * Downloads a client image for an MCP call. Only public http(s) hosts, at most 3 redirects,
 * 10 MB and JPEG/PNG/WebP content types. The bytes are validated again by StorageService.
 */
export async function fetchImage(raw: string) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'image/jpeg,image/png,image/webp' },
    }).catch(() => fail('IMAGE_FETCH_FAILED', 502));
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === 3) fail('IMAGE_FETCH_FAILED', 502, 'Too many redirects');
      url = await assertPublicUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body)
      fail('IMAGE_FETCH_FAILED', 502, `Image URL answered ${response.status}`);
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!EXTENSIONS[mimeType])
      fail('INVALID_IMAGE', 400, 'Only JPEG, PNG or WebP images are supported');
    if (Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES)
      fail('INVALID_IMAGE', 400, 'Image limit is 10 MB');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) fail('INVALID_IMAGE', 400, 'Image limit is 10 MB');
      chunks.push(Buffer.from(chunk));
    }
    const name =
      url.pathname
        .split('/')
        .pop()
        ?.replace(/\.[^.]*$/, '') || 'image';
    return {
      buffer: Buffer.concat(chunks),
      mimeType,
      originalname: `${name.slice(0, 80)}${EXTENSIONS[mimeType]}`,
    };
  }
  return fail('IMAGE_FETCH_FAILED', 502);
}
