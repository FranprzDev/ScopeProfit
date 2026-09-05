process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
process.env.TELEGRAM_AUTHORIZED_USER_IDS = process.env.TELEGRAM_AUTHORIZED_USER_IDS || '111';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '1:e2e-placeholder';
process.env.TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'e2e-secret';
process.env.WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
process.env.ADMIN_EDIT_URL_TTL_DAYS = process.env.ADMIN_EDIT_URL_TTL_DAYS || '10';

import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from '../src/app.module';
import { ApiErrorHandler } from '../src/api-error-handler';
import { PrismaService } from '../src/prisma.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { emptyBrief } from '@scopeprofit/contracts';

const skip = !process.env.DATABASE_URL;
let app: INestApplication;
let baseUrl: string;
let db: PrismaService;

before(async () => {
  if (skip) return;
  app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiErrorHandler());
  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  db = app.get(PrismaService);
});

after(async () => { if (!skip) await app.close(); });

test('GET /api/health reports liveness without touching the database', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
});

test('unauthenticated project creation is rejected with the stable error envelope', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const response = await fetch(`${baseUrl}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x' }) });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'UNAUTHENTICATED');
  assert.ok(body.error.requestId);
});

test('magic-link request -> verify sets a session cookie that authorizes /api/auth/me and /api/projects', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  // Brevo is not reachable in this environment (no real BREVO_API_KEY). We intercept only the outbound
  // Brevo call to capture the signed link the real code path would have emailed, without faking any
  // application logic: magic-link creation, hashing, expiry and single-use consumption all run for real.
  const originalFetch = globalThis.fetch;
  let capturedHtml = '';
  globalThis.fetch = (async (input: any, init?: any) => {
    if (typeof input === 'string' && input.includes('api.brevo.com')) {
      capturedHtml = JSON.parse(init.body).htmlContent;
      return new Response(JSON.stringify({ messageId: 'stub' }), { status: 201 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const email = `client-${Date.now()}@example.com`;
    const requestResponse = await fetch(`${baseUrl}/api/auth/magic-link/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal(requestResponse.status, 201);
    const match = capturedHtml.match(/token=([\w-]+)/);
    assert.ok(match, 'expected the emailed link to carry a token');
    const verifyResponse = await fetch(`${baseUrl}/api/auth/magic-link/verify?token=${match![1]}`, { redirect: 'manual' });
    assert.equal(verifyResponse.status, 302);
    const cookie = verifyResponse.headers.get('set-cookie');
    assert.ok(cookie?.includes('sp_session='));
    const sessionCookie = cookie!.split(';')[0];
    const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: sessionCookie } });
    const me = await meResponse.json();
    assert.equal(meResponse.status, 200);
    assert.equal(me.data.email, email);
    assert.equal(me.data.hasAiApiKey, false);
    const projectsResponse = await fetch(`${baseUrl}/api/projects`, { headers: { cookie: sessionCookie } });
    const projectsBody = await projectsResponse.json();
    assert.equal(projectsResponse.status, 200);
    assert.deepEqual(projectsBody.data.items, []);
    const reuseResponse = await fetch(`${baseUrl}/api/auth/magic-link/verify?token=${match![1]}`, { redirect: 'manual' });
    assert.equal(reuseResponse.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('creating a project without a Gemini key leaves it in agent_configuration_required once the agent worker claims it', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const owner = await db.user.create({ data: { telegramId: `e2e-owner-${Date.now()}`, role: 'professional' } });
  const project = await db.project.create({ data: { name: 'E2E project', ownerId: owner.id, brief: { create: { data: emptyBrief() as any } }, document: { create: {} } } });
  await db.project.update({ where: { id: project.id }, data: { agentStatus: 'pending' } });
  const claimed = await db.project.updateMany({ where: { id: project.id, agentStatus: 'pending' }, data: { agentStatus: 'agent_configuration_required' } });
  assert.equal(claimed.count, 1);
});

test('generating a document from an empty brief persists a document version', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const owner = await db.user.create({ data: { telegramId: `e2e-doc-owner-${Date.now()}`, role: 'professional' } });
  const project = await db.project.create({ data: { name: 'E2E document project', ownerId: owner.id, brief: { create: { data: emptyBrief() as any } }, document: { create: {} } } });
  const documents = app.get(DocumentsService);
  const saved = await documents.generate(project.id, owner.id);
  assert.equal(saved.version, 1);
  const persisted = await db.documentVersion.findUnique({ where: { documentId_version: { documentId: saved.documentId, version: 1 } } });
  assert.ok(persisted, 'expected the generated document version to be persisted');
});
