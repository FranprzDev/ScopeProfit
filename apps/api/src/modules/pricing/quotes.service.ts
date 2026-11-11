import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Quote as QuoteRow,
  QuoteLine as QuoteLineRow,
  QuoteMilestone as QuoteMilestoneRow,
  QuoteStatus,
  Role,
  User,
} from '@prisma/client';
import type {
  Quote as QuoteDto,
  QuoteLine as QuoteLineDto,
  QuoteMilestone as QuoteMilestoneDto,
  QuoteSummary,
} from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';
import { validateBrief } from '../brief/brief.validation';
import { buildQuoteProposal, renderQuoteProposal } from '../documents/render-quote';
import { computeQuoteTotals, type QuoteLineInput, type QuoteTotals } from './pricing.calc';
import {
  assertDraftQuote,
  assertSentQuote,
  parseRateCardSnapshot,
  validateQuoteLines,
  validateQuoteMilestones,
  type QuoteMilestoneInput,
} from './pricing.validation';
import { RateCardsService } from './rate-cards.service';

type QuoteWithRelations = QuoteRow & { lines: QuoteLineRow[]; milestones: QuoteMilestoneRow[] };

export type QuoteDecision = typeof QuoteStatus.accepted | typeof QuoteStatus.rejected;

export interface QuoteFile {
  buffer: Buffer;
  name: string;
  mimeType: string;
}

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
    private rateCards: RateCardsService,
  ) {}

  private async authorize(
    user: User,
    projectId: string,
  ): Promise<
    Prisma.ProjectGetPayload<{
      include: {
        brief: true;
        document: { include: { versions: { orderBy: { version: 'desc' }; take: 1 } } };
      };
    }>
  >;
  private async authorize(
    user: User,
    projectId: string,
    preloaded?: { ownerId: string },
  ): Promise<{ ownerId: string }>;
  private async authorize(user: User, projectId: string, preloaded?: { ownerId: string }) {
    if (user.role !== Role.professional) fail('FORBIDDEN', 403);
    const project = preloaded ?? (await this.auth.project(user, projectId, true));
    if (user.role !== 'professional' && project.ownerId !== user.id) fail('FORBIDDEN', 403);
    return project;
  }

  async get(
    user: User,
    projectId: string,
    preloaded?: { ownerId: string },
  ): Promise<PopulatedQuote> {
    await this.authorize(user, projectId, preloaded);
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    return toQuoteDto(quote);
  }

  async listMine(user: User): Promise<{ quotes: QuoteSummary[] }> {
    if (user.role !== Role.professional) fail('FORBIDDEN', 403);
    const rows = await this.db.quote.findMany({
      where: { project: { ownerId: user.id } },
      orderBy: { updatedAt: 'desc' },
      include: { project: { select: { name: true } } },
    });
    return {
      quotes: rows.map((quote) => ({
        id: quote.id,
        projectId: quote.projectId,
        projectName: quote.project.name,
        status: quote.status,
        currency: quote.currency,
        totalMin: Number(quote.totalMin),
        totalMax: Number(quote.totalMax),
        updatedAt: quote.updatedAt.toISOString(),
      })),
    };
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

  async send(user: User, projectId: string): Promise<PopulatedQuote> {
    await this.authorize(user, projectId);
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    assertDraftQuote(quote.status);
    const sent = await this.db.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id: quote.id, status: QuoteStatus.draft },
        data: { status: QuoteStatus.sent, sentAt: new Date() },
      });
      if (changed.count !== 1) fail('QUOTE_NOT_DRAFT', 409);
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'quote.sent',
          result: 'success',
          metadata: { quoteId: quote.id },
        },
      });
      return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude() });
    });
    return toQuoteDto(sent);
  }

  /**
   * Records the client's decision on a quote. There is no client portal: the professional
   * shares the export_quote link themselves and registers the outcome here. Deciding a
   * draft quote marks it sent first, so the audit trail keeps the full lifecycle.
   */
  async decideAsProfessional(
    user: User,
    projectId: string,
    decision: QuoteDecision,
  ): Promise<PopulatedQuote> {
    await this.authorize(user, projectId);
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    if (quote.status !== QuoteStatus.draft && quote.status !== QuoteStatus.sent)
      fail('QUOTE_NOT_SENDABLE', 409);
    const decided = await this.db.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id: quote.id, status: { in: [QuoteStatus.draft, QuoteStatus.sent] } },
        data: {
          status: decision,
          decidedAt: new Date(),
          ...(quote.status === QuoteStatus.draft ? { sentAt: new Date() } : {}),
        },
      });
      if (changed.count !== 1) fail('QUOTE_NOT_SENDABLE', 409);
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'quote.decided',
          result: 'success',
          metadata: { quoteId: quote.id, decision, recordedBy: 'professional' },
        },
      });
      return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude() });
    });
    return toQuoteDto(decided);
  }

  async download(user: User, projectId: string, format: string): Promise<QuoteFile> {
    await this.authorize(user, projectId);
    if (format !== 'pdf' && format !== 'docx') fail('INVALID_FORMAT', 400);
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    return this.renderQuoteFile(quote, format);
  }

  /**
   * Renders a quote without an access check. Only reachable through a valid signed
   * export link (MCP export_quote); the link itself is the authorization.
   */
  async renderFile(projectId: string, format: 'pdf' | 'docx'): Promise<QuoteFile> {
    const quote = await this.db.quote.findUnique({
      where: { projectId },
      include: quoteInclude(),
    });
    if (!quote) fail('QUOTE_NOT_FOUND', 404);
    return this.renderQuoteFile(quote, format);
  }

  private async renderQuoteFile(
    quote: QuoteWithRelations,
    format: 'pdf' | 'docx',
  ): Promise<QuoteFile> {
    const project = await this.db.project.findUnique({
      where: { id: quote.projectId },
      include: { owner: true },
    });
    if (!project) fail('PROJECT_NOT_FOUND', 404);
    const buffers = await renderQuoteProposal(
      buildQuoteProposal(toQuoteDto(quote), {
        projectName: project.name,
        clientName: project.clientName || 'Cliente',
        author: project.owner.email || 'Profesional',
        date: new Date().toISOString(),
      }),
    );
    return {
      buffer: format === 'pdf' ? buffers.pdf : buffers.docx,
      name: `scope-${quote.projectId}-quote.${format}`,
      mimeType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  /**
   * Create-or-update entry point used by the MCP save_quote tool. Prices are only
   * ever computed from the professional's own rate card and hour estimates or from
   * explicit lines they provide; this method never suggests prices.
   */
  async upsertDraft(
    user: User,
    projectId: string,
    input: {
      rateCard?: { hourlyRate: number; currency: string; marginPercent?: number };
      fromEstimates?: boolean;
      lines?: unknown;
      milestones?: unknown;
      terms?: string | null;
      validUntil?: string | null;
    },
    preloaded?: { ownerId: string },
  ): Promise<PopulatedQuote> {
    await this.authorize(user, projectId, preloaded);
    if (input.fromEstimates && input.lines !== undefined)
      fail('INVALID_QUOTE_INPUT', 400, 'from_estimates and lines are alternatives; pass only one');
    const existing = await this.db.quote.findUnique({
      where: { projectId },
      select: { status: true },
    });
    // Reject non-draft quotes before any write (including the rate-card upsert).
    if (existing) assertDraftQuote(existing.status);
    if (input.rateCard) {
      const currentDefault = await this.db.rateCard.findFirst({
        where: { ownerId: user.id, isDefault: true },
      });
      await this.rateCards.upsert(user, {
        label: currentDefault?.label ?? 'Default',
        hourlyRate: input.rateCard.hourlyRate,
        currency: input.rateCard.currency,
        marginPercent: input.rateCard.marginPercent ?? currentDefault?.marginPercent ?? 0,
      });
    }
    let quote: PopulatedQuote;
    if (input.fromEstimates) {
      // (Re)generates the draft from the current scope estimates with the default
      // rate card; rejects non-draft quotes like the REST generate endpoint does.
      quote = await this.generate(user, projectId);
    } else if (!existing) {
      if (input.lines === undefined)
        fail('QUOTE_NOT_FOUND', 400, 'No quote exists yet; pass from_estimates or lines');
      quote = await this.createFromLines(user, projectId, input.lines);
    } else {
      quote = await this.get(user, projectId);
    }
    const hasFieldUpdates =
      input.lines !== undefined ||
      input.milestones !== undefined ||
      input.terms !== undefined ||
      input.validUntil !== undefined;
    if (hasFieldUpdates)
      return this.patch(user, projectId, {
        terms: input.terms,
        validUntil: input.validUntil,
        // from_estimates already (re)built the lines from the brief.
        lines: input.fromEstimates ? undefined : input.lines,
        milestones: input.milestones,
      });
    return quote;
  }

  private async createFromLines(
    user: User,
    projectId: string,
    linesInput: unknown,
  ): Promise<PopulatedQuote> {
    const card = await this.db.rateCard.findFirst({
      where: { ownerId: user.id, isDefault: true, active: true },
    });
    if (!card)
      fail('RATE_CARD_REQUIRED', 400, 'Set a rate card (rate_card) before pricing explicit lines');
    const rateCard = {
      hourlyRate: Number(card.hourlyRate),
      marginPercent: card.marginPercent,
      currency: card.currency,
    };
    const totals = computeQuoteTotals(validateQuoteLines(linesInput), rateCard);
    const snapshot: Prisma.InputJsonValue = {
      id: card.id,
      label: card.label,
      hourlyRate: rateCard.hourlyRate,
      marginPercent: card.marginPercent,
      currency: card.currency,
      isDefault: card.isDefault,
      capturedAt: new Date().toISOString(),
    };
    const created = await this.db.$transaction(async (tx) => {
      const quote = await tx.quote.create({
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
          metadata: { quoteId: quote.id, rateCardId: card.id, lineCount: totals.lines.length },
        },
      });
      return quote;
    });
    return toQuoteDto(created);
  }

  private async findRateCard(user: User, rateCardId?: string) {
    const rateCard = await this.db.rateCard.findFirst({
      where: rateCardId
        ? { id: rateCardId, ownerId: user.id, active: true }
        : { ownerId: user.id, isDefault: true, active: true },
    });
    if (rateCard) return rateCard;
    // Prices only ever come from the professional's rate card or explicit lines:
    // never invent one.
    fail('RATE_CARD_REQUIRED', 400);
  }
}
