#!/usr/bin/env node
/**
 * Production smoke test for a deployed ScopeProfit MCP instance.
 *
 * Complements `pnpm run production:preflight` (which validates variable
 * format) with live connectivity checks against a real deployment:
 *
 *   1. Health endpoint (Nest API: /api/health, Cloudflare Worker: /health).
 *   2. OAuth 2.1 authorization-server discovery document.
 *   3. OAuth protected-resource metadata for the /api/mcp resource.
 *   4. An unauthenticated POST to /api/mcp is rejected (401).
 *   5. With SCOPEPROFIT_API_KEY set: MCP initialize + tools/list (20 tools).
 *
 * Usage:
 *   node scripts/smoke-production.mjs --url https://api.example.com
 *   PUBLIC_API_URL=https://api.example.com node scripts/smoke-production.mjs
 *   SCOPEPROFIT_API_KEY=sp_live_... node scripts/smoke-production.mjs --url https://api.example.com
 *
 * Exit code 0 when every check passes, 1 otherwise. Read-only: it never
 * creates, updates or deletes project data.
 */

const argUrlIndex = process.argv.indexOf('--url');
const baseUrl = (
  argUrlIndex >= 0 ? process.argv[argUrlIndex + 1] : process.env.PUBLIC_API_URL || ''
).replace(/\/+$/, '');
const apiKey = process.env.SCOPEPROFIT_API_KEY || '';
const EXPECTED_TOOL_COUNT = 20;

if (!/^https:\/\//.test(baseUrl)) {
  process.stderr.write(
    'Usage: node scripts/smoke-production.mjs --url https://api.example.com\n' +
      'The URL must be the public HTTPS origin of the API (or set PUBLIC_API_URL).\n',
  );
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
};

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body };
}

async function postMcp(body, headers = {}) {
  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    const dataLine = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .pop();
    if (dataLine) {
      try {
        json = JSON.parse(dataLine.slice(5).trim());
      } catch {
        /* unparseable SSE */
      }
    }
  }
  return { status: res.status, json, sessionId: res.headers.get('mcp-session-id') };
}

// 1. Health: the Nest API serves /api/health, the Cloudflare Worker serves /health.
let healthy = false;
let healthDetail = '';
for (const path of ['/api/health', '/health']) {
  try {
    const { status, body } = await getJson(`${baseUrl}${path}`);
    if (status === 200 && body && (body.ok === true || body.status === 'ok')) {
      healthy = true;
      healthDetail = `${path} → 200`;
      break;
    }
    healthDetail = `${path} → ${status}`;
  } catch (error) {
    healthDetail = `${path} → ${error.message}`;
  }
}
check('health endpoint responds ok', healthy, healthDetail);

// 2. OAuth authorization-server discovery.
try {
  const { status, body } = await getJson(`${baseUrl}/.well-known/oauth-authorization-server`);
  const valid =
    status === 200 &&
    body &&
    typeof body.issuer === 'string' &&
    typeof body.token_endpoint === 'string';
  check(
    'OAuth authorization-server discovery',
    Boolean(valid),
    valid ? `issuer ${body.issuer}` : `HTTP ${status}`,
  );
} catch (error) {
  check('OAuth authorization-server discovery', false, error.message);
}

// 3. Protected-resource metadata (Nest: /api/mcp suffix form, Worker: root form).
let prmOk = false;
let prmDetail = '';
for (const path of [
  '/.well-known/oauth-protected-resource/api/mcp',
  '/.well-known/oauth-protected-resource',
]) {
  try {
    const { status, body } = await getJson(`${baseUrl}${path}`);
    if (status === 200 && body && typeof body.resource === 'string') {
      prmOk = true;
      prmDetail = `resource ${body.resource}`;
      break;
    }
    prmDetail = `${path} → ${status}`;
  } catch (error) {
    prmDetail = `${path} → ${error.message}`;
  }
}
check('OAuth protected-resource metadata', prmOk, prmDetail);

// 4. Unauthenticated MCP access is rejected.
try {
  const { status } = await postMcp({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'scopeprofit-smoke', version: '1.0' },
    },
  });
  check('unauthenticated /api/mcp is rejected', status === 401, `HTTP ${status}`);
} catch (error) {
  check('unauthenticated /api/mcp is rejected', false, error.message);
}

// 5. Authenticated MCP handshake and tool listing (only with a key).
if (apiKey) {
  const auth = { authorization: `Bearer ${apiKey}` };
  try {
    const init = await postMcp(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'scopeprofit-smoke', version: '1.0' },
        },
      },
      auth,
    );
    const initOk = init.status === 200 && init.json && init.json.result;
    check('MCP initialize with API key', Boolean(initOk), `HTTP ${init.status}`);
    if (initOk) {
      const sessionHeaders = init.sessionId ? { 'mcp-session-id': init.sessionId } : {};
      const list = await postMcp(
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { ...auth, ...sessionHeaders },
      );
      const tools = list.json?.result?.tools;
      check(
        'MCP tools/list returns the 20 tools',
        Array.isArray(tools) && tools.length === EXPECTED_TOOL_COUNT,
        Array.isArray(tools) ? `${tools.length} tools` : `HTTP ${list.status}`,
      );
    }
  } catch (error) {
    check('MCP initialize with API key', false, error.message);
  }
} else {
  process.stdout.write('SKIP authenticated checks (set SCOPEPROFIT_API_KEY to enable)\n');
}

const failed = results.filter((r) => !r.ok);
process.stdout.write(
  failed.length === 0
    ? `\nProduction smoke passed (${results.length} checks) against ${baseUrl}\n`
    : `\nProduction smoke FAILED: ${failed.length}/${results.length} checks failed against ${baseUrl}\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
