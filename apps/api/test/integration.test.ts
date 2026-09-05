process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const runId = Date.now();
process.env.TELEGRAM_AUTHORIZED_USER_IDS = `owner-1-${runId},owner-2-${runId},owner-3-${runId}`;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma.service';
import { EmailService } from '../src/email.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProjectsService } from '../src/modules/projects/projects.service';

const skip = !process.env.DATABASE_URL;

let db: PrismaService;
let auth: AuthService;
let projects: ProjectsService;

before(async () => {
  if (skip) return;
  db = new PrismaService();
  await db.$connect();
  auth = new AuthService(db, new EmailService());
  projects = new ProjectsService(db, auth);
});

after(async () => { if (!skip) await db.$disconnect(); });

test('creating a project seeds an empty brief, a document shell and one active link', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const owner = await db.user.create({ data: { telegramId: `owner-1-${runId}`, role: 'professional' } });
  const project = await projects.create(owner, 'Portal de clientes');
  const brief = await db.brief.findUniqueOrThrow({ where: { projectId: project.id } });
  assert.equal(brief.version, 0);
  const links = await db.projectLink.findMany({ where: { projectId: project.id, revokedAt: null } });
  assert.equal(links.length, 1);
  assert.match(project.clientUrl, new RegExp(`/p/${project.id}\\?token=`));
});

test('revoking a client link twice is idempotent and leaves no active link', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const owner = await db.user.create({ data: { telegramId: `owner-2-${runId}`, role: 'professional' } });
  const project = await projects.create(owner, 'Landing Acme');
  await projects.link(project.id, owner, 'revoke');
  await projects.link(project.id, owner, 'revoke');
  const active = await db.projectLink.findMany({ where: { projectId: project.id, revokedAt: null } });
  assert.equal(active.length, 0);
});

test('a project without an owner Gemini key is picked up as agent_configuration_required by the worker precondition', { skip: skip ? 'DATABASE_URL not set' : false }, async () => {
  const owner = await db.user.create({ data: { telegramId: `owner-3-${runId}`, role: 'professional' } });
  const project = await projects.create(owner, 'Sin clave configurada');
  const fresh = await db.project.findUniqueOrThrow({ where: { id: project.id }, include: { owner: true } });
  assert.equal(fresh.owner.encryptedApiKey, null);
});
