import { QuoteStatus } from '@prisma/client';
import { z } from 'zod';
import { fail } from '../../security';
import type { QuoteLineInput, QuoteRateCard } from './pricing.calc';

const quoteLineSchema = z.object({
  module: z.string().max(200),
  minHours: z.number().finite().min(0).max(100000),
  maxHours: z.number().finite().min(0).max(100000),
});

const quoteMilestoneSchema = z.object({
  name: z.string().max(500),
  percent: z.number().int().min(0).max(100).nullable().optional(),
  amount: z.number().finite().gt(0).max(1000000000).nullable().optional(),
});

export interface QuoteMilestoneInput {
  name: string;
  percent: number | null;
  amount: number | null;
}

export function validateQuoteLines(input: unknown): QuoteLineInput[] {
  const parsed = z.array(quoteLineSchema).max(100).safeParse(input);
  if (!parsed.success) fail('INVALID_QUOTE_LINE', 400);
  const lines = parsed.data.map((line) => ({
    module: line.module.trim(),
    minHours: Math.round(line.minHours),
    maxHours: Math.round(line.maxHours),
  }));
  if (!lines.length || lines.some((line) => !line.module || line.maxHours < line.minHours))
    fail('INVALID_QUOTE_LINE', 400);
  return lines;
}

export function validateQuoteMilestones(input: unknown): QuoteMilestoneInput[] {
  const parsed = z.array(quoteMilestoneSchema).max(50).safeParse(input);
  if (!parsed.success) fail('INVALID_MILESTONES', 400);
  const percentBased = parsed.data.map((milestone) => {
    const hasPercent = milestone.percent !== undefined && milestone.percent !== null;
    const hasAmount = milestone.amount !== undefined && milestone.amount !== null;
    if (hasPercent === hasAmount) fail('INVALID_MILESTONES', 400);
    return hasPercent;
  });
  if (percentBased.some((mode) => mode !== percentBased[0])) fail('INVALID_MILESTONES', 400);
  if (percentBased[0]) {
    const total = parsed.data.reduce((sum, milestone) => sum + (milestone.percent ?? 0), 0);
    if (total !== 100) fail('INVALID_MILESTONES', 400);
  }
  return parsed.data.map((milestone) => {
    const name = milestone.name.trim();
    if (!name) fail('INVALID_MILESTONES', 400);
    return { name, percent: milestone.percent ?? null, amount: milestone.amount ?? null };
  });
}

export function assertDraftQuote(status: QuoteStatus): void {
  if (status !== QuoteStatus.draft) fail('QUOTE_NOT_DRAFT', 409);
}

export function assertSentQuote(status: QuoteStatus): void {
  if (status !== QuoteStatus.sent) fail('QUOTE_NOT_SENDABLE', 409);
}

export function parseRateCardSnapshot(snapshot: unknown): QuoteRateCard | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const raw = snapshot as Record<string, unknown>;
  const hourlyRate = Number(raw.hourlyRate);
  const marginPercent = Number(raw.marginPercent);
  const currency = typeof raw.currency === 'string' ? raw.currency : '';
  if (
    !currency ||
    !Number.isFinite(hourlyRate) ||
    hourlyRate <= 0 ||
    !Number.isFinite(marginPercent) ||
    marginPercent < 0 ||
    marginPercent > 100
  )
    return null;
  return { hourlyRate, marginPercent, currency };
}
