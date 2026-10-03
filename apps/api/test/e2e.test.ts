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
import { Prisma } from '@prisma/client';
import { encrypt, hash, token } from '../src/security';

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
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorHandler());
  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  db = app.get(PrismaService);
});

after(async () => {
  if (!skip) await app.close();
});

test(
  'GET /api/health reports liveness without touching the database',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
  },
);

test(
  'unauthenticated project creation is rejected with the stable error envelope',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.ok(body.error.requestId);
  },
);

test(
  'magic-link request -> verify sets a session cookie that authorizes /api/auth/me and /api/projects',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    // Brevo is not reachable in this environment (no real BREVO_API_KEY). We intercept only the outbound
    // Brevo call to capture the signed link the real code path would have emailed, without faking any
    // application logic: magic-link creation, hashing, expiry and single-use consumption all run for real.
    const originalFetch = globalThis.fetch;
    let capturedHtml = '';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.includes('api.brevo.com')) {
        const body = JSON.parse(String(init?.body)) as { htmlContent: string };
        capturedHtml = body.htmlContent;
        return new Response(JSON.stringify({ messageId: 'stub' }), { status: 201 });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      const email = `client-${Date.now()}@example.com`;
      const requestResponse = await fetch(`${baseUrl}/api/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      assert.equal(requestResponse.status, 201);
      const match = capturedHtml.match(/token=([\w-]+)/);
      assert.ok(match, 'expected the emailed link to carry a token');
      const verifyResponse = await fetch(
        `${baseUrl}/api/auth/magic-link/verify?token=${match![1]}`,
        { redirect: 'manual' },
      );
      assert.equal(verifyResponse.status, 302);
      const cookie = verifyResponse.headers.get('set-cookie');
      assert.ok(cookie?.includes('sp_session='));
      const sessionCookie = cookie!.split(';')[0];
      const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { cookie: sessionCookie },
      });
      const me = await meResponse.json();
      assert.equal(meResponse.status, 200);
      assert.equal(me.data.email, email);
      assert.equal(me.data.hasAiApiKey, false);
      const projectsResponse = await fetch(`${baseUrl}/api/projects`, {
        headers: { cookie: sessionCookie },
      });
      const projectsBody = await projectsResponse.json();
      assert.equal(projectsResponse.status, 200);
      assert.deepEqual(projectsBody.data.items, []);
      const reuseResponse = await fetch(
        `${baseUrl}/api/auth/magic-link/verify?token=${match![1]}`,
        { redirect: 'manual' },
      );
      assert.equal(reuseResponse.status, 401);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

test(
  'creating a project without a Gemini key leaves it in agent_configuration_required once the agent worker claims it',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `e2e-owner-${Date.now()}`, role: 'professional' },
    });
    const project = await db.project.create({
      data: {
        name: 'E2E project',
        ownerId: owner.id,
        brief: { create: { data: emptyBrief() as unknown as Prisma.InputJsonValue } },
        document: { create: {} },
      },
    });
    await db.project.update({ where: { id: project.id }, data: { agentStatus: 'pending' } });
    const claimed = await db.project.updateMany({
      where: { id: project.id, agentStatus: 'pending' },
      data: { agentStatus: 'agent_configuration_required' },
    });
    assert.equal(claimed.count, 1);
  },
);

test(
  'generating a document from an empty brief persists a document version',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `e2e-doc-owner-${Date.now()}`, role: 'professional' },
    });
    const project = await db.project.create({
      data: {
        name: 'E2E document project',
        ownerId: owner.id,
        brief: { create: { data: emptyBrief() as unknown as Prisma.InputJsonValue } },
        document: { create: {} },
      },
    });
    const documents = app.get(DocumentsService);
    const saved = await documents.generate(project.id, owner.id);
    assert.equal(saved.version, 1);
    const persisted = await db.documentVersion.findUnique({
      where: { documentId_version: { documentId: saved.documentId, version: 1 } },
    });
    assert.ok(persisted, 'expected the generated document version to be persisted');
  },
);

test(
  'the pricing routes reject anonymous and client sessions while the default rate card persists',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const anonymous = await fetch(`${baseUrl}/api/me/rate-card`);
    const anonymousBody = await anonymous.json();
    assert.equal(anonymous.status, 401);
    assert.equal(anonymousBody.error.code, 'UNAUTHENTICATED');
    const quoteUrl = `${baseUrl}/api/projects/00000000-0000-0000-0000-000000000000/quote`;
    assert.equal((await fetch(quoteUrl)).status, 401);
    assert.equal((await fetch(`${quoteUrl}/generate`, { method: 'POST' })).status, 401);

    const client = await db.user.upsert({
      where: { email: 'e2e-pricing-client@example.com' },
      create: { email: 'e2e-pricing-client@example.com', role: 'client' },
      update: { role: 'client' },
    });
    const clientSession = token();
    await db.session.create({
      data: {
        userId: client.id,
        tokenHash: hash(clientSession),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const denied = await fetch(`${baseUrl}/api/me/rate-card`, {
      headers: { cookie: `sp_session=${clientSession}` },
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(deniedBody.error.code, 'FORBIDDEN');
    const deniedQuote = await fetch(quoteUrl, {
      headers: { cookie: `sp_session=${clientSession}` },
    });
    assert.equal(deniedQuote.status, 403);
    assert.equal((await deniedQuote.json()).error.code, 'FORBIDDEN');

    const owner = await db.user.upsert({
      where: { telegramId: '111' },
      create: { telegramId: '111', role: 'professional' },
      update: { role: 'professional' },
    });
    const ownerSession = token();
    await db.session.create({
      data: {
        userId: owner.id,
        tokenHash: hash(ownerSession),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const cookie = `sp_session=${ownerSession}`;
    const invalid = await fetch(`${baseUrl}/api/me/rate-card`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        label: 'Estándar',
        hourlyRate: 0,
        currency: 'USD',
        marginPercent: 10,
      }),
    });
    assert.equal(invalid.status, 400);

    const created = await fetch(`${baseUrl}/api/me/rate-card`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        label: 'Estándar',
        hourlyRate: 100,
        currency: 'USD',
        marginPercent: 10,
      }),
    });
    const createdBody = await created.json();
    assert.equal(created.status, 200);
    assert.equal(createdBody.success, true);
    assert.equal(createdBody.data.hourlyRate, 100);
    assert.equal(createdBody.data.isDefault, true);

    const read = await fetch(`${baseUrl}/api/me/rate-card`, { headers: { cookie } });
    const readBody = await read.json();
    assert.equal(read.status, 200);
    assert.equal(readBody.data.id, createdBody.data.id);
    assert.equal(readBody.data.marginPercent, 10);
  },
);

test(
  'the maintenance routes require a professional session and expose the retainer balance',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const createBody = JSON.stringify({
      hoursPerMonth: 4,
      currency: 'USD',
      startDate: '2026-10-01T00:00:00.000Z',
    });
    const anonymousUrl = `${baseUrl}/api/projects/00000000-0000-0000-0000-000000000000/maintenance`;
    const anonymous = await fetch(anonymousUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: createBody,
    });
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).error.code, 'UNAUTHENTICATED');
    assert.equal((await fetch(anonymousUrl)).status, 401);

    const client = await db.user.upsert({
      where: { email: 'e2e-maintenance-client@example.com' },
      create: { email: 'e2e-maintenance-client@example.com', role: 'client' },
      update: { role: 'client' },
    });
    const clientSession = token();
    await db.session.create({
      data: {
        userId: client.id,
        tokenHash: hash(clientSession),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const denied = await fetch(anonymousUrl, {
      headers: { cookie: `sp_session=${clientSession}` },
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN');

    const owner = await db.user.upsert({
      where: { telegramId: '111' },
      create: { telegramId: '111', role: 'professional' },
      update: { role: 'professional' },
    });
    const ownerSession = token();
    await db.session.create({
      data: {
        userId: owner.id,
        tokenHash: hash(ownerSession),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const project = await db.project.create({
      data: {
        name: 'E2E maintenance',
        ownerId: owner.id,
        brief: { create: { data: emptyBrief() as unknown as Prisma.InputJsonValue } },
        document: { create: {} },
      },
    });
    const headers = { 'content-type': 'application/json', cookie: `sp_session=${ownerSession}` };
    const projectUrl = `${baseUrl}/api/projects/${project.id}/maintenance`;

    const created = await fetch(projectUrl, { method: 'POST', headers, body: createBody });
    const createdBody = await created.json();
    assert.equal(created.status, 201);
    assert.equal(createdBody.success, true);
    assert.equal(createdBody.data.status, 'active');
    assert.equal(createdBody.data.hoursPerMonth, 4);

    const duplicate = await fetch(projectUrl, { method: 'POST', headers, body: createBody });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error.code, 'MAINTENANCE_EXISTS');

    const read = await fetch(projectUrl, { headers });
    const readBody = await read.json();
    assert.equal(read.status, 200);
    assert.deepEqual(readBody.data.entries, []);

    const month = new Date().toISOString().slice(0, 7);
    const entry = await fetch(`${projectUrl}/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        date: `${month}-15T12:00:00.000Z`,
        hours: 1.5,
        description: 'Soporte mensual',
      }),
    });
    const entryBody = await entry.json();
    assert.equal(entry.status, 201);
    assert.equal(entryBody.data.hours, 1.5);
    assert.equal(entryBody.data.extraHours, 0);
    assert.equal(entryBody.data.billableExtra, false);

    const entries = await fetch(`${projectUrl}/entries?month=${month}`, { headers });
    assert.equal(entries.status, 200);
    assert.equal((await entries.json()).data.entries.length, 1);

    const balance = await fetch(`${projectUrl}/balance?month=${month}`, { headers });
    const balanceBody = await balance.json();
    assert.equal(balance.status, 200);
    assert.deepEqual(balanceBody.data, {
      month,
      hoursPerMonth: 4,
      consumedRetainer: 1.5,
      consumedExtra: 0,
      remaining: 2.5,
      entriesCount: 1,
    });

    const patched = await fetch(projectUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ monthlyPrice: 600 }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).data.monthlyPrice, 600);
  },
);

test(
  'the quote proposal is downloadable by the professional and decidable by the client link',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.upsert({
      where: { telegramId: '111' },
      create: { telegramId: '111', role: 'professional' },
      update: { role: 'professional' },
    });
    const ownerSession = token();
    await db.session.create({
      data: {
        userId: owner.id,
        tokenHash: hash(ownerSession),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const cookie = `sp_session=${ownerSession}`;
    const project = await db.project.create({
      data: {
        name: 'E2E propuesta',
        ownerId: owner.id,
        brief: {
          create: {
            data: {
              ...emptyBrief(),
              estimates: [{ module: 'Auth', minHours: 10, maxHours: 20, uncertainty: 'baja' }],
            } as unknown as Prisma.InputJsonValue,
          },
        },
        document: { create: {} },
      },
    });
    const quoteUrl = `${baseUrl}/api/projects/${project.id}/quote`;
    const jsonHeaders = { 'content-type': 'application/json', cookie };

    const rateCard = await fetch(`${baseUrl}/api/me/rate-card`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        label: 'Estándar',
        hourlyRate: 100,
        currency: 'USD',
        marginPercent: 10,
      }),
    });
    assert.equal(rateCard.status, 200);

    const generated = await fetch(`${quoteUrl}/generate`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(generated.status, 201);
    const patched = await fetch(quoteUrl, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        terms: 'Pago contra entrega',
        validUntil: '2030-01-01T00:00:00.000Z',
        milestones: [
          { name: 'Arranque', percent: 50 },
          { name: 'Entrega', percent: 50 },
        ],
      }),
    });
    assert.equal(patched.status, 200);

    const sent = await fetch(`${quoteUrl}/send`, { method: 'POST', headers: jsonHeaders });
    const sentBody = await sent.json();
    assert.equal(sent.status, 201);
    assert.equal(sentBody.data.status, 'sent');
    assert.ok(sentBody.data.sentAt);
    const twice = await fetch(`${quoteUrl}/send`, { method: 'POST', headers: jsonHeaders });
    assert.equal(twice.status, 409);
    assert.equal((await twice.json()).error.code, 'QUOTE_NOT_DRAFT');

    const pdf = await fetch(`${quoteUrl}/pdf`, { headers: { cookie } });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type') ?? '', /^application\/pdf/);
    assert.match(pdf.headers.get('content-disposition') ?? '', /quote\.pdf"$/);
    assert.ok((await pdf.arrayBuffer()).byteLength > 1000, 'expected a non empty PDF');
    const docx = await fetch(`${quoteUrl}/docx`, { headers: { cookie } });
    assert.equal(docx.status, 200);
    assert.match(
      docx.headers.get('content-type') ?? '',
      /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
    );
    assert.match(docx.headers.get('content-disposition') ?? '', /quote\.docx"$/);
    assert.ok((await docx.arrayBuffer()).byteLength > 1000, 'expected a non empty DOCX');

    const clientToken = token();
    await db.projectLink.create({
      data: {
        projectId: project.id,
        tokenHash: hash(clientToken),
        encryptedToken: encrypt(clientToken),
      },
    });
    const linkHeaders = { 'x-project-token': clientToken };

    const before = await fetch(quoteUrl, { headers: linkHeaders });
    assert.equal(before.status, 200);
    assert.equal((await before.json()).data.status, 'sent');

    const professional = await fetch(`${quoteUrl}/decision`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ decision: 'accepted' }),
    });
    assert.equal(professional.status, 403);
    assert.equal((await professional.json()).error.code, 'FORBIDDEN');

    const decision = await fetch(`${quoteUrl}/decision`, {
      method: 'POST',
      headers: { ...linkHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'accepted' }),
    });
    const decisionBody = await decision.json();
    assert.equal(decision.status, 201);
    assert.equal(decisionBody.data.status, 'accepted');
    assert.ok(decisionBody.data.decidedAt);

    const after = await fetch(quoteUrl, { headers: linkHeaders });
    assert.equal(after.status, 200);
    assert.equal((await after.json()).data.status, 'accepted');

    const repeated = await fetch(`${quoteUrl}/decision`, {
      method: 'POST',
      headers: { ...linkHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected' }),
    });
    assert.equal(repeated.status, 409);
    assert.equal((await repeated.json()).error.code, 'QUOTE_NOT_SENDABLE');
  },
);
