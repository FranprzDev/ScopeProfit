/**
 * POST /api/mcp: Streamable HTTP MCP endpoint (stateless JSON mode, like the Nest API).
 * Auth mirrors mcp-http.ts: Bearer OAuth access tokens or raw sp_live_ API keys, verified by
 * the shared ScopeProfitOAuthProvider. Each tool from apps/api's xmcp tool directory is
 * registered on an McpServer and runs inside the same scopeToolContext the API provides.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { scopeToolContext } from '../../api/src/modules/mcp/tool-context';
import { MCP_SCOPE, type McpPrincipal } from '../../api/src/modules/mcp/oauth.provider';
import { publicApiUrl } from '../../api/src/modules/mcp/export-links';
import { TOOLS } from './registry';
import { mcpRateLimiter } from './rate-limit';
import { recordUsage, type WaitUntil } from './usage';
import { isAllowedOrigin } from '../../api/src/modules/mcp/origin';
import type { Container } from './container';

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'scopeprofit', version: '1.0.0' },
    { instructions: 'ScopeProfit scope-management tools for professionals.' },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.metadata.name,
      {
        description: tool.metadata.description,
        inputSchema: tool.schema as never,
        annotations: tool.metadata.annotations as never,
      },
      tool.handler as never,
    );
  }
  return server;
}

const unauthorized = (resourceMetadataUrl: string, message = 'invalid_token') =>
  new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}", scope="${MCP_SCOPE}"`,
    },
  });

interface Peeked {
  method?: string;
  params?: { name?: string; clientInfo?: { name?: string } };
}

export async function handleMcp(
  request: Request,
  container: Container,
  ctx: WaitUntil,
): Promise<Response> {
  const issuer = publicApiUrl();
  const resourceMetadataUrl = `${issuer}/.well-known/oauth-protected-resource`;

  const rate = mcpRateLimiter().check(request.headers.get('cf-connecting-ip') ?? 'unknown');
  if (!rate.allowed) {
    recordUsage(container, ctx, request, { ok: false });
    return new Response(
      JSON.stringify({
        code: 'RATE_LIMITED',
        message: 'Too many requests; respect the RateLimit headers and retry after the window',
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(rate.retryAfterSeconds),
          'ratelimit-limit': String(rate.limit),
          'ratelimit-remaining': '0',
          'ratelimit-reset': String(rate.retryAfterSeconds),
        },
      },
    );
  }

  const origin = request.headers.get('origin');
  const webUrl = process.env.WEB_URL;
  if (!isAllowedOrigin(origin, new URL(issuer).origin, webUrl)) {
    recordUsage(container, ctx, request, { ok: false });
    return new Response(JSON.stringify({ error: 'invalid_origin' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Peek at the JSON-RPC envelope for usage labels; the transport re-reads the clone.
  const peeked = (await request
    .clone()
    .json()
    .catch(() => null)) as Peeked | null;
  const label =
    peeked?.method === 'tools/call' ? `tools/call ${peeked.params?.name ?? '?'}` : peeked?.method;
  const details = () => ({
    method: peeked?.method,
    tool: peeked?.method === 'tools/call' ? peeked.params?.name : undefined,
    clientName: peeked?.method === 'initialize' ? peeked?.params?.clientInfo?.name : undefined,
  });

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    recordUsage(container, ctx, request, { ...details(), ok: false });
    return unauthorized(resourceMetadataUrl);
  }
  let principal: McpPrincipal;
  try {
    const info = await container.provider.verifyAccessToken(match[1]);
    principal = info.extra as McpPrincipal;
  } catch {
    recordUsage(container, ctx, request, { ...details(), ok: false });
    return unauthorized(resourceMetadataUrl);
  }
  if (!principal?.user) {
    recordUsage(container, ctx, request, { ...details(), ok: false });
    return unauthorized(resourceMetadataUrl);
  }

  if (request.method !== 'POST') {
    recordUsage(container, ctx, request, {
      ...details(),
      apiKeyId: principal.apiKeyId,
      userEmail: principal.user.email,
      ok: false,
    });
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed (stateless server)' },
        id: null,
      }),
      { status: 405, headers: { 'content-type': 'application/json', allow: 'POST' } },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless JSON mode
    enableJsonResponse: true,
  });
  const server = buildServer();
  await server.connect(transport);
  try {
    const response = (await scopeToolContext.provider(
      { tools: container.tools, user: principal.user },
      () => transport.handleRequest(request),
    )) as Response;
    recordUsage(container, ctx, request, {
      ...details(),
      apiKeyId: principal.apiKeyId,
      userEmail: principal.user.email,
      ok: response.ok,
    });
    return response;
  } catch (error) {
    // Uncaught failures otherwise surface only as Cloudflare 1101s with no context in tail logs.
    console.error(
      `scopeprofit-mcp: request failed${label ? ` (${label})` : ''}: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`,
    );
    throw error;
  } finally {
    await transport.close().catch(() => undefined);
  }
}
