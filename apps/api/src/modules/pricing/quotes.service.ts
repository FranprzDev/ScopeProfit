import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Quote as QuoteRow,
  QuoteLine as QuoteLineRow,
  QuoteMilestone as QuoteMilestoneRow,
  QuoteStatus,
  User,
} from '@prisma/client';
import type {
  Quote as QuoteDto,
  QuoteLine as QuoteLineDto,
  QuoteMilestone as QuoteMilestoneDto,
} from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';
import { validateBrief } from '../brief/brief.validation';
import { computeQuoteTotals, type QuoteLineInput, type QuoteTotals } from './pricing.calc';
import {
  assertDraftQuote,
  parseRateCardSnapshot,
  validateQuoteLines,
  validateQuoteMilestones,
  type QuoteMilestoneInput,
} from './pricing.validation';

type QuoteWithRelations = QuoteRow & { lines: QuoteLineRow[]; milestones: QuoteMilestoneRow[] };

export interface PopulatedQuote extends QuoteDto {
  lines: QuoteLineDto[];
  milestones: QuoteMilestoneDto[];
}

export interface PatchQuoteInput {
  terms?: string | null;
  validUntil?: string | null;
  lines?: unknown;
  milestones?: unknown;
}

const quoteInclude = () => ({
  lines: { orderBy: { position: 'asc' as const } },
  milestones: { orderBy: { position: 'asc' as const } },
});

const toLineDto = (line: QuoteLineRow): QuoteLineDto => ({
  id: line.id,
  quoteId: line.quoteId,
  module: line.module,
  minHours: line.minHours,
  maxHours: line.maxHours,
  hourlyRate: Number(line.hourlyRate),
  priceMin: Number(line.priceMin),
  priceMax: Number(line.priceMax),
  position: line.position,
});

const toMilestoneDto = (milestone: QuoteMilestoneRow): QuoteMilestoneDto => ({
  id: milestone.id,
  quoteId: milestone.quoteId,
  name: milestone.name,
  percent: milestone.percent,
  amount: milestone.amount === null ? null : Number(milestone.amount),
  position: milestone.position,
});

export const toQuoteDto = (quote: QuoteWithRelations): PopulatedQuote => ({
  id: quote.id,
  projectId: quote.projectId,
  status: quote.status,
  currency: quote.currency,
  subtotalMin: Number(quote.subtotalMin),
  subtotalMax: Number(quote.subtotalMax),
  totalMin: Number(quote.totalMin),
  totalMax: Number(quote.totalMax),
  validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
  terms: quote.terms,
  rateCardSnapshot: quote.rateCardSnapshot,
  sentAt: quote.sentAt ? quote.sentAt.toISOString() : null,
  decidedAt: quote.decidedAt ? quote.decidedAt.toISOString() : null,
  createdAt: quote.createdAt.toISOString(),
  updatedAt: quote.updatedAt.toISOString(),
  lines: quote.lines.map(toLineDto),
  milestones: quote.milestones.map(toMilestoneDto),
});

@Injectable()
export class QuotesService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  private async authorize(user: User, projectId: string) {
    this.auth.professional(user);
    return this.auth.project(user, projectId);
  }

  async get(user: User, projectId: string): Promise<PopulatedQuote> {
    await this.authorize(user, projectId);
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    return toQuoteDto(quote);
  }

  async generate(user: User, projectId: string, rateCardId?: string): Promise<PopulatedQuote> {
    const project = await this.authorize(user, projectId);
    const existing = await this.db.quote.findUnique({
      where: { projectId },
      select: { status: true },
    });
    if (existing) assertDraftQuote(existing.status);
    const rateCard = await this.findRateCard(user, rateCardId);
    if (!project.brief) fail('BRIEF_NO_ESTIMATES', 400);
    const brief = validateBrief(project.brief.data);
    if (!brief.estimates.length) fail('BRIEF_NO_ESTIMATES', 400);
    const inputs: QuoteLineInput[] = brief.estimates.map((estimate) => ({
      module: estimate.module,
      minHours: estimate.minHours,
      maxHours: estimate.maxHours,
    }));
    const totals = computeQuoteTotals(validateQuoteLines(inputs), {
      hourlyRate: Number(rateCard.hourlyRate),
      marginPercent: rateCard.marginPercent,
      currency: rateCard.currency,
    });
    const snapshot: Prisma.InputJsonValue = {
      id: rateCard.id,
      label: rateCard.label,
      hourlyRate: Number(rateCard.hourlyRate),
      marginPercent: rateCard.marginPercent,
      currency: rateCard.currency,
      isDefault: rateCard.isDefault,
      capturedAt: new Date().toISOString(),
    };
    const quote = await this.db.$transaction(async (tx) => {
      await tx.quote.deleteMany({ where: { projectId } });
      const created = await tx.quote.create({
        data: {
          projectId,
          status: QuoteStatus.draft,
          currency: totals.currency,
          subtotalMin: totals.subtotalMin,
          subtotalMax: totals.subtotalMax,
          totalMin: totals.totalMin,
          totalMax: totals.totalMax,
          rateCardSnapshot: snapshot,
          lines: {
            create: totals.lines.map((line, position) => ({ ...line, position })),
          },
        },
        include: quoteInclude(),
      });
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'quote.generated',
          result: 'success',
          metadata: {
            quoteId: created.id,
            rateCardId: rateCard.id,
            lineCount: totals.lines.length,
          },
        },
      });
      return created;
    });
    return toQuoteDto(quote);
  }

  async patch(user: User, projectId: string, input: PatchQuoteInput): Promise<PopulatedQuote> {
    await this.authorize(user, projectId);
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    assertDraftQuote(quote.status);

    const fields: string[] = [];
    const data: Prisma.QuoteUpdateInput = {};
    if (input.terms !== undefined) {
      data.terms = input.terms ?? null;
      fields.push('terms');
    }
    if (input.validUntil !== undefined) {
      data.validUntil = input.validUntil === null ? null : new Date(input.validUntil);
      fields.push('validUntil');
    }
    let totals: QuoteTotals | undefined;
    if (input.lines !== undefined) {
      fields.push('lines');
      const rateCard = parseRateCardSnapshot(quote.rateCardSnapshot);
      if (!rateCard) fail('RATE_CARD_REQUIRED', 400);
      totals = computeQuoteTotals(validateQuoteLines(input.lines), rateCard);
      data.subtotalMin = totals.subtotalMin;
      data.subtotalMax = totals.subtotalMax;
      data.totalMin = totals.totalMin;
      data.totalMax = totals.totalMax;
    }
    let milestones: QuoteMilestoneInput[] | undefined;
    if (input.milestones !== undefined) {
      fields.push('milestones');
      milestones = validateQuoteMilestones(input.milestones);
    }

    const saved = await this.db.$transaction(async (tx) => {
      if (totals) {
        await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
        await tx.quoteLine.createMany({
          data: totals.lines.map((line, position) => ({ quoteId: quote.id, ...line, position })),
        });
      }
      if (milestones) {
        await tx.quoteMilestone.deleteMany({ where: { quoteId: quote.id } });
        if (milestones.length)
          await tx.quoteMilestone.createMany({
            data: milestones.map((milestone, position) => ({
              quoteId: quote.id,
              ...milestone,
              position,
            })),
          });
      }
      const updated = await tx.quote.update({ where: { id: quote.id }, data });
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'quote.updated',
          result: 'success',
          metadata: { quoteId: updated.id, fields },
        },
      });
      return tx.quote.findUniqueOrThrow({ where: { id: updated.id }, include: quoteInclude() });
    });
    return toQuoteDto(saved);
  }

  private async findRateCard(user: User, rateCardId?: string) {
    const rateCard = await this.db.rateCard.findFirst({
      where: rateCardId
        ? { id: rateCardId, ownerId: user.id, active: true }
        : { ownerId: user.id, isDefault: true, active: true },
    });
    if (!rateCard) fail('RATE_CARD_REQUIRED', 400);
    return rateCard;
  }
}
