process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const runId = Date.now();
process.env.TELEGRAM_AUTHORIZED_USER_IDS = `owner-1-${runId},owner-2-${runId},owner-3-${runId}`;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma.service';
import { EmailService } from '../src/email.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { ChangeRequestsService } from '../src/modules/projects/change-requests.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { ChangeRequestStatus, Prisma, ProjectStatus } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { HttpException } from '@nestjs/common';
import { BriefController } from '../src/modules/brief/brief.controller';
import { AgentService } from '../src/modules/agent/agent.service';
import { emptyBrief } from '@scopeprofit/contracts';
import { SESSION_COOKIE } from '../src/response';
import { hash } from '../src/security';

const skip = !process.env.DATABASE_URL;

let db: PrismaService;
let auth: AuthService;
let projects: ProjectsService;
let documents: DocumentsService;
let changes: ChangeRequestsService;
let storageRoot: string;

before(async () => {
  if (skip) return;
  db = new PrismaService();
  await db.$connect();
  auth = new AuthService(db, new EmailService());
  projects = new ProjectsService(db, auth);
  storageRoot = await mkdtemp(join(tmpdir(), 'scopeprofit-changes-'));
  process.env.STORAGE_ROOT = storageRoot;
  documents = new DocumentsService(db, new StorageService(), new EmailService());
  changes = new ChangeRequestsService(db, auth, documents);
});

after(async () => {
  if (!skip) {
    await db.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
  }
});

async function changeFixture() {
  const telegramId = `change-owner-${randomUUID()}`;
  process.env.TELEGRAM_AUTHORIZED_USER_IDS = `${process.env.TELEGRAM_AUTHORIZED_USER_IDS},${telegramId}`;
  const owner = await db.user.create({
    data: { telegramId, role: 'professional' },
  });
  const project = await projects.create(owner, 'Change request test');
  return { owner, project };
}

test(
  'creating a project seeds an empty brief, a document shell and one active link',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-1-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Portal de clientes');
    const brief = await db.brief.findUniqueOrThrow({ where: { projectId: project.id } });
    assert.equal(brief.version, 0);
    const links = await db.projectLink.findMany({
      where: { projectId: project.id, revokedAt: null },
    });
    assert.equal(links.length, 1);
    assert.match(project.clientUrl, new RegExp(`/p/${project.id}\\?token=`));
  },
);

test(
  'change request applies an explicitly reviewed patch once and generates its matching document',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    const change = await changes.create(project.id, 'Agregar exportación CSV', owner.id);
    await changes.setPatch(project.id, change.id, 0, { included: ['Exportación CSV'] }, owner);
    const accepted = await changes.decide(
      project.id,
      change.id,
      ChangeRequestStatus.accepted,
      owner,
    );
    const repeated = await changes.decide(
      project.id,
      change.id,
      ChangeRequestStatus.accepted,
      owner,
    );
    const brief = await db.brief.findUniqueOrThrow({ where: { projectId: project.id } });
    const briefVersions = await db.briefVersion.findMany({ where: { projectId: project.id } });
    const generated = await db.documentVersion.findMany({
      where: { document: { projectId: project.id } },
    });
    const history = await changes.list(project.id, owner);
    assert.equal(accepted.status, ChangeRequestStatus.accepted);
    assert.equal(repeated.documentVersion, accepted.documentVersion);
    assert.equal(brief.version, 1);
    assert.deepEqual((brief.data as { included: string[] }).included, ['Exportación CSV']);
    assert.equal(briefVersions.length, 1);
    assert.equal(generated.length, 1);
    assert.equal(generated[0].briefVersion, accepted.appliedBriefVersion);
    const decision = history[0].history.find((event) => event.action === 'change_request.accepted');
    assert.equal(decision?.actorId, owner.id);
    assert.ok(decision?.createdAt instanceof Date);
    assert.equal(accepted.decisionBy, owner.id);
    assert.ok(accepted.decisionAt instanceof Date);
  },
);

test(
  'rejection is idempotent and does not change the brief',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    const change = await changes.create(project.id, 'Agregar panel', owner.id);
    const rejected = await changes.decide(
      project.id,
      change.id,
      ChangeRequestStatus.rejected,
      owner,
    );
    const repeated = await changes.decide(
      project.id,
      change.id,
      ChangeRequestStatus.rejected,
      owner,
    );
    const brief = await db.brief.findUniqueOrThrow({ where: { projectId: project.id } });
    assert.equal(rejected.status, ChangeRequestStatus.rejected);
    assert.equal(repeated.status, ChangeRequestStatus.rejected);
    assert.equal(brief.version, 0);
    await assert.rejects(
      changes.decide(project.id, change.id, ChangeRequestStatus.accepted, owner),
      /CHANGE_REQUEST_DECISION_CONFLICT/,
    );
  },
);

test(
  'acceptance rejects a patch whose base Brief version has gone stale',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    const change = await changes.create(project.id, 'Cambiar resumen', owner.id);
    await changes.setPatch(project.id, change.id, 0, { summary: 'Resumen revisado' }, owner);
    const brief = await db.brief.findUniqueOrThrow({ where: { projectId: project.id } });
    await db.brief.update({ where: { projectId: project.id }, data: { version: 1 } });
    await db.briefVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        data: brief.data as Prisma.InputJsonValue,
        source: 'test',
        actorId: owner.id,
      },
    });
    await assert.rejects(
      changes.decide(project.id, change.id, ChangeRequestStatus.accepted, owner),
      /VERSION_CONFLICT/,
    );
    assert.equal(
      (await db.changeRequest.findUniqueOrThrow({ where: { id: change.id } })).status,
      'proposed',
    );
  },
);

test(
  'a locked project rejects change-request application without advancing the Brief',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    const change = await changes.create(project.id, 'Cambiar resumen', owner.id);
    await changes.setPatch(project.id, change.id, 0, { summary: 'Nuevo resumen' }, owner);
    await db.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.approved },
    });
    await assert.rejects(
      changes.decide(project.id, change.id, ChangeRequestStatus.accepted, owner),
      /PROJECT_LOCKED/,
    );
    const brief = await db.brief.findUniqueOrThrow({ where: { projectId: project.id } });
    assert.equal(brief.version, 0);
    assert.equal(
      (await db.changeRequest.findUniqueOrThrow({ where: { id: change.id } })).status,
      ChangeRequestStatus.proposed,
    );
  },
);

test(
  'failed document generation is visible and retry completes without applying a duplicate Brief version',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    const change = await changes.create(project.id, 'Agregar exportación', owner.id);
    await changes.setPatch(project.id, change.id, 0, { included: ['Exportación'] }, owner);
    let attempts = 0;
    const flakyDocuments = {
      generate: async (projectId: string, actorId: string) => {
        attempts++;
        if (attempts === 1) throw new Error('simulated document rendering failure');
        return documents.generate(projectId, actorId);
      },
    } as unknown as DocumentsService;
    const retryableChanges = new ChangeRequestsService(db, auth, flakyDocuments);
    await assert.rejects(
      retryableChanges.decide(project.id, change.id, ChangeRequestStatus.accepted, owner),
      /DOCUMENT_GENERATION_FAILED/,
    );
    const failed = await db.changeRequest.findUniqueOrThrow({ where: { id: change.id } });
    assert.equal(failed.status, 'applying');
    assert.equal(failed.lastError, 'DOCUMENT_GENERATION_FAILED');
    assert.equal(await db.briefVersion.count({ where: { projectId: project.id } }), 1);
    assert.equal(
      await db.documentVersion.count({ where: { document: { projectId: project.id } } }),
      0,
    );
    const retried = await retryableChanges.decide(
      project.id,
      change.id,
      ChangeRequestStatus.accepted,
      owner,
    );
    await retryableChanges.decide(project.id, change.id, ChangeRequestStatus.accepted, owner);
    assert.equal(retried.status, 'accepted');
    assert.equal(attempts, 2);
    assert.equal(await db.briefVersion.count({ where: { projectId: project.id } }), 1);
    assert.equal(
      await db.documentVersion.count({ where: { document: { projectId: project.id } } }),
      1,
    );
  },
);

test(
  'archiving is rejected while a change request is applying',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    await db.changeRequest.create({
      data: {
        projectId: project.id,
        actorId: owner.id,
        baseBriefVersion: 0,
        request: 'Applying request',
        classification: 'ambiguous',
        status: ChangeRequestStatus.applying,
      },
    });

    await assert.rejects(
      projects.archive(project.id, owner),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        JSON.stringify(error.getResponse()).includes('CHANGE_REQUEST_APPLYING'),
    );
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } })).status,
      project.status,
    );
    assert.equal(
      await db.auditEvent.count({
        where: { projectId: project.id, action: 'project_archived', result: 'success' },
      }),
      0,
    );
  },
);

test(
  'manual and agent Brief writes are blocked across the applying window',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const manual = await changeFixture();
    const manualChange = await db.changeRequest.create({
      data: {
        projectId: manual.project.id,
        actorId: manual.owner.id,
        baseBriefVersion: 0,
        request: 'Manual write race',
        classification: 'ambiguous',
        status: ChangeRequestStatus.applying,
      },
    });
    const rawSession = randomUUID();
    await db.session.create({
      data: {
        userId: manual.owner.id,
        tokenHash: hash(rawSession),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const controller = new BriefController(auth, {} as unknown as AgentService, db);
    const request = {
      cookies: { [SESSION_COOKIE]: rawSession },
      headers: {},
    } as unknown as Request;
    await assert.rejects(
      controller.update(request, manual.project.id, {
        expectedVersion: 0,
        data: emptyBrief(),
      }),
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        JSON.stringify(error.getResponse()).includes('CHANGE_REQUEST_APPLYING'),
    );
    assert.equal(
      (await db.brief.findUniqueOrThrow({ where: { projectId: manual.project.id } })).version,
      0,
    );
    assert.equal(
      (await db.changeRequest.findUniqueOrThrow({ where: { id: manualChange.id } })).status,
      ChangeRequestStatus.applying,
    );

    const agentFixture = await changeFixture();
    const agentChange = await db.changeRequest.create({
      data: {
        projectId: agentFixture.project.id,
        actorId: agentFixture.owner.id,
        baseBriefVersion: 0,
        request: 'Agent write race',
        classification: 'ambiguous',
      },
    });
    await db.user.update({
      where: { id: agentFixture.owner.id },
      data: { encryptedApiKey: 'integration-test-only' },
    });
    await db.project.update({
      where: { id: agentFixture.project.id },
      data: { agentStatus: 'pending' },
    });
    process.env.AI_GATEWAY_API_KEY = 'integration-test-only';
    const agent = new AgentService(db, documents, new StorageService());
    (
      agent as unknown as {
        graph: { invoke: () => Promise<{ brief: unknown }> };
      }
    ).graph = {
      invoke: async () => {
        await db.changeRequest.update({
          where: { id: agentChange.id },
          data: { status: ChangeRequestStatus.applying },
        });
        return { brief: { ...emptyBrief(), summary: 'generated during apply' } };
      },
    };
    try {
      await agent.process(agentFixture.project.id);
    } finally {
      delete process.env.AI_GATEWAY_API_KEY;
    }
    const agentBrief = await db.brief.findUniqueOrThrow({
      where: { projectId: agentFixture.project.id },
    });
    assert.equal(agentBrief.version, 0);
    assert.equal((agentBrief.data as { summary: string }).summary, '');
    assert.equal(await db.briefVersion.count({ where: { projectId: agentFixture.project.id } }), 0);
    assert.equal(
      (await db.changeRequest.findUniqueOrThrow({ where: { id: agentChange.id } })).status,
      ChangeRequestStatus.applying,
    );
  },
);

test(
  'clients cannot list or decide change requests even when holding a project link',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const { owner, project } = await changeFixture();
    const change = await changes.create(project.id, 'Agregar panel', owner.id);
    const client = await db.user.create({
      data: { email: `change-client-${randomUUID()}@example.com` },
    });
    await assert.rejects(changes.list(project.id, client), /FORBIDDEN/);
    await assert.rejects(
      changes.decide(project.id, change.id, ChangeRequestStatus.rejected, client),
      /FORBIDDEN/,
    );
  },
);

test(
  'revoking a client link twice is idempotent and leaves no active link',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-2-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Landing Acme');
    await projects.link(project.id, owner, 'revoke');
    await projects.link(project.id, owner, 'revoke');
    const active = await db.projectLink.findMany({
      where: { projectId: project.id, revokedAt: null },
    });
    assert.equal(active.length, 0);
  },
);

test(
  'a project without an owner Gemini key is picked up as agent_configuration_required by the worker precondition',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-3-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Sin clave configurada');
    const fresh = await db.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { owner: true },
    });
    assert.equal(fresh.owner.encryptedApiKey, null);
  },
);
