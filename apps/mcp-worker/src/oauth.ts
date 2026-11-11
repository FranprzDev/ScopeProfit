/**
 * OAuth 2.1 endpoints for the MCP worker: the same authorization-server behavior the Nest API
 * exposes through the MCP SDK's express router, wired here onto web-standard requests via the
 * express-lite adapter. Endpoints: metadata, /authorize, /token, /register, /revoke and the
 * ScopeProfit consent form (/oauth/consent).
 */
import { Hono } from 'hono';
import { createOAuthMetadata } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { redirectUriMatches } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { consentPage, verifyConsent } from '../../api/src/modules/mcp/oauth-consent';
import { MCP_SCOPE } from '../../api/src/modules/mcp/oauth.provider';
import { LiteRequest, LiteResponse, parseBody, runHandler } from './express-lite';
import { getContainer, type WorkerEnv } from './container';

const noRateLimit = { windowMs: 60_000, limit: 10_000 };

export function oauthApp() {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  const endpoints = (env: WorkerEnv) => {
    const container = getContainer(env);
    const issuer = new URL(env.PUBLIC_API_URL);
    const resource = new URL('/api/mcp', issuer);
    const metadata = createOAuthMetadata({
      provider: container.provider,
      issuerUrl: issuer,
      baseUrl: issuer,
      scopesSupported: [MCP_SCOPE],
    });
    return { metadata, resource };
  };

  const lite = async (c: { req: { raw: Request } }, handler: Parameters<typeof runHandler>[0]) => {
    const req = new LiteRequest(c.req.raw, new URL(c.req.raw.url));
    req.body = await parseBody(c.req.raw);
    return runHandler(handler, req, new LiteResponse());
  };

  app.get('/.well-known/oauth-authorization-server', (c) =>
    lite(c, metadataHandler(endpoints(c.env).metadata) as never),
  );
  app.get('/.well-known/oauth-protected-resource', (c) => {
    const { resource } = endpoints(c.env);
    const env = c.env;
    return lite(
      c,
      metadataHandler({
        resource: resource.href,
        authorization_servers: [new URL(env.PUBLIC_API_URL).href],
        scopes_supported: [MCP_SCOPE],
        resource_name: 'ScopeProfit',
      } as never) as never,
    );
  });

  app.on(['GET', 'POST'], '/authorize', async (c) => {
    const container = getContainer(c.env);
    return lite(c, authorizationHandler({ provider: container.provider, rateLimit: noRateLimit }) as never);
  });
  app.post('/token', async (c) => {
    const container = getContainer(c.env);
    return lite(c, tokenHandler({ provider: container.provider, rateLimit: noRateLimit }) as never);
  });
  app.post('/register', async (c) => {
    const container = getContainer(c.env);
    return lite(
      c,
      clientRegistrationHandler({ clientsStore: container.provider.clientsStore, rateLimit: noRateLimit }) as never,
    );
  });
  app.post('/revoke', async (c) => {
    const container = getContainer(c.env);
    return lite(c, revocationHandler({ provider: container.provider, rateLimit: noRateLimit }) as never);
  });

  // Consent form target: verifies the pasted API key and issues the authorization code.
  // Mirrors the express handler in apps/api mcp-http.ts, returning web Responses.
  app.post('/oauth/consent', async (c) => {
    const env = c.env;
    const container = getContainer(env);
    const body = (await parseBody(c.req.raw)) as Record<string, unknown>;
    const res = new LiteResponse();
    const fail400 = (message: string) => {
      res.status(400).type('text').send(message);
      return res.toResponse();
    };
    const claim = verifyConsent(body.request);
    if (!claim) return fail400('Authorization request expired; start again.');
    const client = await container.provider.clientsStore.getClient(claim.clientId);
    if (!client || !client.redirect_uris.some((uri) => redirectUriMatches(claim.redirectUri, uri)))
      return fail400('Unknown client.');
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    const verified = await container.keys.verify(apiKey).catch(() => null);
    if (!verified) {
      consentPage(res as never, {
        clientName: client.client_name ?? 'MCP client',
        payload: body.request as string,
        redirectUri: claim.redirectUri,
        error: 'That API key is not valid or was revoked.',
      });
      return res.toResponse();
    }
    const code = await container.provider.issueCode({
      clientId: claim.clientId,
      apiKeyId: verified.key.id,
      redirectUri: claim.redirectUri,
      codeChallenge: claim.codeChallenge,
      scopes: claim.scopes,
      resource: claim.resource,
    });
    await container.db.auditEvent.create({
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
    target.searchParams.set('iss', new URL(env.PUBLIC_API_URL).href);
    res.redirect(302, target.href);
    return res.toResponse();
  });

  return app;
}
