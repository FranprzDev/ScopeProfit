import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  KIND_LABEL,
  MCP_DOCS_URL,
  PHOTOS,
  REPO_URL,
  STAGES,
  TELEGRAM_COMMANDS,
  TOOL_COUNT,
  TOOL_GROUPS,
  ToolKind,
} from '@/app/content';
import { SITE_URL } from '@/lib/site';

const allTools = TOOL_GROUPS.flatMap((group) => group.tools);

describe('landing content', () => {
  test('TOOL_COUNT matches the catalogue', () => {
    assert.ok(TOOL_COUNT > 0);
    assert.equal(TOOL_COUNT, allTools.length);
  });

  test('tool names are unique snake_case identifiers with copy and keywords', () => {
    const names = allTools.map((tool) => tool.name);
    assert.equal(new Set(names).size, names.length);
    for (const tool of allTools) {
      assert.match(tool.name, /^[a-z]+(_[a-z]+)*$/);
      assert.ok(tool.text.trim().length > 0, `${tool.name} has no text`);
      assert.ok(tool.keywords.length > 0, `${tool.name} has no keywords`);
    }
  });

  test('every tool kind has a label', () => {
    for (const kind of Object.values(ToolKind)) {
      assert.ok(KIND_LABEL[kind], `missing label for ${kind}`);
    }
  });

  test('stages only reference tools that exist in the catalogue', () => {
    const names = new Set(allTools.map((tool) => tool.name));
    for (const stage of STAGES) {
      for (const tool of stage.tools) assert.ok(names.has(tool), `unknown tool ${tool}`);
    }
  });

  test('photo credits point at bundled files and a public source page', () => {
    for (const photo of Object.values(PHOTOS)) {
      assert.match(photo.file, /^\/images\/.+\.(jpg|png|webp)$/);
      assert.ok(existsSync(join(process.cwd(), 'public', photo.file)), `${photo.file} is missing`);
      assert.ok(photo.alt.length > 0);
      assert.ok(photo.license.length > 0);
      assert.equal(new URL(photo.page).protocol, 'https:');
    }
  });

  test('links and Telegram commands are well formed', () => {
    assert.ok(MCP_DOCS_URL.startsWith(REPO_URL));
    for (const command of TELEGRAM_COMMANDS) assert.match(command, /^\/[a-z]+$/);
  });
});

describe('site configuration', () => {
  test('SITE_URL is an absolute http(s) origin used for metadata', () => {
    const url = new URL(SITE_URL);
    assert.match(url.protocol, /^https?:$/);
    assert.equal(url.pathname, '/');
  });
});
