import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { HttpException } from '@nestjs/common';
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

interface ValidatedUrl {
  url: URL;
  address?: { address: string; family: number };
}

async function assertPublicUrl(raw: string): Promise<ValidatedUrl> {
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
  if (process.env.MCP_ALLOW_PRIVATE_IMAGE_URLS === 'true') return { url };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true }).catch(() => fail('INVALID_IMAGE_URL', 400, 'Unknown host'));
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address)))
    fail('INVALID_IMAGE_URL', 400, 'Image URL must resolve to a public address');
  return { url, address: addresses[0] };
}

function send({ url, address }: ValidatedUrl): Promise<IncomingMessage> {
  const open = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = open(
      url,
      {
        method: 'GET',
        timeout: 15_000,
        headers: { accept: 'image/jpeg,image/png,image/webp' },
        lookup: address
          ? (_host, options, callback) => {
              if (options.all) callback(null, [address] as never, undefined as never);
              else callback(null, address.address, address.family);
            }
          : undefined,
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Downloads a client image for an MCP call. Only public http(s) hosts, at most 3 redirects,
 * 10 MB and JPEG/PNG/WebP content types. The bytes are validated again by StorageService.
 */
export async function fetchImage(raw: string) {
  let target = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const response = await send(target).catch(() => fail('IMAGE_FETCH_FAILED', 502));
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      response.resume();
      const location = response.headers.location;
      if (!location || hop === 3) fail('IMAGE_FETCH_FAILED', 502, 'Too many redirects');
      target = await assertPublicUrl(new URL(location, target.url).href);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      fail('IMAGE_FETCH_FAILED', 502, `Image URL answered ${status}`);
    }
    const mimeType = (response.headers['content-type'] ?? '').split(';')[0].trim();
    if (!EXTENSIONS[mimeType]) {
      response.destroy();
      fail('INVALID_IMAGE', 400, 'Only JPEG, PNG or WebP images are supported');
    }
    if (Number(response.headers['content-length'] ?? 0) > MAX_IMAGE_BYTES) {
      response.destroy();
      fail('INVALID_IMAGE', 400, 'Image limit is 10 MB');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of response) {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) fail('INVALID_IMAGE', 400, 'Image limit is 10 MB');
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      response.destroy();
      if (error instanceof HttpException) throw error;
      fail('IMAGE_FETCH_FAILED', 502);
    }
    const name =
      target.url.pathname
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
