process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
process.env.TELEGRAM_AUTHORIZED_USER_IDS = process.env.TELEGRAM_AUTHORIZED_USER_IDS || '111,222';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { MaintenanceStatus, QuoteStatus } from '@prisma/client';
import { encrypt, decrypt, hash, secureEqual, authorizedTelegramIds } from '../src/security';
import { validateBrief, validateSources } from '../src/modules/brief/brief.validation';
import { validateEditor, markdown } from '../src/modules/documents/render';
import { emptyBrief } from '@scopeprofit/contracts';
import { diffBrief } from '../src/modules/brief/brief-diff';
import { enforceClarificationQuestion, needsClarification } from '../src/modules/agent/jev-gate';
import {
  computeQuoteTotals,
  effectiveHourlyRate,
  round2,
} from '../src/modules/pricing/pricing.calc';
import {
  assertDraftQuote,
  assertSentQuote,
  parseRateCardSnapshot,
  validateQuoteLines,
  validateQuoteMilestones,
} from '../src/modules/pricing/pricing.validation';
import {
  buildQuoteProposal,
  formatDate,
  proposalMarkdown,
  statusLabel,
  type QuoteProposalSource,
} from '../src/modules/documents/render-quote';
import { computeBalance, computeEntrySplit } from '../src/modules/maintenance/maintenance.calc';
import {
  assertMaintenanceActive,
  assertReopenable,
  monthRange,
  validateEntryInput,
} from '../src/modules/maintenance/maintenance.validation';
import type { TiptapNode } from '@scopeprofit/contracts';

test('Jev clarification threshold routes uncertain briefs to the LLM', () => {
  assert.equal(needsClarification(0.5), true);
  assert.equal(needsClarification(0.49), false);
});

test('the Jev-positive path requires exactly one new clarification question', () => {
  const brief = {
    ...emptyBrief(),
    questions: [
      { id: 'old', question: '¿Qué alcance?', reason: 'scope', blocksEstimate: true },
      { id: 'new', question: '¿Qué plazo?', reason: 'timeline', blocksEstimate: true },
    ],
  };
  const result = enforceClarificationQuestion(brief, [brief.questions[0]], true);
  assert.deepEqual(result.questions, [brief.questions[0], brief.questions[1]]);
  assert.throws(() => enforceClarificationQuestion(brief, [], true), /QUESTION_COUNT_INVALID/);
});

test('the Jev-negative path removes accidental new questions', () => {
  const brief = {
    ...emptyBrief(),
    questions: [{ id: 'new', question: '¿Qué plazo?', reason: 'timeline', blocksEstimate: true }],
  };
  assert.deepEqual(enforceClarificationQuestion(brief, [], false).questions, []);
});

test('encrypt/decrypt round trip', () => {
  const secret = 'AIzaSyExampleKeyValue1234567890';
  const encrypted = encrypt(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decrypt(encrypted), secret);
});

test('hash is deterministic and secureEqual works', () => {
  assert.equal(hash('a'), hash('a'));
  assert.notEqual(hash('a'), hash('b'));
  assert.ok(secureEqual(hash('a'), hash('a')));
  assert.ok(!secureEqual(hash('a'), hash('b')));
});

test('authorizedTelegramIds parses env list', () => {
  assert.deepEqual(authorizedTelegramIds(), ['111', '222']);
});

test('validateBrief rejects an inconsistent estimate range', () => {
  const brief = {
    ...emptyBrief(),
    estimates: [{ module: 'Auth', minHours: 10, maxHours: 5, uncertainty: 'n/a' }],
  };
  assert.throws(() => validateBrief(brief));
});

test('validateBrief accepts a well-formed brief', () => {
  const brief = {
    ...emptyBrief(),
    summary: 'Resumen',
    estimates: [{ module: 'Auth', minHours: 5, maxHours: 10, uncertainty: 'SSO' }],
  };
  const result = validateBrief(brief);
  assert.equal(result.summary, 'Resumen');
});

test('validateSources rejects a requirement without a matching citation', () => {
  const messageId = '11111111-1111-1111-1111-111111111111';
  const brief = {
    ...emptyBrief(),
    requirements: [
      {
        id: 'R1',
        description: 'x',
        type: 'functional' as const,
        priority: 'must' as const,
        source: 'no existe',
        sourceMessageId: messageId,
        systemNote: '',
      },
    ],
  };
  assert.throws(() =>
    validateSources(brief, [{ id: messageId, content: 'el cliente dijo otra cosa' }]),
  );
});

test('validateSources accepts a requirement with an exact textual citation', () => {
  const messageId = '11111111-1111-1111-1111-111111111111';
  const brief = {
    ...emptyBrief(),
    requirements: [
      {
        id: 'R1',
        description: 'x',
        type: 'functional' as const,
        priority: 'must' as const,
        source: 'necesito un login',
        sourceMessageId: messageId,
        systemNote: '',
      },
    ],
  };
  assert.doesNotThrow(() =>
    validateSources(brief, [{ id: messageId, content: 'hola, necesito un login para el sistema' }]),
  );
});

test('validateEditor rejects a disallowed node type', () => {
  assert.throws(() => validateEditor({ type: 'script' } as TiptapNode));
});

test('validateEditor accepts a minimal valid document', () => {
  assert.doesNotThrow(() =>
    validateEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hola' }] }],
    }),
  );
});

test('markdown renders the fixed 7.1 sections', () => {
  const text = markdown({
    projectName: 'Demo',
    clientName: 'Cliente',
    author: 'Autor',
    date: new Date().toISOString(),
    version: 1,
    brief: emptyBrief(),
    editorContent: null,
  });
  for (const heading of [
    'Resumen ejecutivo',
    'Requerimientos identificados',
    'Preguntas pendientes',
    'Riesgos y ambigüedades',
    'Alcance',
    'Estimación',
    'Próximos pasos',
  ]) {
    assert.ok(text.includes(heading), `expected markdown to include "${heading}"`);
  }
});

test('diffBrief reports added, removed, and changed entries', () => {
  const before = {
    ...emptyBrief(),
    summary: 'Antes',
    included: ['login'],
    excluded: ['mobile'],
  };
  const after = {
    ...before,
    summary: 'Después',
    included: ['login', 'dashboard'],
    excluded: [],
  };
  assert.deepEqual(
    diffBrief(before, after).map(({ key, kind }) => ({ key, kind })),
    [
      { key: 'excluded.mobile', kind: 'removed' },
      { key: 'included.dashboard', kind: 'added' },
      { key: 'summary', kind: 'changed' },
    ],
  );
});

const quoteRateCard = { hourlyRate: 100, marginPercent: 10, currency: 'USD' };

test('the effective hourly rate applies the margin without float drift', () => {
  assert.equal(effectiveHourlyRate({ hourlyRate: 100, marginPercent: 10 }), 110);
  assert.equal(effectiveHourlyRate({ hourlyRate: 50, marginPercent: 0 }), 50);
  assert.equal(effectiveHourlyRate({ hourlyRate: 19.99, marginPercent: 15 }), 22.99);
  assert.equal(round2(22.99 * 3), 68.97);
});

test('computeQuoteTotals prices every line and sums subtotal and total', () => {
  const totals = computeQuoteTotals(
    [
      { module: 'Auth', minHours: 10, maxHours: 20 },
      { module: 'Panel', minHours: 0, maxHours: 5 },
    ],
    quoteRateCard,
  );
  assert.equal(totals.hourlyRate, 110);
  assert.equal(totals.currency, 'USD');
  assert.deepEqual(
    totals.lines.map((line) => [line.hourlyRate, line.priceMin, line.priceMax]),
    [
      [110, 1100, 2200],
      [110, 0, 550],
    ],
  );
  assert.equal(totals.subtotalMin, 1100);
  assert.equal(totals.subtotalMax, 2750);
  assert.equal(totals.totalMin, totals.subtotalMin);
  assert.equal(totals.totalMax, totals.subtotalMax);
});

test('computeQuoteTotals rounds prices and totals deterministically', () => {
  const totals = computeQuoteTotals([{ module: 'X', minHours: 3, maxHours: 7 }], {
    hourlyRate: 19.99,
    marginPercent: 15,
    currency: 'ARS',
  });
  assert.equal(totals.hourlyRate, 22.99);
  assert.equal(totals.lines[0].priceMin, 68.97);
  assert.equal(totals.lines[0].priceMax, 160.93);
  assert.equal(totals.subtotalMin, 68.97);
  assert.equal(totals.totalMax, 160.93);
});

test('an empty quote or an inverted hour range is rejected', () => {
  assert.throws(
    () => computeQuoteTotals([{ module: 'Auth', minHours: 10, maxHours: 5 }], quoteRateCard),
    /INVALID_QUOTE_LINE/,
  );
  assert.throws(
    () => validateQuoteLines([{ module: 'Auth', minHours: 10, maxHours: 5 }]),
    /INVALID_QUOTE_LINE/,
  );
  assert.throws(
    () => validateQuoteLines([{ module: '   ', minHours: 1, maxHours: 2 }]),
    /INVALID_QUOTE_LINE/,
  );
  assert.throws(() => validateQuoteLines([]), /INVALID_QUOTE_LINE/);
  assert.deepEqual(validateQuoteLines([{ module: ' Auth ', minHours: 10.4, maxHours: 20.6 }]), [
    { module: 'Auth', minHours: 10, maxHours: 21 },
  ]);
});

test('milestone percentages must add up to 100', () => {
  assert.deepEqual(
    validateQuoteMilestones([
      { name: 'Arranque', percent: 40 },
      { name: 'Entrega', percent: 60 },
    ]),
    [
      { name: 'Arranque', percent: 40, amount: null },
      { name: 'Entrega', percent: 60, amount: null },
    ],
  );
  assert.throws(
    () =>
      validateQuoteMilestones([
        { name: 'Arranque', percent: 50 },
        { name: 'Entrega', percent: 40 },
      ]),
    /INVALID_MILESTONES/,
  );
  assert.throws(
    () =>
      validateQuoteMilestones([
        { name: 'Arranque', percent: 100 },
        { name: 'Entrega', amount: 1000 },
      ]),
    /INVALID_MILESTONES/,
  );
  assert.throws(
    () => validateQuoteMilestones([{ name: 'Arranque', percent: 100 }, { name: 'Entrega' }]),
    /INVALID_MILESTONES/,
  );
});

test('milestone amounts must be strictly positive', () => {
  assert.deepEqual(validateQuoteMilestones([{ name: 'Único', amount: 1500 }]), [
    { name: 'Único', percent: null, amount: 1500 },
  ]);
  assert.deepEqual(validateQuoteMilestones([]), []);
  assert.throws(() => validateQuoteMilestones([{ name: 'A', amount: -100 }]), /INVALID_MILESTONES/);
  assert.throws(() => validateQuoteMilestones([{ name: 'A', amount: 0 }]), /INVALID_MILESTONES/);
});

test('only a draft quote can be patched', () => {
  assert.doesNotThrow(() => assertDraftQuote(QuoteStatus.draft));
  for (const status of [QuoteStatus.sent, QuoteStatus.accepted, QuoteStatus.rejected]) {
    assert.throws(
      () => assertDraftQuote(status),
      (err: unknown) =>
        err instanceof HttpException &&
        err.getStatus() === 409 &&
        err.message === 'QUOTE_NOT_DRAFT',
    );
  }
});

test('parseRateCardSnapshot reads a snapshot and rejects malformed ones', () => {
  assert.deepEqual(parseRateCardSnapshot({ hourlyRate: 100, marginPercent: 10, currency: 'USD' }), {
    hourlyRate: 100,
    marginPercent: 10,
    currency: 'USD',
  });
  assert.equal(parseRateCardSnapshot(null), null);
  assert.equal(
    parseRateCardSnapshot({ hourlyRate: 100, marginPercent: 150, currency: 'USD' }),
    null,
  );
  assert.equal(parseRateCardSnapshot({ hourlyRate: 0, marginPercent: 10, currency: 'USD' }), null);
});

const proposalContext = {
  projectName: 'Portal de clientes',
  clientName: 'cliente@acme.com',
  author: 'profesional@scope.test',
  date: '2026-10-03T09:15:00.000Z',
};

const proposalSource = (overrides: Partial<QuoteProposalSource> = {}): QuoteProposalSource => ({
  id: 'quote-1',
  projectId: 'project-1',
  status: QuoteStatus.sent,
  currency: 'USD',
  subtotalMin: 1650,
  subtotalMax: 3300,
  totalMin: 1650,
  totalMax: 3300,
  validUntil: '2030-01-01T00:00:00.000Z',
  terms: 'Pago contra entrega',
  rateCardSnapshot: {
    id: 'rate-1',
    label: 'Estándar',
    hourlyRate: 100,
    marginPercent: 10,
    currency: 'USD',
    isDefault: true,
    capturedAt: '2026-10-01T12:00:00.000Z',
  },
  sentAt: null,
  decidedAt: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  lines: [
    {
      id: 'line-1',
      quoteId: 'quote-1',
      module: 'Auth',
      minHours: 10,
      maxHours: 20,
      hourlyRate: 110,
      priceMin: 1100,
      priceMax: 2200,
      position: 0,
    },
    {
      id: 'line-2',
      quoteId: 'quote-1',
      module: 'Panel',
      minHours: 5,
      maxHours: 10,
      hourlyRate: 110,
      priceMin: 550,
      priceMax: 1100,
      position: 1,
    },
  ],
  milestones: [],
  ...overrides,
});

test('the proposal mapping prices lines, keeps totals and snapshots the rate card', () => {
  const input = buildQuoteProposal(proposalSource(), proposalContext);
  assert.equal(input.projectName, 'Portal de clientes');
  assert.equal(input.clientName, 'cliente@acme.com');
  assert.equal(input.author, 'profesional@scope.test');
  assert.equal(input.date, '2026-10-03');
  assert.equal(input.validUntil, '2030-01-01');
  assert.equal(input.status, QuoteStatus.sent);
  assert.equal(input.currency, 'USD');
  assert.deepEqual(
    input.lines.map((line) => [line.module, line.hours, line.hourlyRate, line.price]),
    [
      ['Auth', '10–20 h', '110.00 USD', '1,100.00 – 2,200.00 USD'],
      ['Panel', '5–10 h', '110.00 USD', '550.00 – 1,100.00 USD'],
    ],
  );
  assert.equal(input.subtotal, '1,650.00 – 3,300.00 USD');
  assert.equal(input.total, '1,650.00 – 3,300.00 USD');
  assert.equal(input.terms, 'Pago contra entrega');
  assert.deepEqual(input.rateCard, {
    label: 'Estándar',
    baseRate: '100.00 USD',
    marginPercent: 10,
    effectiveRate: '110.00 USD',
    capturedAt: '2026-10-01',
  });
});

test('the proposal mapping renders percent and amount milestones', () => {
  const percent = buildQuoteProposal(
    proposalSource({
      milestones: [
        { id: 'm1', quoteId: 'quote-1', name: 'Arranque', percent: 40, amount: null, position: 0 },
        { id: 'm2', quoteId: 'quote-1', name: 'Entrega', percent: 60, amount: null, position: 1 },
      ],
    }),
    proposalContext,
  );
  assert.deepEqual(
    percent.milestones.map((milestone) => [milestone.name, milestone.detail]),
    [
      ['Arranque', '40 % — 660.00 – 1,320.00 USD'],
      ['Entrega', '60 % — 990.00 – 1,980.00 USD'],
    ],
  );

  const amount = buildQuoteProposal(
    proposalSource({
      milestones: [
        { id: 'm3', quoteId: 'quote-1', name: 'Único', percent: null, amount: 1500, position: 0 },
      ],
    }),
    proposalContext,
  );
  assert.deepEqual(amount.milestones, [{ name: 'Único', detail: '1,500.00 USD' }]);
});

test('the proposal markdown includes the commercial sections and the client data', () => {
  const text = proposalMarkdown(
    buildQuoteProposal(
      proposalSource({
        milestones: [
          {
            id: 'm1',
            quoteId: 'quote-1',
            name: 'Arranque',
            percent: 50,
            amount: null,
            position: 0,
          },
          { id: 'm2', quoteId: 'quote-1', name: 'Entrega', percent: 50, amount: null, position: 1 },
        ],
      }),
      proposalContext,
    ),
  );
  for (const expected of [
    '# Propuesta comercial — Portal de clientes',
    'Cliente: cliente@acme.com',
    'Estado: Enviada',
    'Moneda: USD',
    '## Detalle por módulo',
    'Total estimado: 1,650.00 – 3,300.00 USD',
    '## Hitos de pago',
    '- Arranque: 50 % — 825.00 – 1,650.00 USD',
    '## Condiciones',
    '- Validez de la oferta: 2030-01-01',
    '- Términos y condiciones: Pago contra entrega',
    '## Tarifa aplicada',
    '- Estándar: 100.00 USD/h + 10 % de margen → 110.00 USD/h',
    '- Tarifa capturada el 2026-10-01',
  ])
    assert.ok(text.includes(expected), `expected the proposal to include "${expected}"`);
});

test('the proposal markdown falls back when terms, validity, milestones or rate card are missing', () => {
  const text = proposalMarkdown(
    buildQuoteProposal(
      proposalSource({ terms: null, validUntil: null, milestones: [], rateCardSnapshot: null }),
      proposalContext,
    ),
  );
  for (const expected of [
    '- Validez de la oferta: Sin vencimiento',
    '- Términos y condiciones: Sin condiciones adicionales.',
    '- Sin hitos de pago definidos',
    '- Sin tarifa asociada',
    'Estado: Enviada',
  ])
    assert.ok(text.includes(expected), `expected the proposal to include "${expected}"`);
  const draft = proposalMarkdown(
    buildQuoteProposal(proposalSource({ status: QuoteStatus.draft }), proposalContext),
  );
  assert.ok(draft.includes('Estado: Borrador'));
});

test('proposal dates are rendered as ISO calendar days', () => {
  assert.equal(formatDate('2030-01-01T00:00:00.000Z'), '2030-01-01');
  assert.equal(formatDate('2026-12-31'), '2026-12-31');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(undefined), '—');
  assert.equal(formatDate('mañana'), '—');
  assert.equal(statusLabel(QuoteStatus.draft), 'Borrador');
  assert.equal(statusLabel(QuoteStatus.accepted), 'Aceptada');
  assert.equal(statusLabel(QuoteStatus.rejected), 'Rechazada');
});

test('only a sent quote accepts a client decision', () => {
  assert.doesNotThrow(() => assertSentQuote(QuoteStatus.sent));
  for (const status of [QuoteStatus.draft, QuoteStatus.accepted, QuoteStatus.rejected]) {
    assert.throws(
      () => assertSentQuote(status),
      (err: unknown) =>
        err instanceof HttpException &&
        err.getStatus() === 409 &&
        err.message === 'QUOTE_NOT_SENDABLE',
    );
  }
});

const maintenanceFailure = (code: string, status: number) => (error: unknown) =>
  error instanceof HttpException && error.message === code && error.getStatus() === status;

test('computeEntrySplit drains the retainer before billing extra hours', () => {
  assert.deepEqual(computeEntrySplit(3, 10), {
    fromRetainer: 3,
    extraHours: 0,
    billableExtra: false,
  });
  assert.deepEqual(computeEntrySplit(3, 2), {
    fromRetainer: 2,
    extraHours: 1,
    billableExtra: true,
  });
  assert.deepEqual(computeEntrySplit(3, 0), {
    fromRetainer: 0,
    extraHours: 3,
    billableExtra: true,
  });
  assert.deepEqual(computeEntrySplit(5, 5), {
    fromRetainer: 5,
    extraHours: 0,
    billableExtra: false,
  });
  assert.deepEqual(computeEntrySplit(1.5, 1.25), {
    fromRetainer: 1.25,
    extraHours: 0.25,
    billableExtra: true,
  });
});

test('computeBalance mixes retainer and extra consumption and rounds to two decimals', () => {
  assert.deepEqual(
    computeBalance(
      [
        { hours: 2, extraHours: 0 },
        { hours: 3, extraHours: 1 },
      ],
      5,
    ),
    { hoursPerMonth: 5, consumedRetainer: 4, consumedExtra: 1, remaining: 1, entriesCount: 2 },
  );
  assert.deepEqual(
    computeBalance(
      [
        { hours: 1.05, extraHours: 0 },
        { hours: 2.5, extraHours: 0.25 },
      ],
      4,
    ),
    {
      hoursPerMonth: 4,
      consumedRetainer: 3.3,
      consumedExtra: 0.25,
      remaining: 0.7,
      entriesCount: 2,
    },
  );
});

test('computeBalance clamps the remaining hours at zero', () => {
  const totals = computeBalance([{ hours: 10, extraHours: 4 }], 4);
  assert.equal(totals.consumedRetainer, 6);
  assert.equal(totals.consumedExtra, 4);
  assert.equal(totals.remaining, 0);
});

test('computeBalance without entries reports the full monthly allowance', () => {
  assert.deepEqual(computeBalance([], 8), {
    hoursPerMonth: 8,
    consumedRetainer: 0,
    consumedExtra: 0,
    remaining: 8,
    entriesCount: 0,
  });
});

test('only an active agreement accepts new maintenance entries', () => {
  assert.doesNotThrow(() => assertMaintenanceActive(MaintenanceStatus.active));
  for (const status of [MaintenanceStatus.paused, MaintenanceStatus.ended]) {
    assert.throws(
      () => assertMaintenanceActive(status),
      maintenanceFailure('MAINTENANCE_NOT_ACTIVE', 409),
    );
  }
});

test('an ended agreement cannot be reopened through a status patch', () => {
  assert.throws(
    () => assertReopenable(MaintenanceStatus.ended, MaintenanceStatus.active),
    maintenanceFailure('MAINTENANCE_ENDED', 409),
  );
  assert.throws(
    () => assertReopenable(MaintenanceStatus.ended, MaintenanceStatus.paused),
    maintenanceFailure('MAINTENANCE_ENDED', 409),
  );
  assert.doesNotThrow(() => assertReopenable(MaintenanceStatus.ended, MaintenanceStatus.ended));
  assert.doesNotThrow(() => assertReopenable(MaintenanceStatus.ended));
  assert.doesNotThrow(() => assertReopenable(MaintenanceStatus.active, MaintenanceStatus.ended));
  assert.doesNotThrow(() => assertReopenable(MaintenanceStatus.paused, MaintenanceStatus.active));
});

test('validateEntryInput enforces positive two-decimal hours and a real description', () => {
  const base = { date: '2026-10-05T10:00:00.000Z', hours: 1.5, description: 'Soporte' };
  const parsed = validateEntryInput(base);
  assert.equal(parsed.hours, 1.5);
  assert.equal(parsed.description, 'Soporte');
  assert.equal(validateEntryInput({ ...base, description: '  Soporte  ' }).description, 'Soporte');
  assert.throws(
    () => validateEntryInput({ ...base, hours: 1.235 }),
    maintenanceFailure('INVALID_MAINTENANCE_ENTRY', 400),
  );
  assert.throws(
    () => validateEntryInput({ ...base, hours: 0 }),
    maintenanceFailure('INVALID_MAINTENANCE_ENTRY', 400),
  );
  assert.throws(
    () => validateEntryInput({ ...base, description: '   ' }),
    maintenanceFailure('INVALID_MAINTENANCE_ENTRY', 400),
  );
  assert.throws(
    () => validateEntryInput({ ...base, date: 'mañana' }),
    maintenanceFailure('INVALID_MAINTENANCE_ENTRY', 400),
  );
  assert.throws(
    () => validateEntryInput({ ...base, changeRequestId: 'not-a-uuid' }),
    maintenanceFailure('INVALID_MAINTENANCE_ENTRY', 400),
  );
});

test('monthRange resolves UTC month boundaries and defaults to the current month', () => {
  const february = monthRange('2026-02');
  assert.equal(february.month, '2026-02');
  assert.equal(february.start.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(february.end.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(monthRange().month, new Date().toISOString().slice(0, 7));
  for (const month of ['2026-13', '2026-00', 'feb-2026', '2026-2']) {
    assert.throws(() => monthRange(month), maintenanceFailure('INVALID_MONTH', 400));
  }
});
