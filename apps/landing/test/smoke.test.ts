import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/**
 * Smoke test against the production build (`next build` must run first; the `test` script does).
 * It asserts structure and presence only, never exact copy, so SEO and copy edits stay free.
 */

enum Route {
  Home = '/',
  Sitemap = '/sitemap.xml',
  Missing = '/this-page-does-not-exist',
}

enum MetaAttribute {
  Name = 'name',
  Property = 'property',
}

const APP_DIR = process.cwd();
const NEXT_BIN = join(APP_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const KEY_SECTIONS = ['como-funciona', 'herramientas', 'conectar'];
const OPEN_GRAPH_KEYS = ['og:title', 'og:description', 'og:url', 'og:type', 'og:image'];
const STARTUP_TIMEOUT_MS = 60000;

let server: ChildProcess | undefined;
let baseUrl = '';
let homeHtml = '';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is not listening yet.
    }
    await sleep(250);
  }
  throw new Error(`Landing did not start at ${url} within ${STARTUP_TIMEOUT_MS} ms`);
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function metaContent(html: string, attribute: MetaAttribute, key: string): string | undefined {
  const keyPattern = new RegExp(`\\s${attribute}="${escapeRegExp(key)}"`);
  for (const tag of html.match(/<meta\s[^>]*>/g) ?? []) {
    if (keyPattern.test(tag)) return /\scontent="([^"]*)"/.exec(tag)?.[1];
  }
  return undefined;
}

/** Collects every `@type` in a JSON-LD value, including nodes nested in `@graph` or arrays. */
function jsonLdTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdTypes);
  if (!value || typeof value !== 'object') return [];
  const types: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === '@type')
      types.push(...(Array.isArray(child) ? child.map(String) : [String(child)]));
    else if (typeof child === 'object') types.push(...jsonLdTypes(child));
  }
  return types;
}

before(async () => {
  assert.ok(
    existsSync(join(APP_DIR, '.next', 'BUILD_ID')),
    'No production build found: run `pnpm --filter @scopeprofit/landing run build` first.',
  );
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: APP_DIR,
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore',
  });
  await waitForServer(baseUrl + Route.Home);
  homeHtml = await (await fetch(baseUrl + Route.Home)).text();
});

after(() => {
  server?.kill();
});

describe('landing smoke', () => {
  test('home responds with HTML and security headers', async () => {
    const response = await fetch(baseUrl + Route.Home);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy'));
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  test('home declares language, title and description', () => {
    assert.match(homeHtml, /<html[^>]*\slang="es/);
    const title = /<title>([^<]+)<\/title>/.exec(homeHtml)?.[1] ?? '';
    assert.match(title, /ScopeProfit/);
    assert.ok((metaContent(homeHtml, MetaAttribute.Name, 'description') ?? '').length > 50);
  });

  test('home exposes Open Graph, Twitter and canonical metadata', () => {
    for (const key of OPEN_GRAPH_KEYS) {
      assert.ok(metaContent(homeHtml, MetaAttribute.Property, key), `missing ${key}`);
    }
    assert.ok(metaContent(homeHtml, MetaAttribute.Name, 'twitter:card'), 'missing twitter:card');
    assert.match(homeHtml, /<link\s[^>]*rel="canonical"[^>]*href="https?:\/\/[^"]+"/);
  });

  test('home ships valid JSON-LD describing the application', () => {
    const blocks = [
      ...homeHtml.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
    ];
    assert.ok(blocks.length > 0, 'no JSON-LD block');
    const types: string[] = [];
    for (const [, json] of blocks) types.push(...jsonLdTypes(JSON.parse(json)));
    assert.ok(types.includes('SoftwareApplication'), `JSON-LD types: ${types.join(', ')}`);
  });

  test('home renders the hero and key sections', () => {
    assert.match(homeHtml, /<h1[\s>]/);
    for (const id of KEY_SECTIONS) {
      assert.match(homeHtml, new RegExp(`id="${id}"`), `missing #${id}`);
    }
  });

  test('every in-page anchor points at an element that exists', () => {
    const targets = new Set([...homeHtml.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id));
    assert.ok(targets.size > 0);
    for (const id of targets) {
      assert.match(homeHtml, new RegExp(`id="${escapeRegExp(id)}"`), `broken anchor #${id}`);
    }
  });

  test('referenced local images are served', async () => {
    const images = new Set(
      [...homeHtml.matchAll(/src="(\/images\/[^"]+)"/g)].map(([, src]) => src),
    );
    for (const src of images) {
      const response = await fetch(baseUrl + src);
      assert.equal(response.status, 200, `${src} returned ${response.status}`);
    }
  });

  test('sitemap lists the site root', async () => {
    const response = await fetch(baseUrl + Route.Sitemap);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<loc>https?:\/\/[^<]+<\/loc>/);
  });

  test('unknown routes return the 404 page with a way home', async () => {
    const response = await fetch(baseUrl + Route.Missing);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /href="\/"/);
  });
});
