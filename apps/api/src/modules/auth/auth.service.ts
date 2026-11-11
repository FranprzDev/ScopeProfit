import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { Prisma, Project, User } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { isAuthorizedProfessional, encrypt, fail } from '../../security';

/**
 * Professional identity and project access. Authentication is API-key based (MCP) or
 * OAuth for hosted clients. The professional shares signed export links with their
 * client and records outcomes themselves.
 */
@Injectable()
export class AuthService {
  constructor(private db: PrismaService) {}
  async project(user: User, id: string, data?: false): Promise<Project>;
  async project(
    user: User,
    id: string,
    data: 'brief',
  ): Promise<Prisma.ProjectGetPayload<{ include: { brief: true } }>>;
  async project(
    user: User,
    id: string,
    data: true,
  ): Promise<
    Prisma.ProjectGetPayload<{
      include: {
        brief: true;
        document: { include: { versions: { orderBy: { version: 'desc' }; take: 1 } } };
        owner: true;
      };
    }>
  >;
  async project(user: User, id: string, data: boolean | 'brief' = false) {
    const project = await this.db.project.findUnique({
      where: { id },
      ...(data === 'brief'
        ? { include: { brief: true } }
        : data
          ? {
              include: {
                brief: true,
                document: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } },
                owner: true,
              },
            }
          : {}),
    });
    if (!project) fail('PROJECT_NOT_FOUND', 404);
    if (user.role !== 'professional' && project.ownerId !== user.id)
      fail('PROJECT_ACCESS_DENIED', 403);
    return project;
  }
  professional(user: User) {
    if (!isAuthorizedProfessional(user)) fail('FORBIDDEN', 403);
  }
  async professionalUser(rawEmail: string, legacyTelegramId?: string) {
    const email = rawEmail.trim().toLowerCase();
    if (!isEmail(email) || email.length > 254) fail('INVALID_EMAIL', 400);
    if (legacyTelegramId) {
      const legacy = await this.db.user.findUnique({ where: { telegramId: legacyTelegramId } });
      if (!legacy || legacy.role !== 'professional') fail('LEGACY_PROFESSIONAL_NOT_FOUND', 404);
      if (legacy.email && legacy.email !== email) fail('LEGACY_PROFESSIONAL_EMAIL_MISMATCH', 409);
      const taken = await this.db.user.findUnique({ where: { email } });
      if (taken && taken.id !== legacy.id) fail('EMAIL_ALREADY_IN_USE', 409);
      return this.db.user.update({ where: { id: legacy.id }, data: { email } });
    }
    return this.db.user.upsert({
      where: { email },
      create: { email, role: 'professional' },
      update: { role: 'professional' },
    });
  }
  async saveKey(user: User, key: string) {
    this.professional(user);
    await this.db.user.update({ where: { id: user.id }, data: { encryptedApiKey: encrypt(key) } });
    await this.db.auditEvent.create({
      data: { actorId: user.id, action: 'ai_key_updated', result: 'success' },
    });
    return { hasAiApiKey: true };
  }
}
