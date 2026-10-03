import { Injectable } from '@nestjs/common';
import { RateCard, User } from '@prisma/client';
import type { RateCard as RateCardDto } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';

export interface RateCardInput {
  label: string;
  hourlyRate: number;
  currency: string;
  marginPercent: number;
}

export const toRateCardDto = (card: RateCard): RateCardDto => ({
  id: card.id,
  ownerId: card.ownerId,
  label: card.label,
  hourlyRate: Number(card.hourlyRate),
  currency: card.currency,
  marginPercent: card.marginPercent,
  isDefault: card.isDefault,
  active: card.active,
  createdAt: card.createdAt.toISOString(),
  updatedAt: card.updatedAt.toISOString(),
});

@Injectable()
export class RateCardsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  async get(user: User): Promise<RateCardDto> {
    this.auth.professional(user);
    const card = await this.db.rateCard.findFirst({
      where: { ownerId: user.id, isDefault: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!card) fail('RATE_CARD_NOT_FOUND', 404);
    return toRateCardDto(card);
  }

  async upsert(user: User, input: RateCardInput): Promise<RateCardDto> {
    this.auth.professional(user);
    const data = {
      label: input.label.trim(),
      hourlyRate: input.hourlyRate,
      currency: input.currency.toUpperCase(),
      marginPercent: input.marginPercent,
      isDefault: true,
      active: true,
    };
    const existing = await this.db.rateCard.findFirst({
      where: { ownerId: user.id, isDefault: true },
    });
    const card = await this.db.$transaction(async (tx) => {
      const saved = existing
        ? await tx.rateCard.update({ where: { id: existing.id }, data })
        : await tx.rateCard.create({ data: { ownerId: user.id, ...data } });
      await tx.rateCard.updateMany({
        where: { ownerId: user.id, id: { not: saved.id } },
        data: { isDefault: false, active: false },
      });
      return saved;
    });
    return toRateCardDto(card);
  }
}
