process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
process.env.TELEGRAM_AUTHORIZED_USER_IDS = process.env.TELEGRAM_AUTHORIZED_USER_IDS || '111,222';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, hash, secureEqual, authorizedTelegramIds } from '../src/security';
import { validateBrief, validateSources } from '../src/modules/brief/brief.validation';
import { validateEditor, markdown } from '../src/modules/documents/render';
import { emptyBrief } from '@scopeprofit/contracts';
import { enforceClarificationQuestion, needsClarification } from '../src/modules/agent/jev-gate';

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
  assert.throws(() => validateEditor({ type: 'script' } as any));
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
