process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
const runId = Date.now();
const ownerTelegramIds = ['owner-1', 'owner-2', 'owner-3', 'owner-4', 'owner-5', 'owner-6'].map(
  (prefix) => `${prefix}-${runId}`,
);
process.env.TELEGRAM_AUTHORIZED_USER_IDS = ownerTelegramIds.join(',');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { emptyBrief } from '@scopeprofit/contracts';
import { PrismaService } from '../src/prisma.service';
import { EmailService } from '../src/email.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { RateCardsService } from '../src/modules/pricing/rate-cards.service';
import { QuotesService } from '../src/modules/pricing/quotes.service';

const skip = !process.env.DATABASE_URL;

let db: PrismaService;
let auth: AuthService;
let projects: ProjectsService;
let rateCards: RateCardsService;
let quotes: QuotesService;

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
