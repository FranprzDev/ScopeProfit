import { Injectable } from '@nestjs/common';
import type { ApiKey, User } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail, hash, token } from '../../security';

export const API_KEY_PREFIX = 'sp_live_';

/**
 * Long-lived credentials that let an MCP client (ChatGPT, Claude, any agent) act as a
 * professional. Only the SHA-256 hash is stored; the raw key is shown once at creation.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  async create(user: User, label: string) {
    this.auth.professional(user);
    const cleanLabel = label.trim().slice(0, 100) || 'mcp';
    const raw = `${API_KEY_PREFIX}${token()}`;
    const key = await this.db.apiKey.create({
      data: {
        userId: user.id,
        label: cleanLabel,
        prefix: raw.slice(0, API_KEY_PREFIX.length + 6),
        keyHash: hash(raw),
      },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: user.id,
        action: 'api_key.created',
        result: 'success',
        metadata: { apiKeyId: key.id },
      },
    });
    return { id: key.id, label: key.label, prefix: key.prefix, key: raw };
  }

  /** Creates (or reuses) the professional bound to an authorized Telegram id, then issues a key. */
  async createForTelegramId(telegramId: string, label: string) {
    const user = await this.auth.telegramUser(telegramId);
    return this.create(user, label);
  }

  list(userId?: string) {
    return this.db.apiKey.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        prefix: true,
        userId: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(id: string) {
    const revoked = await this.db.apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.db.oAuthToken.updateMany({
      where: { apiKeyId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count)
      await this.db.auditEvent.create({
        data: { action: 'api_key.revoked', result: 'success', metadata: { apiKeyId: id } },
      });
    return { revoked: revoked.count === 1 };
  }

  /** Resolves an active key to its key record and professional user, or fails with 401. */
  async verify(raw: string): Promise<{ key: ApiKey; user: User }> {
    if (!raw.startsWith(API_KEY_PREFIX)) fail('INVALID_API_KEY', 401);
    const key = await this.db.apiKey.findUnique({
      where: { keyHash: hash(raw) },
      include: { user: true },
    });
    if (!key || key.revokedAt) fail('INVALID_API_KEY', 401);
    return this.activate(key);
  }

  /** Loads a key by id (used by OAuth tokens, which are bound to the key that approved them). */
  async byId(id: string): Promise<{ key: ApiKey; user: User }> {
    const key = await this.db.apiKey.findUnique({ where: { id }, include: { user: true } });
    if (!key || key.revokedAt) fail('INVALID_API_KEY', 401);
    return this.activate(key);
  }

  private async activate(key: ApiKey & { user: User }) {
    try {
      this.auth.professional(key.user);
    } catch {
      fail('INVALID_API_KEY', 401);
    }
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
      await this.db.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    const { user, ...record } = key;
    return { key: record, user };
  }
}
