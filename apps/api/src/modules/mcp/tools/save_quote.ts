import { z } from 'zod';

import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, write, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
  rate_card: z
    .object({
      hourly_rate: z
        .number()
        .positive()
        .describe('Your hourly rate; you set it, it is never suggested'),
      currency: z.string().length(3).describe('ISO currency code, e.g. USD or ARS'),
      margin_percent: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Margin over the base rate, 0-100'),
    })
    .optional()
    .describe('Set or update your default rate card before pricing'),
  from_estimates: z
    .boolean()
    .optional()
    .describe('(Re)build the quote lines from the scope estimates of the project'),
  lines: z
    .array(
      z.object({
        module: z.string().max(200),
        min_hours: z.number().min(0),
        max_hours: z.number().min(0),
      }),
    )
    .max(100)
    .optional()
    .describe('Explicit module lines with hour ranges; replaces all lines'),
  milestones: z
    .array(
      z.object({
        name: z.string().max(500),
        percent: z.number().int().min(0).max(100).nullable().optional(),
        amount: z.number().positive().nullable().optional(),
      }),
    )
    .max(50)
    .optional()
    .describe(
      'Payment milestones: each with percent (all must sum 100) or amount, not both; replaces all milestones',
    ),
  terms: z
    .string()
    .max(10000)
    .nullable()
    .optional()
    .describe('Commercial conditions in plain language; null clears them'),
  valid_until: z
    .string()
    .nullable()
    .optional()
    .describe('Quote validity date (ISO 8601); null clears it'),
};

export const metadata: ToolMetadata = {
  name: 'save_quote',
  description:
    "Create or update the DRAFT quote of a project. Use from_estimates to price the scope estimates, or pass explicit module lines; amounts are computed only from the professional's rate card (rate_card here or the saved default) and are never suggested. milestones: each with percent (all must sum 100) or amount, not both. terms and valid_until are optional commercial conditions in plain language. Only draft quotes can be changed; a sent, accepted or rejected quote returns QUOTE_NOT_DRAFT.",
  annotations: { ...write, title: 'Save quote' },
};

export default async function save_quote(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) =>
    tools.saveQuote(user, {
      projectId: args.project_id,
      rateCard: args.rate_card
        ? {
            hourlyRate: args.rate_card.hourly_rate,
            currency: args.rate_card.currency,
            marginPercent: args.rate_card.margin_percent,
          }
        : undefined,
      fromEstimates: args.from_estimates,
      lines: args.lines?.map((line) => ({
        module: line.module,
        minHours: line.min_hours,
        maxHours: line.max_hours,
      })),
      milestones: args.milestones,
      terms: args.terms,
      validUntil: args.valid_until,
    }),
  );
}
