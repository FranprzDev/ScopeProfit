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

export async function handleMcp(request: Request, container: Container): Promise<Response> {
  const issuer = publicApiUrl();
  const resourceMetadataUrl = `${issuer}/.well-known/oauth-protected-resource`;

  const origin = request.headers.get('origin');
  const webUrl = process.env.WEB_URL;
  if (origin && origin !== new URL(issuer).origin && origin !== webUrl)
    return new Response(JSON.stringify({ error: 'invalid_origin' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return unauthorized(resourceMetadataUrl);
  let principal: McpPrincipal;
  try {
    const info = await container.provider.verifyAccessToken(match[1]);
    principal = info.extra as McpPrincipal;
  } catch {
    return unauthorized(resourceMetadataUrl);
  }
  if (!principal?.user) return unauthorized(resourceMetadataUrl);

  if (request.method !== 'POST') {
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
    return (await scopeToolContext.provider({ tools: container.tools, user: principal.user }, () =>
      transport.handleRequest(request),
    )) as Response;
  } finally {
    await transport.close().catch(() => undefined);
  }
}
