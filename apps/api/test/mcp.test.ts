process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const runId = Date.now();
const ownerEmail = `mcp-owner-${runId}@scopeprofit.test`;
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://api.scopeprofit.test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtemp, rm, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import express from 'express';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { xmcpAdapter } from '../src/modules/mcp/xmcp-adapter';
import { scopeToolContext } from '../src/modules/mcp/tool-context';
import type { User } from '@prisma/client';
import { HttpException } from '@nestjs/common';

const storageRoot = mkdtemp(join(tmpdir(), 'scopeprofit-mcp-'));

import { PrismaService } from '../src/prisma.service';
import { EmailService } from '../src/email.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { AgentService } from '../src/modules/agent/agent.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { ChangeRequestsService } from '../src/modules/projects/change-requests.service';
import { ApiKeysService } from '../src/modules/mcp/api-keys.service';
import { ScopeToolsService } from '../src/modules/mcp/scope-tools.service';
import { exportUrl, verifyExportToken } from '../src/modules/mcp/export-links';
import { fetchImage, isPublicAddress } from '../src/modules/mcp/image-fetch';
import { signConsent, verifyConsent } from '../src/modules/mcp/oauth-consent';
import { isMcpRoute } from '../src/modules/mcp/mcp-http';

const skip = !process.env.DATABASE_URL;
const dbOnly = { skip: skip ? 'DATABASE_URL not set' : false };

let db: PrismaService;
let keys: ApiKeysService;
let documents: DocumentsService;
let tools: ScopeToolsService;
let owner: User;
let client: Client;
let imageServer: Server;
let mcpServer: Server;
let imageBase: string;

type ToolOutput = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content: unknown;
};

async function call(name: string, args: Record<string, unknown>) {
  return (await client.callTool({ name, arguments: args })) as ToolOutput;
}
async function data<T = Record<string, unknown>>(name: string, args: Record<string, unknown>) {
  const result = await call(name, args);
  assert.ok(!result.isError, `${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent as T;
}
async function errorCode(name: string, args: Record<string, unknown>) {
  const result = await call(name, args);
  assert.equal(result.isError, true, `${name} should fail`);
  return (result.structuredContent as { error: { code: string } }).error.code;
}

const withCode = (code: string) => (error: unknown) =>
  error instanceof HttpException && (error.getResponse() as { code?: string }).code === code;

test('private and loopback addresses are never fetched as client images', async () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    'fd00::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(fetchImage('http://127.0.0.1/a.png'), withCode('INVALID_IMAGE_URL'));
  await assert.rejects(fetchImage('https://127.0.0.1/a.png'), withCode('INVALID_IMAGE_URL'));
  await assert.rejects(fetchImage('https://[::1]/a.png'), withCode('INVALID_IMAGE_URL'));
  await assert.rejects(fetchImage('file:///etc/passwd'), withCode('INVALID_IMAGE_URL'));
});

test('export links and OAuth consent requests are signed and tamper-proof', () => {
  const link = exportUrl('6f7c1d1e-6c4f-4f39-9d1c-2d2a7a1d0c11', 3, 'pdf');
  assert.match(link.url, /^https:\/\/api\.scopeprofit\.test\/api\/exports\//);
  const raw = link.url.split('/').pop()!;
  assert.deepEqual(
    { ...verifyExportToken(raw), exp: 0 },
    { projectId: '6f7c1d1e-6c4f-4f39-9d1c-2d2a7a1d0c11', version: 3, format: 'pdf', exp: 0 },
  );
  const [payload, signature] = raw.split('.');
  const forged = Buffer.from(
    JSON.stringify({ projectId: 'x', version: 1, format: 'pdf', exp: Date.now() + 1e6 }),
  ).toString('base64url');
  assert.equal(verifyExportToken(`${forged}.${signature}`), null);
  assert.ok(payload);

  const consent = signConsent({
    clientId: 'c1',
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    codeChallenge: 'abc',
    scopes: ['scope'],
    exp: Date.now() + 60_000,
  });
  assert.equal(verifyConsent(consent)?.clientId, 'c1');
  assert.equal(verifyConsent(`${consent}x`), null);
  assert.equal(
    verifyConsent(
      signConsent({ clientId: 'c1', redirectUri: 'x', codeChallenge: 'a', scopes: [], exp: 1 }),
    ),
    null,
  );
});

before(async () => {
  if (skip) return;
  process.env.STORAGE_ROOT = await storageRoot;
  db = new PrismaService();
  await db.$connect();
  const email = new EmailService();
  const auth = new AuthService(db, email);
  const storage = new StorageService();
  documents = new DocumentsService(db, storage, email);
  const agent = new AgentService(db, documents, storage);
  const projects = new ProjectsService(db, auth);
  const changes = new ChangeRequestsService(db, auth);
  keys = new ApiKeysService(db, auth);
  tools = new ScopeToolsService(db, auth, projects, documents, agent, storage, changes);
  owner = await auth.professionalUser(ownerEmail);

  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
  imageServer = createServer((req, res) => {
    if (req.url === '/sketch.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: '/sketch.png' });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    }
  });
  await new Promise<void>((resolve) => imageServer.listen(0, '127.0.0.1', resolve));
  imageBase = `http://127.0.0.1:${(imageServer.address() as AddressInfo).port}`;

  const http = express();
  const adapter = new xmcpAdapter.XmcpService();
  http.use(express.json());
  http.post('/api/mcp', (req, res) =>
    scopeToolContext.provider({ tools, user: owner }, () => adapter.handleRequest(req, res)),
  );
  mcpServer = http.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => mcpServer.once('listening', resolve));
  const address = mcpServer.address() as AddressInfo;
  client = new Client({ name: 'mcp-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/api/mcp`)),
  );
});

after(async () => {
  if (skip) return;
  await client.close();
  imageServer.close();
  await new Promise<void>((resolve) => mcpServer.close(() => resolve()));
  await db.$disconnect();
  await rm(await storageRoot, { recursive: true, force: true });
});

test(
  'the server advertises every scope tool with a description and an object input schema',
  dbOnly,
  async () => {
    const { tools: listed } = await client.listTools();
    const names = listed.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      'add_client_input',
      'answer_question',
      'approve_scope',
      'archive_project',
      'create_project',
      'export_document',
      'get_conversation',
      'get_project',
      'get_scope_document',
      'get_tldr',
      'list_change_requests',
      'list_pending_questions',
      'list_projects',
      'log_change_request',
      'update_scope_section',
    ]);
    for (const tool of listed) {
      assert.ok((tool.description ?? '').length > 40, `${tool.name} needs a real description`);
      assert.equal(tool.inputSchema.type, 'object');
    }
    const readOnly = listed.filter((tool) => tool.annotations?.readOnlyHint).map((t) => t.name);
    assert.ok(readOnly.includes('get_tldr') && !readOnly.includes('approve_scope'));
    assert.match(client.getInstructions() ?? '', /template 7\.1/);
  },
);

test(
  'API keys are stored hashed, resolve to their professional and stop working once revoked',
  dbOnly,
  async () => {
    const created = await keys.create(owner, 'test');
    assert.match(created.key, /^sp_live_/);
    const stored = await db.apiKey.findUniqueOrThrow({ where: { id: created.id } });
    assert.notEqual(stored.keyHash, created.key);
    assert.equal((await keys.verify(created.key)).user.id, owner.id);
    await keys.revoke(created.id);
    await assert.rejects(keys.verify(created.key), withCode('INVALID_API_KEY'));
    await assert.rejects(keys.verify('sp_live_unknown'), withCode('INVALID_API_KEY'));
    const emailOnly = await db.user.create({
      data: { email: `client-${Date.now()}@scopeprofit.test` },
    });
    assert.equal(emailOnly.role, 'client');
    await assert.rejects(keys.create(emailOnly, 'not-provisioned'), withCode('FORBIDDEN'));
    const provisioned = await keys.createForEmail(
      `new-owner-${Date.now()}@scopeprofit.test`,
      'cli',
    );
    assert.equal((await keys.verify(provisioned.key)).user.role, 'professional');
    await assert.rejects(keys.createForEmail('invalid-email', 'cli'), withCode('INVALID_EMAIL'));
    const professional = (await keys.verify(provisioned.key)).user;
    await db.user.update({ where: { id: professional.id }, data: { role: 'client' } });
    await assert.rejects(keys.verify(provisioned.key), withCode('INVALID_API_KEY'));
  },
);

test('a full scoping flow runs end to end through MCP tools', dbOnly, async () => {
  process.env.MCP_ALLOW_HTTP_IMAGE_URLS = 'true';
  process.env.MCP_ALLOW_PRIVATE_IMAGE_URLS = 'true';
  try {
    const created = await data<{ projectId: string }>('create_project', {
      name: 'Turnos para veterinaria',
      client_email: 'cliente@example.com',
    });
    const projectId = created.projectId;

    const clientText =
      'Quiero que los clientes reserven turnos online y reciban un recordatorio por WhatsApp.';
    const added = await data<{ added: { messageId: string; kind: string }[]; agentStatus: string }>(
      'add_client_input',
      {
        project_id: projectId,
        text: clientText,
        image_urls: [`${imageBase}/redirect`],
      },
    );
    assert.equal(added.agentStatus, 'idle');
    assert.deepEqual(
      added.added.map((m) => m.kind),
      ['text', 'image'],
    );
    assert.equal(
      await errorCode('add_client_input', {
        project_id: projectId,
        image_urls: [`${imageBase}/page`],
      }),
      'INVALID_IMAGE',
    );
    assert.equal(await errorCode('add_client_input', { project_id: projectId }), 'EMPTY_INPUT');

    const conversation = await data<{ messages: { messageId: string; content: string }[] }>(
      'get_conversation',
      { project_id: projectId },
    );
    const source = conversation.messages.find((m) => m.content === clientText)!;
    assert.ok(source);

    let version: number = (
      await data<{ briefVersion: number }>('get_scope_document', { project_id: projectId })
    ).briefVersion;
    assert.equal(version, 0);

    assert.equal(
      await errorCode('update_scope_section', {
        project_id: projectId,
        expected_version: version,
        section: 'requirements',
        value: [
          {
            id: 'RF-01',
            description: 'Reserva online',
            type: 'functional',
            priority: 'must',
            source: 'una frase que el cliente nunca dijo',
            sourceMessageId: source.messageId,
            systemNote: '',
          },
        ],
      }),
      'INVALID_REQUIREMENT_SOURCE',
    );
    assert.equal(
      await errorCode('update_scope_section', {
        project_id: projectId,
        expected_version: version,
        section: 'estimates',
        value: [{ module: 'x', minHours: 'diez', maxHours: 2, uncertainty: '' }],
      }),
      'INVALID_SECTION_VALUE',
    );

    const sections: [string, unknown][] = [
      ['summary', 'Sistema de turnos online con recordatorios por WhatsApp.'],
      [
        'requirements',
        [
          {
            id: 'RF-01',
            description: 'Los clientes reservan turnos online',
            type: 'functional',
            priority: 'must',
            source: 'reserven turnos online',
            sourceMessageId: source.messageId,
            systemNote: 'Actor: cliente final',
          },
        ],
      ],
      [
        'questions',
        [
          {
            id: 'Q1',
            question: '¿Cuántas sucursales hay?',
            reason: 'Define agendas',
            blocksEstimate: true,
          },
        ],
      ],
      [
        'risks',
        [
          {
            id: 'R1',
            description: 'API de WhatsApp con costo por mensaje',
            impact: 'Costo operativo',
            mitigation: 'El cliente contrata su cuenta de WhatsApp Business',
            severity: 'red',
          },
        ],
      ],
      ['included', ['Reserva de turnos', 'Recordatorio por WhatsApp']],
      ['excluded', ['Pagos online']],
      ['assumptions', ['Una sola sucursal en v1']],
      ['acceptanceCriteria', ['Un cliente reserva un turno en menos de 2 minutos']],
      ['estimates', [{ module: 'Turnos', minHours: 40, maxHours: 60, uncertainty: 'media' }]],
      ['nextSteps', ['Validar cantidad de sucursales']],
    ];
    for (const [section, value] of sections) {
      const saved: { briefVersion: number; documentVersion: number } = await data(
        'update_scope_section',
        { project_id: projectId, expected_version: version, section, value },
      );
      assert.equal(saved.briefVersion, version + 1);
      version = saved.briefVersion;
    }
    assert.equal(
      await errorCode('update_scope_section', {
        project_id: projectId,
        expected_version: version - 1,
        section: 'summary',
        value: 'stale write',
      }),
      'VERSION_CONFLICT',
    );

    const pending = await data<{ questions: { id: string }[] }>('list_pending_questions', {
      project_id: projectId,
      blocking_only: true,
    });
    assert.deepEqual(
      pending.questions.map((q) => q.id),
      ['Q1'],
    );
    let status = await data<{ document: { version: number; upToDate: boolean } }>('get_project', {
      project_id: projectId,
    });
    assert.equal(status.document.upToDate, true);
    assert.equal(
      await errorCode('approve_scope', {
        project_id: projectId,
        document_version: status.document.version,
        send_to_client: false,
      }),
      'ESTIMATE_BLOCKED',
    );

    const answered = await data<{ briefVersion: number }>('answer_question', {
      project_id: projectId,
      question_id: 'Q1',
      answer: 'Una sola sucursal.',
    });
    assert.equal(answered.briefVersion, version + 1);

    const tldr = await data<{
      blockingQuestions: number;
      estimateHours: { min: number; max: number };
    }>('get_tldr', { project_id: projectId });
    assert.equal(tldr.blockingQuestions, 0);
    assert.deepEqual(tldr.estimateHours, { min: 40, max: 60 });

    const doc = await data<{ markdown: string; template: string }>('get_scope_document', {
      project_id: projectId,
    });
    assert.equal(doc.template, '7.1');
    for (const heading of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5. Alcance', '## 6.', '## 7.'])
      assert.ok(doc.markdown.includes(heading), heading);
    assert.ok(doc.markdown.includes('Fuente: "reserven turnos online"'));

    const draftVersions = await db.documentVersion.findMany({
      where: { document: { projectId } },
      orderBy: { version: 'desc' },
    });
    assert.ok(draftVersions.length >= sections.length);
    assert.ok(draftVersions.every((draft) => Object.keys(draft.artifacts as object).length === 0));
    const currentDraft = draftVersions[0];
    const historical = draftVersions.at(-1)!;
    const mdOnly = await documents.download(projectId, historical.version, 'md');
    assert.ok(mdOnly.buffer.toString().includes('## 5. Alcance'));
    const historicalSaved = await db.documentVersion.findUniqueOrThrow({
      where: { id: historical.id },
    });
    assert.deepEqual(Object.keys(historicalSaved.artifacts as object), ['md']);
    const concurrent = await Promise.all([
      documents.download(projectId, historical.version, 'pdf'),
      documents.download(projectId, historical.version, 'docx'),
    ]);
    assert.equal(concurrent[0].buffer.subarray(0, 4).toString(), '%PDF');
    assert.equal(concurrent[1].buffer.subarray(0, 2).toString(), 'PK');
    assert.equal(
      (historicalSaved.data as { brief: { summary: string } }).brief.summary,
      (historical.data as { brief: { summary: string } }).brief.summary,
    );
    const root = await storageRoot;
    await rename(root, `${root}-saved`);
    await writeFile(root, 'temporary storage obstruction');
    try {
      const failed = await call('export_document', { project_id: projectId, format: 'pdf' });
      assert.equal(failed.isError, true);
      const unchanged = await db.documentVersion.findUniqueOrThrow({
        where: { id: currentDraft.id },
      });
      assert.deepEqual(unchanged.artifacts, {});
      assert.equal(unchanged.briefVersion, answered.briefVersion);
    } finally {
      await rm(root);
      await rename(`${root}-saved`, root);
    }
    await data('approve_scope', {
      project_id: projectId,
      document_version: currentDraft.version,
      send_to_client: false,
    });
    const approvedDraft = await db.documentVersion.findUniqueOrThrow({
      where: { id: currentDraft.id },
    });
    assert.equal(approvedDraft.status, 'approved');
    assert.deepEqual(approvedDraft.artifacts, {});
    const exported = await data<{ url: string; version: number }>('export_document', {
      project_id: projectId,
      format: 'pdf',
    });
    assert.equal(exported.version, currentDraft.version);
    const materialized = await db.documentVersion.findUniqueOrThrow({
      where: { id: currentDraft.id },
    });
    assert.deepEqual(Object.keys(materialized.artifacts as object).sort(), ['docx', 'md', 'pdf']);
    const repeated = await data<{ version: number }>('export_document', {
      project_id: projectId,
      format: 'docx',
    });
    assert.equal(repeated.version, currentDraft.version);
    assert.equal(
      await db.documentVersion.count({ where: { document: { projectId } } }),
      draftVersions.length,
    );
    const claim = verifyExportToken(exported.url.split('/').pop()!)!;
    const pdf = await documents.download(claim.projectId, claim.version, claim.format);
    assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');

    status = await data('get_project', { project_id: projectId });
    const approved = await data<{
      status: string;
      emailedToClient: boolean;
      downloads: { docx: { url: string } };
    }>('approve_scope', {
      project_id: projectId,
      document_version: status.document.version,
      send_to_client: false,
    });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.emailedToClient, false);
    assert.match(approved.downloads.docx.url, /\/api\/exports\//);
    assert.equal(
      await errorCode('update_scope_section', {
        project_id: projectId,
        expected_version: version + 1,
        section: 'summary',
        value: 'after approval',
      }),
      'PROJECT_LOCKED',
    );

    const change = await data<{ classification: string }>('log_change_request', {
      project_id: projectId,
      request: 'Agregar pagos online',
    });
    assert.equal(change.classification, 'out_of_scope');
    const changes = await data<{ changeRequests: unknown[] }>('list_change_requests', {
      project_id: projectId,
    });
    assert.equal(changes.changeRequests.length, 1);

    await data('archive_project', { project_id: projectId });
    const listed = await data<{ projects: { projectId: string }[] }>('list_projects', {
      limit: 100,
    });
    assert.ok(!listed.projects.some((p) => p.projectId === projectId));
    const archived = await data<{ projects: { projectId: string }[] }>('list_projects', {
      status: 'archived',
      limit: 100,
    });
    assert.ok(archived.projects.some((p) => p.projectId === projectId));
  } finally {
    delete process.env.MCP_ALLOW_HTTP_IMAGE_URLS;
    delete process.env.MCP_ALLOW_PRIVATE_IMAGE_URLS;
  }
});

test('approve_scope refuses to email when the project has no client email', dbOnly, async () => {
  const created = await data<{ projectId: string }>('create_project', { name: 'Sin email' });
  assert.equal(
    await errorCode('approve_scope', { project_id: created.projectId, document_version: 1 }),
    'CLIENT_EMAIL_REQUIRED',
  );
  assert.equal(
    await errorCode('get_tldr', { project_id: '00000000-0000-4000-8000-000000000000' }),
    'PROJECT_NOT_FOUND',
  );
});

test('MCP and OAuth routes skip the cookie CSRF check, the REST API does not', () => {
  for (const path of ['/api/mcp', '/authorize', '/token', '/register', '/revoke', '/oauth/consent'])
    assert.equal(isMcpRoute(path), true, path);
  for (const path of ['/api/projects', '/api/auth/magic-link', '/api/mcp/extra', '/tokens'])
    assert.equal(isMcpRoute(path), false, path);
});
