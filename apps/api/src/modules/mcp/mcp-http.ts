import type { INestApplication } from '@nestjs/common';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { PrismaService } from '../../prisma.service';
import { ApiKeysService } from './api-keys.service';
import { MCP_SCOPE, McpPrincipal, ScopeProfitOAuthProvider } from './oauth.provider';
import { consentPage, verifyConsent } from './oauth-consent';
import { ScopeToolsService } from './scope-tools.service';
import { createScopeMcpServer } from './mcp-server';
import { publicApiUrl } from './export-links';

export const MCP_PATH = '/api/mcp';

const OAUTH_POST_PATHS = ['/authorize', '/token', '/register', '/revoke', '/oauth/consent'];

/**
 * True for the MCP and OAuth endpoints. They authenticate with bearer tokens, API keys or a
 * signed consent payload (never session cookies) and are called from MCP clients and from the
 * consent form served on the API origin, so the cookie-oriented CSRF origin check must skip them.
 */
export function isMcpRoute(path: string) {
  const base = new URL(publicApiUrl()).pathname.replace(/\/+$/, '');
  return path === MCP_PATH || OAUTH_POST_PATHS.some((route) => path === `${base}${route}`);
}

/**
 * Mounts the remote MCP endpoint (Streamable HTTP, stateless JSON mode) and the OAuth 2.1
 * endpoints ChatGPT/Claude connectors need. Plain `Authorization: Bearer sp_live_...` API keys
 * are accepted on the same endpoint for agents and SDKs that can send headers.
 */
export function mountMcp(app: INestApplication) {
  const db = app.get(PrismaService);
  const keys = app.get(ApiKeysService);
  const tools = app.get(ScopeToolsService);
  const provider = new ScopeProfitOAuthProvider(db, keys);
  const issuer = new URL(publicApiUrl());
  const resource = new URL(`${publicApiUrl()}${MCP_PATH}`);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  const http = app.getHttpAdapter().getInstance() as express.Express;

  http.use(
    mcpAuthRouter({
      provider,
      issuerUrl: issuer,
      resourceServerUrl: resource,
      resourceName: 'ScopeProfit',
      scopesSupported: [MCP_SCOPE],
    }),
  );

  http.post(
    '/oauth/consent',
    express.urlencoded({ extended: false, limit: '16kb' }),
    rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    async (req: Request, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const claim = verifyConsent(body.request);
      if (!claim)
        return void res
          .status(400)
          .type('text')
          .send('Authorization request expired; start again.');
      const client = await provider.clientsStore.getClient(claim.clientId);
      if (!client || !client.redirect_uris.includes(claim.redirectUri))
        return void res.status(400).type('text').send('Unknown client.');
      const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
      const verified = await keys.verify(apiKey).catch(() => null);
      if (!verified)
        return consentPage(res, {
          clientName: client.client_name ?? 'MCP client',
          payload: body.request as string,
          redirectUri: claim.redirectUri,
          error: 'That API key is not valid or was revoked.',
        });
      const code = await provider.issueCode({
        clientId: claim.clientId,
        apiKeyId: verified.key.id,
        redirectUri: claim.redirectUri,
        codeChallenge: claim.codeChallenge,
        scopes: claim.scopes,
        resource: claim.resource,
      });
      await db.auditEvent.create({
        data: {
          actorId: verified.user.id,
          action: 'mcp.oauth_granted',
          result: 'success',
          metadata: { clientId: claim.clientId, apiKeyId: verified.key.id },
        },
      });
      const target = new URL(claim.redirectUri);
      target.searchParams.set('code', code);
      if (claim.state) target.searchParams.set('state', claim.state);
      target.searchParams.set('iss', issuer.href);
      res.redirect(302, target.href);
    },
  );

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? 120),
    standardHeaders: true,
    legacyHeaders: false,
  });
  const auth = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

  http.post(MCP_PATH, limiter, auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const principal = req.auth?.extra as McpPrincipal | undefined;
      const user = principal && (await db.user.findUnique({ where: { id: principal.userId } }));
      if (!user) return void res.status(401).json({ error: 'invalid_token' });
      const server = createScopeMcpServer(tools, user);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });

  const notAllowed = (_req: Request, res: Response) =>
    void res
      .status(405)
      .set('Allow', 'POST')
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed (stateless server)' },
        id: null,
      });
  http.get(MCP_PATH, limiter, auth, notAllowed);
  http.delete(MCP_PATH, limiter, auth, notAllowed);
}
