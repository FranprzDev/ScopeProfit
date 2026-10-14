import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { findTools } from '@/lib/tool-finder';
import { TOOL_FINDER_DEFAULT, TOOL_FINDER_EXAMPLES, TOOL_GROUPS, ToolKind } from '@/app/content';
import type { ToolGroup } from '@/app/content';

const GROUPS: ToolGroup[] = [
  {
    title: 'Alpha',
    description: 'First group',
    tools: [
      {
        name: 'export_document',
        kind: ToolKind.Read,
        text: 'Exporta el documento.',
        keywords: ['pdf'],
      },
      { name: 'list_items', kind: ToolKind.Read, text: 'Lista cosas.', keywords: ['listar'] },
    ],
  },
  {
    title: 'Beta',
    description: 'Second group',
    tools: [
      {
        name: 'archive_item',
        kind: ToolKind.Destructive,
        text: 'Archiva un elemento con documento.',
        keywords: ['archivar'],
      },
    ],
  },
];

describe('findTools', () => {
  test('returns nothing for empty, short or stopword-only queries', () => {
    assert.deepEqual(findTools('', GROUPS), []);
    assert.deepEqual(findTools('a de', GROUPS), []);
    assert.deepEqual(findTools('quiero algo para los', GROUPS), []);
  });

  test('weights keyword hits above plain text hits and keeps the group title', () => {
    const [first, second] = findTools('pdf documento', GROUPS);
    assert.equal(first.tool.name, 'export_document');
    assert.equal(first.group, 'Alpha');
    assert.equal(first.score, 4);
    assert.equal(second.tool.name, 'archive_item');
    assert.equal(second.group, 'Beta');
    assert.equal(second.score, 1);
  });

  test('ignores accents and case', () => {
    assert.equal(findTools('ARCHIVÁR', GROUPS)[0]?.tool.name, 'archive_item');
  });

  test('matches word prefixes of at least four letters only', () => {
    assert.equal(findTools('listarlos', GROUPS)[0]?.tool.name, 'list_items');
    assert.deepEqual(findTools('lis', GROUPS), []);
  });

  test('treats tool name segments as searchable text', () => {
    assert.equal(findTools('items', GROUPS)[0]?.tool.name, 'list_items');
  });

  test('respects the limit and keeps catalogue order on ties', () => {
    const matches = findTools('documento', GROUPS, 1);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].tool.name, 'export_document');
  });

  test('every example query on the landing finds at least one real tool', () => {
    for (const query of [TOOL_FINDER_DEFAULT, ...TOOL_FINDER_EXAMPLES]) {
      assert.ok(findTools(query, TOOL_GROUPS).length > 0, `no tool matches "${query}"`);
    }
  });
});
