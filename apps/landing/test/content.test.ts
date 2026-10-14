import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  API_KEY_SNIPPET,
  BRIDGE_SNIPPET,
  CLAUDE_CODE_SNIPPET,
  CURL_SNIPPET,
  FAQ_ENTRIES,
  KIND_LABEL,
  MCP_ENDPOINT_PLACEHOLDER,
  MCP_DOCS_URL,
  PHOTOS,
  REPO_URL,
  SDK_SNIPPET,
  STAGES,
  STDIO_SNIPPET,
  TELEGRAM_COMMANDS,
  TELEGRAM_FAQ,
  TOOL_COUNT,
  TOOL_GROUPS,
  ToolKind,
} from '@/app/content';
import { SITE_PAGES, SITE_URL, SitePath, absoluteUrl } from '@/lib/site';

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

  test('connection snippets are non-empty and HTTP ones target the MCP endpoint placeholder', () => {
    for (const snippet of [API_KEY_SNIPPET, SDK_SNIPPET, STDIO_SNIPPET]) {
      assert.ok(snippet.trim().length > 0);
    }
    for (const snippet of [CLAUDE_CODE_SNIPPET, BRIDGE_SNIPPET, CURL_SNIPPET]) {
      assert.ok(snippet.includes(MCP_ENDPOINT_PLACEHOLDER), snippet);
    }
  });

  test('FAQ entries have a question and an answer and include the Telegram entry', () => {
    assert.ok(FAQ_ENTRIES.includes(TELEGRAM_FAQ));
    for (const entry of FAQ_ENTRIES) {
      assert.match(entry.question, /\?$/);
      assert.ok(entry.answer.trim().length > 0);
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

  test('every site path has a sitemap entry with an ISO date and a valid priority', () => {
    for (const path of Object.values(SitePath)) {
      const page = SITE_PAGES[path];
      assert.equal(page.path, path);
      assert.match(page.lastModified, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(page.priority > 0 && page.priority <= 1);
    }
  });

  test('absoluteUrl builds canonical URLs without a trailing slash', () => {
    const home = absoluteUrl(SitePath.Home);
    assert.equal(home, new URL(SITE_URL).origin);
    assert.ok(!home.endsWith('/'));
  });
});
