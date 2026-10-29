process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const ownerEmail = `mcp-e2e-${Date.now()}@scopeprofit.test`;
process.env.WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { ApiErrorHandler } from '../src/api-error-handler';
import { AuthService } from '../src/modules/auth/auth.service';
import { ApiKeysService } from '../src/modules/mcp/api-keys.service';
import { mountMcp } from '../src/modules/mcp/mcp-http';

const skip = !process.env.DATABASE_URL;
const dbOnly = { skip: skip ? 'DATABASE_URL not set' : false };
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
let app: INestApplication;
let baseUrl: string;
let apiKey: string;
let apiKeyId: string;

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

async function connect(bearer: string) {
  const client = new Client({ name: 'mcp-e2e', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${bearer}` } },
    }),
  );
  return client;
}

before(async () => {
  if (skip) return;
  const port = await freePort();
  baseUrl = `http://localhost:${port}`;
  process.env.PUBLIC_API_URL = baseUrl;
  app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorHandler());
  mountMcp(app);
  await app.listen(port, '127.0.0.1');
  const owner = await app.get(AuthService).professionalUser(ownerEmail);
  const created = await app.get(ApiKeysService).create(owner, 'e2e');
  apiKey = created.key;
  apiKeyId = created.id;
});

after(async () => {
  if (!skip) await app.close();
});

test(
  'the MCP endpoint rejects anonymous calls and points clients at OAuth metadata',
  dbOnly,
  async () => {
    const response = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(response.status, 401);
    assert.match(
      response.headers.get('www-authenticate') ?? '',
      /resource_metadata=".*\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
    );
    const resource = await (
      await fetch(`${baseUrl}/.well-known/oauth-protected-resource/api/mcp`)
    ).json();
    assert.equal(resource.resource, `${baseUrl}/api/mcp`);
    const metadata = await (
      await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)
    ).json();
    assert.equal(metadata.registration_endpoint, `${baseUrl}/register`);
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
    assert.equal((await fetch(`${baseUrl}/api/mcp`)).status, 401);
    const sse = await fetch(`${baseUrl}/api/mcp`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    assert.equal(sse.status, 405);
  },
);

test('an API key bearer token drives the tools over Streamable HTTP', dbOnly, async () => {
  const client = await connect(apiKey);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 16);
    const created = await client.callTool({
      name: 'create_project',
      arguments: { name: 'Remote MCP project' },
    });
    assert.ok(!created.isError);
    const projectId = (created.structuredContent as { projectId: string }).projectId;
    const tldr = await client.callTool({ name: 'get_tldr', arguments: { project_id: projectId } });
    assert.equal((tldr.structuredContent as { status: string }).status, 'draft');
    const exported = await client.callTool({
      name: 'export_document',
      arguments: { project_id: projectId, format: 'docx' },
    });
    const { url } = exported.structuredContent as { url: string };
    const download = await fetch(url);
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-type') ?? '', /wordprocessingml/);
    assert.equal((await fetch(`${url}x`)).status, 404);
  } finally {
    await client.close();
  }
  await assert.rejects(connect('sp_live_wrong'));
});

test(
  'ChatGPT-style OAuth: dynamic registration, consent with an API key, PKCE token exchange and refresh',
  dbOnly,
  async () => {
    const registered = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'ChatGPT',
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    });
    assert.equal(registered.status, 201);
    const { client_id: clientId } = await registered.json();

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorize = new URL(`${baseUrl}/authorize`);
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'state-123',
      scope: 'scope',
      resource: `${baseUrl}/api/mcp`,
    }))
      authorize.searchParams.set(key, value);
    const page = await fetch(authorize, { redirect: 'manual' });
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get('content-security-policy') ?? '',
      /form-action 'self' https:\/\/chatgpt\.com/,
    );
    const html = await page.text();
    const request = /name="request" value="([^"]+)"/.exec(html)![1];

    const denied = await fetch(`${baseUrl}/oauth/consent`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ request, api_key: 'sp_live_nope' }),
    });
    assert.equal(denied.status, 401);

    const granted = await fetch(`${baseUrl}/oauth/consent`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ request, api_key: apiKey }),
    });
    assert.equal(granted.status, 302);
    const location = new URL(granted.headers.get('location')!);
    assert.equal(`${location.origin}${location.pathname}`, REDIRECT);
    assert.equal(location.searchParams.get('state'), 'state-123');
    const code = location.searchParams.get('code')!;

    const token = (body: Record<string, string>) =>
      fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, ...body }),
      });
    const badVerifier = await token({
      grant_type: 'authorization_code',
      code,
      code_verifier: randomBytes(32).toString('base64url'),
      redirect_uri: REDIRECT,
    });
    assert.equal(badVerifier.status, 400);
    const exchanged = await token({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
    });
    assert.equal(exchanged.status, 200);
    const tokens = await exchanged.json();
    assert.match(tokens.access_token, /^sp_at_/);
    const replay = await token({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
    });
    assert.equal(replay.status, 400);

    const client = await connect(tokens.access_token);
    const listed = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.ok(!listed.isError);
    await client.close();

    const refreshed = await token({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    });
    assert.equal(refreshed.status, 200);
    const rotated = await refreshed.json();
    assert.notEqual(rotated.access_token, tokens.access_token);
    const reused = await token({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    });
    assert.equal(reused.status, 400);
    const replayDescendant = await token({
      grant_type: 'refresh_token',
      refresh_token: rotated.refresh_token,
    });
    assert.equal(replayDescendant.status, 400, 'Refresh replay must revoke its active grant');

    await app.get(ApiKeysService).revoke(apiKeyId);
    await assert.rejects(connect(rotated.access_token));
  },
);

test('the stdio entrypoint serves the same tools for local MCP clients', dbOnly, async () => {
  const owner = await app.get(AuthService).professionalUser(ownerEmail);
  const { key, id } = await app.get(ApiKeysService).create(owner, 'stdio');
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => !!entry[1]),
  );
  const client = new Client({ name: 'mcp-stdio-e2e', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(__dirname, '../src/mcp-stdio.js')],
      env: { ...env, SCOPEPROFIT_API_KEY: key },
      stderr: 'ignore',
    }),
  );
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 16);
    const listed = await client.callTool({ name: 'list_projects', arguments: { limit: 1 } });
    assert.ok(!listed.isError);
    await app.get(ApiKeysService).revoke(id);
    const revoked = await client.callTool({ name: 'list_projects', arguments: { limit: 1 } });
    assert.equal(revoked.isError, true);
    assert.match(JSON.stringify(revoked.content), /INVALID_API_KEY/);
  } finally {
    await client.close();
  }
});

test('native OAuth clients can authorize an ephemeral loopback port', dbOnly, async () => {
  const owner = await app.get(AuthService).professionalUser(ownerEmail);
  const { key } = await app.get(ApiKeysService).create(owner, 'native-loopback');
  const registered = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Synthetic desktop MCP client',
      redirect_uris: ['http://127.0.0.1/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(registered.status, 201);
  const { client_id: clientId } = await registered.json();
  const redirect = 'http://127.0.0.1:43127/callback';
  const verifier = randomBytes(32).toString('base64url');
  const authorize = new URL(`${baseUrl}/authorize`);
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'scope',
    resource: `${baseUrl}/api/mcp`,
  }))
    authorize.searchParams.set(key, value);
  const page = await fetch(authorize, { redirect: 'manual' });
  assert.equal(page.status, 200);
  const request = /name="request" value="([^"]+)"/.exec(await page.text())![1];
  const consent = await fetch(`${baseUrl}/oauth/consent`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request, api_key: key }),
  });
  assert.equal(consent.status, 302, await consent.text());
  const target = new URL(consent.headers.get('location')!);
  assert.equal(target.origin + target.pathname, redirect);
  const exchanged = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: target.searchParams.get('code')!,
      code_verifier: verifier,
      redirect_uri: redirect,
    }),
  });
  assert.equal(exchanged.status, 200, await exchanged.text());
});

test('OAuth defaults omitted scope and rejects unsupported permissions', dbOnly, async () => {
  const owner = await app.get(AuthService).professionalUser(ownerEmail);
  const { key } = await app.get(ApiKeysService).create(owner, 'default-scope');
  const registered = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Synthetic generic OAuth client',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
    }),
  });
  const { client_id: clientId } = await registered.json();
  const verifier = randomBytes(32).toString('base64url');
  const authorize = new URL(`${baseUrl}/authorize`);
  for (const [name, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${baseUrl}/api/mcp`,
  }))
    authorize.searchParams.set(name, value);
  const page = await fetch(authorize, { redirect: 'manual' });
  assert.equal(page.status, 200);
  const request = /name="request" value="([^"]+)"/.exec(await page.text())![1];
  const granted = await fetch(`${baseUrl}/oauth/consent`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request, api_key: key }),
  });
  assert.equal(granted.status, 302);
  const code = new URL(granted.headers.get('location')!).searchParams.get('code')!;
  const exchanged = await fetch(`${baseUrl}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
    }),
  });
  assert.equal(exchanged.status, 200);
  const tokens = await exchanged.json();
  assert.equal(tokens.scope, 'scope');
  const client = await connect(tokens.access_token);
  await client.close();
  authorize.searchParams.set('scope', 'administrator');
  const unsupported = await fetch(authorize, { redirect: 'manual' });
  assert.equal(unsupported.status, 302);
  assert.equal(
    new URL(unsupported.headers.get('location')!).searchParams.get('error'),
    'invalid_scope',
  );
});
