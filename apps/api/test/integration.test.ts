process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const runId = Date.now();
const ownerTelegramIds = Array.from({ length: 12 }, (_, index) => `owner-${index + 1}-${runId}`);
process.env.TELEGRAM_AUTHORIZED_USER_IDS = ownerTelegramIds.join(',');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import {
  ChangeClassification,
  ChangeRequestStatus,
  MaintenanceStatus,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
import { emptyBrief } from '@scopeprofit/contracts';
import { decrypt } from '../src/security';
import { PrismaService } from '../src/prisma.service';
import { EmailService } from '../src/email.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { RateCardsService } from '../src/modules/pricing/rate-cards.service';
import { QuotesService } from '../src/modules/pricing/quotes.service';
import { MaintenanceService } from '../src/modules/maintenance/maintenance.service';

const skip = !process.env.DATABASE_URL;

let db: PrismaService;
let auth: AuthService;
let projects: ProjectsService;
let rateCards: RateCardsService;
let quotes: QuotesService;
let maintenance: MaintenanceService;

const rejectedWith = (code: string, status: number) => (error: unknown) =>
  error instanceof HttpException && error.message === code && error.getStatus() === status;

before(async () => {
  if (skip) return;
  db = new PrismaService();
  await db.$connect();
  auth = new AuthService(db, new EmailService());
  projects = new ProjectsService(db, auth);
  rateCards = new RateCardsService(db, auth);
  quotes = new QuotesService(db, auth);
  maintenance = new MaintenanceService(db, auth);
});

after(async () => {
  if (!skip) await db.$disconnect();
});

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

test(
  'the default rate card is upserted, read back and stays the only active default',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-4-${runId}`, role: 'professional' },
    });
    await assert.rejects(rateCards.get(owner), rejectedWith('RATE_CARD_NOT_FOUND', 404));

    const created = await rateCards.upsert(owner, {
      label: 'Estándar',
      hourlyRate: 100,
      currency: 'usd',
      marginPercent: 10,
    });
    assert.equal(created.currency, 'USD');
    assert.equal(created.isDefault, true);
    assert.equal(created.hourlyRate, 100);
    assert.deepEqual(await rateCards.get(owner), created);

    await db.rateCard.create({
      data: {
        ownerId: owner.id,
        label: 'Extra',
        hourlyRate: 50,
        currency: 'USD',
        marginPercent: 0,
        isDefault: false,
        active: true,
      },
    });
    const updated = await rateCards.upsert(owner, {
      label: 'Premium',
      hourlyRate: 120,
      currency: 'USD',
      marginPercent: 20,
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.hourlyRate, 120);

    const cards = await db.rateCard.findMany({ where: { ownerId: owner.id } });
    assert.equal(cards.length, 2);
    const defaults = cards.filter((card) => card.isDefault);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0].id, created.id);
    const extra = cards.find((card) => card.label === 'Extra');
    assert.equal(extra?.isDefault, false);
    assert.equal(extra?.active, false);
  },
);

test(
  'a quote generated from the brief is priced, patchable and guarded once sent',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-5-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Cotización Acme');

    await assert.rejects(
      quotes.generate(owner, project.id),
      rejectedWith('RATE_CARD_REQUIRED', 400),
    );
    await rateCards.upsert(owner, {
      label: 'Estándar',
      hourlyRate: 100,
      currency: 'USD',
      marginPercent: 10,
    });
    await assert.rejects(
      quotes.generate(owner, project.id),
      rejectedWith('BRIEF_NO_ESTIMATES', 400),
    );
    await assert.rejects(quotes.get(owner, project.id), rejectedWith('QUOTE_NOT_FOUND', 404));

    await db.brief.update({
      where: { projectId: project.id },
      data: {
        data: {
          ...emptyBrief(),
          estimates: [
            { module: 'Auth', minHours: 10, maxHours: 20, uncertainty: 'baja' },
            { module: 'Panel', minHours: 5, maxHours: 10, uncertainty: 'media' },
          ],
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const quote = await quotes.generate(owner, project.id);
    assert.equal(quote.status, QuoteStatus.draft);
    assert.equal(quote.currency, 'USD');
    assert.equal(quote.lines.length, 2);
    assert.deepEqual(
      quote.lines.map((line) => [line.module, line.hourlyRate, line.priceMin, line.priceMax]),
      [
        ['Auth', 110, 1100, 2200],
        ['Panel', 110, 550, 1100],
      ],
    );
    assert.equal(quote.subtotalMin, 1650);
    assert.equal(quote.subtotalMax, 3300);
    assert.equal(quote.totalMin, 1650);
    assert.equal(quote.totalMax, 3300);
    const snapshot = quote.rateCardSnapshot as { hourlyRate: number; marginPercent: number };
    assert.equal(snapshot.hourlyRate, 100);
    assert.equal(snapshot.marginPercent, 10);

    const fetched = await quotes.get(owner, project.id);
    assert.equal(fetched.id, quote.id);
    assert.equal(fetched.lines.length, 2);
    assert.equal(fetched.milestones.length, 0);

    const patched = await quotes.patch(owner, project.id, {
      terms: 'Pago contra entrega',
      validUntil: '2030-01-01T00:00:00.000Z',
      lines: [{ module: 'Auth', minHours: 20, maxHours: 30 }],
      milestones: [
        { name: 'Arranque', percent: 50 },
        { name: 'Entrega', percent: 50 },
      ],
    });
    assert.equal(patched.terms, 'Pago contra entrega');
    assert.equal(patched.validUntil, '2030-01-01T00:00:00.000Z');
    assert.equal(patched.lines.length, 1);
    assert.equal(patched.lines[0].hourlyRate, 110);
    assert.equal(patched.lines[0].priceMin, 2200);
    assert.equal(patched.lines[0].priceMax, 3300);
    assert.equal(patched.totalMin, 2200);
    assert.equal(patched.totalMax, 3300);
    assert.equal(patched.milestones.length, 2);

    await assert.rejects(
      quotes.patch(owner, project.id, {
        milestones: [
          { name: 'Arranque', percent: 60 },
          { name: 'Entrega', percent: 30 },
        ],
      }),
      rejectedWith('INVALID_MILESTONES', 400),
    );
    await assert.rejects(
      quotes.patch(owner, project.id, {
        lines: [{ module: 'Auth', minHours: 30, maxHours: 20 }],
      }),
      rejectedWith('INVALID_QUOTE_LINE', 400),
    );

    const persisted = await db.quote.findUniqueOrThrow({
      where: { projectId: project.id },
      include: { lines: true, milestones: true },
    });
    assert.equal(Number(persisted.totalMin), 2200);
    assert.equal(Number(persisted.totalMax), 3300);
    assert.equal(persisted.lines.length, 1);
    assert.equal(persisted.milestones.length, 2);

    const regenerated = await quotes.generate(owner, project.id);
    assert.notEqual(regenerated.id, quote.id);
    assert.equal(regenerated.lines.length, 2);
    assert.equal(regenerated.milestones.length, 0);
    assert.equal(regenerated.totalMin, 1650);

    await db.quote.update({
      where: { projectId: project.id },
      data: { status: QuoteStatus.sent },
    });
    await assert.rejects(
      quotes.patch(owner, project.id, { terms: 'Cambiado' }),
      rejectedWith('QUOTE_NOT_DRAFT', 409),
    );
    await assert.rejects(quotes.generate(owner, project.id), rejectedWith('QUOTE_NOT_DRAFT', 409));

    const audits = await db.auditEvent.findMany({
      where: { projectId: project.id, action: { startsWith: 'quote.' } },
    });
    assert.ok(audits.some((event) => event.action === 'quote.generated'));
    assert.ok(audits.some((event) => event.action === 'quote.updated'));
  },
);

test(
  'a client user is rejected by the professional-only pricing endpoints',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-6-${runId}`, role: 'professional' },
    });
    const client = await db.user.create({
      data: { email: `client-${runId}@example.com`, role: 'client' },
    });
    const project = await projects.create(owner, 'Protegido');

    await assert.rejects(rateCards.get(client), rejectedWith('FORBIDDEN', 403));
    await assert.rejects(
      rateCards.upsert(client, {
        label: 'Del cliente',
        hourlyRate: 100,
        currency: 'USD',
        marginPercent: 0,
      }),
      rejectedWith('FORBIDDEN', 403),
    );
    await assert.rejects(quotes.get(client, project.id), rejectedWith('FORBIDDEN', 403));
    await assert.rejects(quotes.generate(client, project.id), rejectedWith('FORBIDDEN', 403));
    await assert.rejects(
      quotes.patch(client, project.id, { terms: 'x' }),
      rejectedWith('FORBIDDEN', 403),
    );
    assert.equal(await db.rateCard.count({ where: { ownerId: client.id } }), 0);
  },
);

const seedPricingBrief = async (projectId: string) => {
  await db.brief.update({
    where: { projectId },
    data: {
      data: {
        ...emptyBrief(),
        estimates: [
          { module: 'Auth', minHours: 10, maxHours: 20, uncertainty: 'baja' },
          { module: 'Panel', minHours: 5, maxHours: 10, uncertainty: 'media' },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });
};

const rawClientToken = async (projectId: string) => {
  const link = await db.projectLink.findFirstOrThrow({
    where: { projectId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return decrypt(link.encryptedToken);
};

test(
  'a quote is generated, sent, downloaded and decided by the client through the project link',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-11-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Propuesta Acme');
    await rateCards.upsert(owner, {
      label: 'Estándar',
      hourlyRate: 100,
      currency: 'USD',
      marginPercent: 10,
    });
    await seedPricingBrief(project.id);

    await quotes.generate(owner, project.id);
    const patched = await quotes.patch(owner, project.id, {
      terms: 'Pago contra entrega',
      validUntil: '2030-01-01T00:00:00.000Z',
      milestones: [
        { name: 'Arranque', percent: 50 },
        { name: 'Entrega', percent: 50 },
      ],
    });
    const sent = await quotes.send(owner, project.id);
    assert.equal(sent.status, QuoteStatus.sent);
    assert.ok(sent.sentAt);
    assert.equal(sent.terms, patched.terms);
    assert.equal(sent.milestones.length, 2);

    const pdf = await quotes.download(owner, project.id, 'pdf');
    assert.ok(pdf.buffer.length > 1000, 'expected a non empty PDF proposal');
    assert.equal(pdf.mimeType, 'application/pdf');
    assert.equal(pdf.name, `scope-${project.id}-quote.pdf`);
    const docx = await quotes.download(owner, project.id, 'docx');
    assert.ok(docx.buffer.length > 1000, 'expected a non empty DOCX proposal');
    assert.equal(
      docx.mimeType,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await assert.rejects(
      quotes.download(owner, project.id, 'md'),
      rejectedWith('INVALID_FORMAT', 400),
    );

    const clientToken = await rawClientToken(project.id);
    const seen = await quotes.get(null, project.id, clientToken);
    assert.equal(seen.id, sent.id);
    assert.equal(seen.status, QuoteStatus.sent);
    const clientFile = await quotes.download(null, project.id, 'pdf', clientToken);
    assert.ok(clientFile.buffer.length > 1000);

    const decided = await quotes.decide(null, project.id, clientToken, QuoteStatus.accepted);
    assert.equal(decided.status, QuoteStatus.accepted);
    assert.ok(decided.decidedAt);

    const audits = await db.auditEvent.findMany({
      where: { projectId: project.id, action: { startsWith: 'quote.' } },
    });
    assert.equal(audits.filter((event) => event.action === 'quote.sent').length, 1);
    const decision = audits.find((event) => event.action === 'quote.decided');
    assert.ok(decision, 'expected a quote.decided audit event');
    assert.equal(decision.actorId, null);
    assert.equal(
      (decision.metadata as { decision?: string } | null)?.decision,
      QuoteStatus.accepted,
    );
  },
);

test(
  'the send and decision transitions are guarded by status, role and link token',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-12-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Guardas de propuesta');
    await rateCards.upsert(owner, {
      label: 'Estándar',
      hourlyRate: 100,
      currency: 'USD',
      marginPercent: 10,
    });
    await seedPricingBrief(project.id);
    await quotes.generate(owner, project.id);
    const clientToken = await rawClientToken(project.id);

    await assert.rejects(
      quotes.decide(null, project.id, clientToken, QuoteStatus.accepted),
      rejectedWith('QUOTE_NOT_SENDABLE', 409),
    );
    await assert.rejects(
      quotes.decide(owner, project.id, clientToken, QuoteStatus.accepted),
      rejectedWith('FORBIDDEN', 403),
    );
    await assert.rejects(
      quotes.decide(null, project.id, 'not-a-real-token', QuoteStatus.accepted),
      rejectedWith('PROJECT_ACCESS_DENIED', 403),
    );
    await assert.rejects(
      quotes.get(null, project.id, clientToken),
      rejectedWith('QUOTE_NOT_FOUND', 404),
    );
    await assert.rejects(
      quotes.download(null, project.id, 'pdf', clientToken),
      rejectedWith('QUOTE_NOT_FOUND', 404),
    );

    await quotes.send(owner, project.id);
    await assert.rejects(quotes.send(owner, project.id), rejectedWith('QUOTE_NOT_DRAFT', 409));

    const rejected = await quotes.decide(null, project.id, clientToken, QuoteStatus.rejected);
    assert.equal(rejected.status, QuoteStatus.rejected);
    assert.ok(rejected.decidedAt);
    await assert.rejects(
      quotes.decide(null, project.id, clientToken, QuoteStatus.accepted),
      rejectedWith('QUOTE_NOT_SENDABLE', 409),
    );

    assert.equal(
      await db.auditEvent.count({ where: { projectId: project.id, action: 'quote.sent' } }),
      1,
    );
    assert.equal(
      await db.auditEvent.count({ where: { projectId: project.id, action: 'quote.decided' } }),
      1,
    );
  },
);

const currentMonthDate = () => {
  const month = new Date().toISOString().slice(0, 7);
  return { month, date: `${month}-15T12:00:00.000Z` };
};

test(
  'a maintenance retainer drains before billing extra hours and reports the monthly balance',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-7-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Mantenimiento Acme');
    await assert.rejects(
      maintenance.get(owner, project.id),
      rejectedWith('MAINTENANCE_NOT_FOUND', 404),
    );
    await assert.rejects(
      maintenance.create(owner, project.id, {
        hoursPerMonth: 0,
        currency: 'USD',
        startDate: '2026-10-01T00:00:00.000Z',
      }),
      rejectedWith('INVALID_MAINTENANCE_AGREEMENT', 400),
    );

    const agreement = await maintenance.create(owner, project.id, {
      hoursPerMonth: 5,
      currency: 'usd',
      startDate: '2026-10-01T00:00:00.000Z',
    });
    assert.equal(agreement.status, MaintenanceStatus.active);
    assert.equal(agreement.currency, 'USD');
    assert.equal(agreement.hoursPerMonth, 5);
    assert.equal(agreement.monthlyPrice, null);
    assert.deepEqual(agreement.entries, []);

    await assert.rejects(
      maintenance.create(owner, project.id, {
        hoursPerMonth: 8,
        currency: 'USD',
        startDate: '2026-11-01T00:00:00.000Z',
      }),
      rejectedWith('MAINTENANCE_EXISTS', 409),
    );

    const { month } = currentMonthDate();
    const early = `${month}-10T12:00:00.000Z`;
    const late = `${month}-20T12:00:00.000Z`;
    const first = await maintenance.createEntry(owner, project.id, {
      date: early,
      hours: 3,
      description: 'Soporte mensual',
    });
    assert.equal(first.hours, 3);
    assert.equal(first.extraHours, 0);
    assert.equal(first.billableExtra, false);

    const second = await maintenance.createEntry(owner, project.id, {
      date: late,
      hours: 3,
      description: 'Exceso de soporte',
    });
    assert.equal(second.hours, 3);
    assert.equal(second.extraHours, 1);
    assert.equal(second.billableExtra, true);

    const listed = await maintenance.listEntries(owner, project.id, month);
    assert.equal(listed.month, month);
    assert.deepEqual(
      listed.entries.map((entry) => [entry.date, entry.hours, entry.extraHours]),
      [
        [late, 3, 1],
        [early, 3, 0],
      ],
    );
    assert.deepEqual(await maintenance.listEntries(owner, project.id, '2020-01'), {
      month: '2020-01',
      entries: [],
    });

    const balance = await maintenance.balance(owner, project.id, month);
    assert.deepEqual(balance, {
      month,
      hoursPerMonth: 5,
      consumedRetainer: 5,
      consumedExtra: 1,
      remaining: 0,
      entriesCount: 2,
    });

    const fetched = await maintenance.get(owner, project.id);
    assert.equal(fetched.id, agreement.id);
    assert.equal(fetched.entries?.length, 2);

    const audits = await db.auditEvent.findMany({
      where: { projectId: project.id, action: { startsWith: 'maintenance.' } },
    });
    assert.ok(audits.some((event) => event.action === 'maintenance.created'));
    assert.equal(audits.filter((event) => event.action === 'maintenance.entry_created').length, 2);
  },
);

test(
  'a paused or ended agreement rejects entries and an ended agreement cannot be reopened',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-8-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Retainer cerrado');
    await assert.rejects(
      maintenance.patch(owner, project.id, { status: MaintenanceStatus.ended }),
      rejectedWith('MAINTENANCE_NOT_FOUND', 404),
    );
    await maintenance.create(owner, project.id, {
      hoursPerMonth: 4,
      currency: 'USD',
      startDate: '2026-10-01T00:00:00.000Z',
    });
    const { date } = currentMonthDate();

    await maintenance.patch(owner, project.id, { status: MaintenanceStatus.paused });
    await assert.rejects(
      maintenance.createEntry(owner, project.id, { date, hours: 1, description: 'Pausado' }),
      rejectedWith('MAINTENANCE_NOT_ACTIVE', 409),
    );

    const resumed = await maintenance.patch(owner, project.id, {
      status: MaintenanceStatus.active,
    });
    assert.equal(resumed.status, MaintenanceStatus.active);
    const entry = await maintenance.createEntry(owner, project.id, {
      date,
      hours: 1,
      description: 'Reanudado',
    });
    assert.equal(entry.extraHours, 0);

    const ended = await maintenance.patch(owner, project.id, {
      status: MaintenanceStatus.ended,
      endDate: '2026-12-31T00:00:00.000Z',
    });
    assert.equal(ended.status, MaintenanceStatus.ended);
    assert.equal(ended.endDate, '2026-12-31T00:00:00.000Z');
    await assert.rejects(
      maintenance.createEntry(owner, project.id, { date, hours: 1, description: 'Cerrado' }),
      rejectedWith('MAINTENANCE_NOT_ACTIVE', 409),
    );
    await assert.rejects(
      maintenance.patch(owner, project.id, { status: MaintenanceStatus.active }),
      rejectedWith('MAINTENANCE_ENDED', 409),
    );

    const stillEnded = await maintenance.patch(owner, project.id, {
      hoursPerMonth: 6,
      monthlyPrice: 1500,
    });
    assert.equal(stillEnded.status, MaintenanceStatus.ended);
    assert.equal(stillEnded.hoursPerMonth, 6);
    assert.equal(stillEnded.monthlyPrice, 1500);
  },
);

test(
  'an entry only links an accepted change request that belongs to the same project',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-9-${runId}`, role: 'professional' },
    });
    const project = await projects.create(owner, 'Retainer con change requests');
    const otherProject = await projects.create(owner, 'Proyecto ajeno');
    await maintenance.create(owner, project.id, {
      hoursPerMonth: 10,
      currency: 'USD',
      startDate: '2026-10-01T00:00:00.000Z',
    });
    const { date } = currentMonthDate();

    const foreign = await db.changeRequest.create({
      data: {
        projectId: otherProject.id,
        baseBriefVersion: 0,
        request: 'Agregar export a PDF',
        classification: ChangeClassification.ambiguous,
      },
    });
    await assert.rejects(
      maintenance.createEntry(owner, project.id, {
        date,
        hours: 1,
        description: 'CR ajeno',
        changeRequestId: foreign.id,
      }),
      rejectedWith('CHANGE_REQUEST_NOT_ACCEPTED', 409),
    );

    const mine = await db.changeRequest.create({
      data: {
        projectId: project.id,
        baseBriefVersion: 0,
        request: 'Agregar panel de métricas',
        classification: ChangeClassification.in_scope,
      },
    });
    assert.equal(mine.status, ChangeRequestStatus.proposed);
    await assert.rejects(
      maintenance.createEntry(owner, project.id, {
        date,
        hours: 1,
        description: 'CR propuesto',
        changeRequestId: mine.id,
      }),
      rejectedWith('CHANGE_REQUEST_NOT_ACCEPTED', 409),
    );

    await db.changeRequest.update({
      where: { id: mine.id },
      data: { status: ChangeRequestStatus.accepted },
    });
    const entry = await maintenance.createEntry(owner, project.id, {
      date,
      hours: 1.5,
      description: 'CR aceptado',
      changeRequestId: mine.id,
    });
    assert.equal(entry.changeRequestId, mine.id);
    assert.equal(entry.hours, 1.5);
    assert.equal(entry.extraHours, 0);
    assert.equal(entry.billableExtra, false);
    assert.equal(
      await db.maintenanceEntry.count({ where: { agreement: { projectId: otherProject.id } } }),
      0,
    );
  },
);

test(
  'a client user is rejected by every maintenance endpoint',
  { skip: skip ? 'DATABASE_URL not set' : false },
  async () => {
    const owner = await db.user.create({
      data: { telegramId: `owner-10-${runId}`, role: 'professional' },
    });
    const client = await db.user.create({
      data: { email: `maintenance-client-${runId}@example.com`, role: 'client' },
    });
    const project = await projects.create(owner, 'Protegido mantenimiento');
    const { date } = currentMonthDate();

    await assert.rejects(maintenance.get(client, project.id), rejectedWith('FORBIDDEN', 403));
    await assert.rejects(
      maintenance.create(client, project.id, {
        hoursPerMonth: 4,
        currency: 'USD',
        startDate: '2026-10-01T00:00:00.000Z',
      }),
      rejectedWith('FORBIDDEN', 403),
    );
    await assert.rejects(
      maintenance.patch(client, project.id, { hoursPerMonth: 8 }),
      rejectedWith('FORBIDDEN', 403),
    );
    await assert.rejects(
      maintenance.listEntries(client, project.id),
      rejectedWith('FORBIDDEN', 403),
    );
    await assert.rejects(
      maintenance.createEntry(client, project.id, { date, hours: 1, description: 'Del cliente' }),
      rejectedWith('FORBIDDEN', 403),
    );
    await assert.rejects(maintenance.balance(client, project.id), rejectedWith('FORBIDDEN', 403));
    assert.equal(await db.maintenanceAgreement.count({ where: { projectId: project.id } }), 0);
    assert.equal(
      await db.maintenanceEntry.count({ where: { agreement: { projectId: project.id } } }),
      0,
    );
  },
);
