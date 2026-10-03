process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
process.env.TELEGRAM_AUTHORIZED_USER_IDS = process.env.TELEGRAM_AUTHORIZED_USER_IDS || '111,222';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { QuoteStatus } from '@prisma/client';
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
  parseRateCardSnapshot,
  validateQuoteLines,
  validateQuoteMilestones,
} from '../src/modules/pricing/pricing.validation';
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
