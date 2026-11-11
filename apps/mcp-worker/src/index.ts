/**
 * ScopeProfit MCP worker: public entrypoint for the remote MCP server.
 * Routes: /api/mcp (MCP + bearer auth), OAuth 2.1 endpoints for ChatGPT/Claude connectors,
 * signed export downloads, /health.
 */
import { Hono } from 'hono';
import { getContainer, type WorkerEnv } from './container';
import { oauthApp } from './oauth';
import { handleMcp } from './mcp';
import { verifyExportToken } from '../../api/src/modules/mcp/export-links';

const app = new Hono<{ Bindings: WorkerEnv }>();

app.get('/health', (c) => c.json({ ok: true, service: 'scopeprofit-mcp' }));

// Signed, expiring export downloads (same token format the Nest API verifies).
app.get('/api/exports/:token', async (c) => {
  const claim = verifyExportToken(c.req.param('token'));
  if (!claim)
    return c.json({ code: 'INVALID_EXPORT_LINK', message: 'Export link is invalid or expired' }, 404);
  const { documents, quotes } = getContainer(c.env);
  if (claim.artifact === 'quote') {
    if (claim.format !== 'pdf' && claim.format !== 'docx')
      return c.json({ code: 'INVALID_FORMAT' }, 400);
    const file = await quotes.renderFile(claim.projectId, claim.format);
    return new Response(file.buffer as unknown as BodyInit, {
      headers: {
        'content-type': file.mimeType,
        'content-disposition': `attachment; filename="${file.name}"`,
        'cache-control': 'private, no-store',
      },
    });
  }
  const file = await documents.download(claim.projectId, claim.version, claim.format);
  return new Response(file.buffer as unknown as BodyInit, {
    headers: {
      'content-type': file.mimeType,
      'content-disposition': `attachment; filename="${file.name}"`,
      'cache-control': 'private, no-store',
    },
  });
});

app.all('/api/mcp', (c) => handleMcp(c.req.raw, getContainer(c.env)));

app.route('/', oauthApp());

export default {
  fetch(request: Request, env: WorkerEnv, ctx: import('hono').ExecutionContext) {
    // Keep process.env (read by the shared api code) aligned with this request's bindings.
    process.env.DATABASE_URL = env.DATABASE_URL;
    process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY;
    process.env.PUBLIC_API_URL = env.PUBLIC_API_URL;
    if (env.WEB_URL) process.env.WEB_URL = env.WEB_URL;
    if (env.BREVO_API_KEY) process.env.BREVO_API_KEY = env.BREVO_API_KEY;
    if (env.BREVO_SENDER_EMAIL) process.env.BREVO_SENDER_EMAIL = env.BREVO_SENDER_EMAIL;
    if (env.BREVO_SENDER_NAME) process.env.BREVO_SENDER_NAME = env.BREVO_SENDER_NAME;
    void ctx;
    return app.fetch(request, env, ctx);
  },
};
