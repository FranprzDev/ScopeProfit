/**
 * ScopeProfit MCP worker: public entrypoint for the remote MCP server.
 * Routes: /api/mcp (MCP + bearer auth), OAuth 2.1 endpoints for ChatGPT/Claude connectors,
 * signed export downloads, /health.
 */
import { Hono } from 'hono';
import { getContainer, type WorkerEnv } from './container';
import { oauthApp } from './oauth';
import { handleMcp } from './mcp';
import { verifyExportTokenDetailed } from '../../api/src/modules/mcp/export-links';

const app = new Hono<{ Bindings: WorkerEnv }>();

app.get('/health', async (c) => {
  try {
    await getContainer(c.env).db.$queryRaw`SELECT 1`;
  } catch {
    return c.json({ ok: false, service: 'scopeprofit-mcp', database: 'unreachable' }, 503);
  }
  return c.json({ ok: true, service: 'scopeprofit-mcp', database: 'up' });
});

// Signed, expiring export downloads (same token format the Nest API verifies).
app.get('/api/exports/:token', async (c) => {
  const result = verifyExportTokenDetailed(c.req.param('token'));
  if (result.status === 'expired')
    return c.json(
      {
        code: 'EXPORT_LINK_EXPIRED',
        message:
          'This export link expired; ask the professional for a fresh export_document or export_quote link',
      },
      410,
    );
  if (result.status !== 'ok')
    return c.json({ code: 'INVALID_EXPORT_LINK', message: 'Export link is invalid' }, 404);
  const claim = result.claim;
  const { documents, quotes, db } = getContainer(c.env);
  if (claim.artifact === 'quote') {
    if (claim.format !== 'pdf' && claim.format !== 'docx')
      return c.json({ code: 'INVALID_FORMAT' }, 400);
    const file = await quotes.renderFile(claim.projectId, claim.format);
    await db.auditEvent
      .create({
        data: {
          projectId: claim.projectId,
          action: 'export.downloaded',
          result: 'success',
          metadata: { artifact: claim.artifact, version: claim.version, format: claim.format },
        },
      })
      .catch(() => undefined);
    return new Response(file.buffer as unknown as BodyInit, {
      headers: {
        'content-type': file.mimeType,
        'content-disposition': `attachment; filename="${file.name}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  const file = await documents.download(claim.projectId, claim.version, claim.format);
  await db.auditEvent
    .create({
      data: {
        projectId: claim.projectId,
        action: 'export.downloaded',
        result: 'success',
        metadata: { artifact: claim.artifact, version: claim.version, format: claim.format },
      },
    })
    .catch(() => undefined); // a failed audit write must not block the download
  return new Response(file.buffer as unknown as BodyInit, {
    headers: {
      'content-type': file.mimeType,
      'content-disposition': `attachment; filename="${file.name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
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
    void ctx;
    return app.fetch(request, env, ctx);
  },
};
