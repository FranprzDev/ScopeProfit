import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { PrismaService } from '../../prisma.service';
import { hash, token } from '../../security';
import { API_KEY_PREFIX, ApiKeysService } from './api-keys.service';
import { consentPage, signConsent } from './oauth-consent';
import { publicApiUrl } from './export-links';
import { InvalidTargetError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

export const MCP_SCOPE = 'scope';
const ACCESS_PREFIX = 'sp_at_';
const REFRESH_PREFIX = 'sp_rt_';
const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_MS = 30 * 86_400_000;
/** Raw API keys passed as bearer tokens get a short synthetic expiry; the key itself does not expire. */
const API_KEY_SESSION_S = 60 * 60;

export type McpPrincipal = { userId: string; apiKeyId: string };

/**
 * Minimal OAuth 2.1 authorization server for ChatGPT / Claude connectors.
 *
 * ChatGPT custom connectors only support OAuth (no static header), so the professional signs in
 * by pasting a ScopeProfit API key on the consent page. The issued tokens are bound to that key,
 * so revoking the key revokes every OAuth grant made with it. Clients register dynamically (RFC 7591),
 * PKCE is enforced by the SDK token handler, and only token hashes are stored.
 */
export class ScopeProfitOAuthProvider implements OAuthServerProvider {
  constructor(
    private db: PrismaService,
    private keys: ApiKeysService,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => {
        const client = await this.db.oAuthClient.findUnique({ where: { clientId } });
        return client ? (client.data as unknown as OAuthClientInformationFull) : undefined;
      },
      registerClient: async (client) => {
        const full = {
          ...client,
          client_id: (client as Partial<OAuthClientInformationFull>).client_id ?? randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        } as OAuthClientInformationFull;
        await this.db.oAuthClient.create({
          data: { clientId: full.client_id, data: full as unknown as Prisma.InputJsonValue },
        });
        return full;
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const expectedResource = new URL('/api/mcp', publicApiUrl()).href;
    if (params.resource && params.resource.href !== expectedResource)
      throw new InvalidTargetError('Resource must identify this MCP server');
    const payload = signConsent({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes ?? [MCP_SCOPE],
      resource: expectedResource,
      exp: Date.now() + 10 * 60_000,
    });
    consentPage(res, {
      clientName: client.client_name ?? 'MCP client',
      payload,
      redirectUri: params.redirectUri,
    });
  }

  /** Called by the consent form handler once the professional has proven ownership of a key. */
  async issueCode(input: {
    clientId: string;
    apiKeyId: string;
    redirectUri: string;
    codeChallenge: string;
    scopes: string[];
    resource?: string;
  }) {
    const code = token();
    await this.db.oAuthToken.create({
      data: {
        tokenHash: hash(code),
        kind: 'code',
        clientId: input.clientId,
        apiKeyId: input.apiKeyId,
        codeChallenge: input.codeChallenge,
        redirectUri: input.redirectUri,
        resource: input.resource,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return code;
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const code = await this.liveToken(authorizationCode, 'code');
    if (code.clientId !== client.client_id || !code.codeChallenge)
      throw new InvalidGrantError('Invalid authorization code');
    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = await this.liveToken(authorizationCode, 'code');
    if (resource && resource.href !== code.resource)
      throw new InvalidTargetError('Resource does not match the authorization grant');
    if (code.clientId !== client.client_id)
      throw new InvalidGrantError('Authorization code was issued to another client');
    if (redirectUri && redirectUri !== code.redirectUri)
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    const consumed = await this.db.oAuthToken.updateMany({
      where: { tokenHash: code.tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new InvalidGrantError('Authorization code already used');
    return this.issueTokens(client.client_id, code.apiKeyId, code.scopes, code.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const refresh = await this.db.oAuthToken.findUnique({
      where: { tokenHash: hash(refreshToken) },
    });
    if (!refresh || refresh.kind !== 'refresh' || refresh.expiresAt.getTime() < Date.now())
      throw new InvalidGrantError('Invalid or expired refresh token');
    if (resource && resource.href !== refresh.resource)
      throw new InvalidTargetError('Resource does not match the refresh grant');
    if (scopes?.some((scope) => !refresh.scopes.includes(scope)))
      throw new InvalidGrantError('Refresh cannot expand the authorized scope');
    if (refresh.clientId !== client.client_id)
      throw new InvalidGrantError('Refresh token was issued to another client');
    const tokens = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${refresh.grantId}))`;
      const rotated = await tx.oAuthToken.updateMany({
        where: { tokenHash: refresh.tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (rotated.count !== 1) {
        await tx.oAuthToken.updateMany({
          where: { grantId: refresh.grantId, clientId: client.client_id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      return this.issueTokens(
        client.client_id,
        refresh.apiKeyId,
        refresh.scopes,
        refresh.resource,
        refresh.grantId,
        tx,
      );
    });
    if (!tokens)
      throw new InvalidGrantError('Refresh token replay revoked this authorization grant');
    return tokens;
  }

  async verifyAccessToken(raw: string): Promise<AuthInfo> {
    if (raw.startsWith(API_KEY_PREFIX)) {
      const { key, user } = await this.keys.verify(raw).catch(() => {
        throw new InvalidTokenError('Invalid API key');
      });
      return {
        token: raw,
        clientId: 'api-key',
        resource: new URL('/api/mcp', publicApiUrl()),
        scopes: [MCP_SCOPE],
        expiresAt: Math.floor(Date.now() / 1000) + API_KEY_SESSION_S,
        extra: { userId: user.id, apiKeyId: key.id } satisfies McpPrincipal,
      };
    }
    if (!raw.startsWith(ACCESS_PREFIX)) throw new InvalidTokenError('Unknown token');
    const access = await this.db.oAuthToken.findUnique({ where: { tokenHash: hash(raw) } });
    if (
      !access ||
      access.kind !== 'access' ||
      access.revokedAt ||
      access.expiresAt.getTime() < Date.now()
    )
      throw new InvalidTokenError('Invalid or expired access token');
    const { user } = await this.keys.byId(access.apiKeyId).catch(() => {
      throw new InvalidTokenError('The API key behind this token was revoked');
    });
    return {
      token: raw,
      clientId: access.clientId,
      scopes: access.scopes,
      expiresAt: Math.floor(access.expiresAt.getTime() / 1000),
      resource: access.resource ? new URL(access.resource) : undefined,
      extra: { userId: user.id, apiKeyId: access.apiKeyId } satisfies McpPrincipal,
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.db.oAuthToken.updateMany({
      where: { tokenHash: hash(request.token), clientId: client.client_id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async liveToken(raw: string, kind: 'code' | 'refresh') {
    const found = await this.db.oAuthToken.findUnique({ where: { tokenHash: hash(raw) } });
    if (
      !found ||
      found.kind !== kind ||
      found.revokedAt ||
      (kind === 'code' && found.usedAt) ||
      found.expiresAt.getTime() < Date.now()
    )
      throw new InvalidGrantError(
        `Invalid or expired ${kind === 'code' ? 'code' : 'refresh token'}`,
      );
    return found;
  }

  private async issueTokens(
    clientId: string,
    apiKeyId: string,
    scopes: string[],
    resource: string | null,
    grantId: string = randomUUID(),
    db: Prisma.TransactionClient = this.db,
  ): Promise<OAuthTokens> {
    const access = `${ACCESS_PREFIX}${token()}`;
    const refresh = `${REFRESH_PREFIX}${token()}`;
    const base = { clientId, apiKeyId, scopes, resource, grantId };
    await db.oAuthToken.createMany({
      data: [
        {
          ...base,
          tokenHash: hash(access),
          kind: 'access',
          expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
        },
        {
          ...base,
          tokenHash: hash(refresh),
          kind: 'refresh',
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      ],
    });
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: ACCESS_TTL_S,
      refresh_token: refresh,
      scope: scopes.join(' '),
    };
  }
}
