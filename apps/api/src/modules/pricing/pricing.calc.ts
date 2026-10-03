export interface QuoteRateCard {
  hourlyRate: number;
  marginPercent: number;
  currency: string;
}

export interface QuoteLineInput {
  module: string;
  minHours: number;
  maxHours: number;
}

export interface PricedQuoteLine extends QuoteLineInput {
  hourlyRate: number;
  priceMin: number;
  priceMax: number;
}

export interface QuoteTotals {
  currency: string;
  hourlyRate: number;
  lines: PricedQuoteLine[];
  subtotalMin: number;
  subtotalMax: number;
  totalMin: number;
  totalMax: number;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const effectiveHourlyRate = (
  rateCard: Pick<QuoteRateCard, 'hourlyRate' | 'marginPercent'>,
) => round2(rateCard.hourlyRate * (1 + rateCard.marginPercent / 100));

export function computeQuoteTotals(lines: QuoteLineInput[], rateCard: QuoteRateCard): QuoteTotals {
  const hourlyRate = effectiveHourlyRate(rateCard);
  const priced: PricedQuoteLine[] = lines.map((line) => {
    const module = line.module.trim();
    if (
      !module ||
      !Number.isFinite(line.minHours) ||
      !Number.isFinite(line.maxHours) ||
      line.minHours < 0 ||
      line.maxHours < 0 ||
      line.maxHours < line.minHours
    )
      throw new Error('INVALID_QUOTE_LINE');
    return {
      module,
      minHours: line.minHours,
      maxHours: line.maxHours,
      hourlyRate,
      priceMin: round2(line.minHours * hourlyRate),
      priceMax: round2(line.maxHours * hourlyRate),
    };
  });
  const subtotalMin = round2(priced.reduce((sum, line) => sum + line.priceMin, 0));
  const subtotalMax = round2(priced.reduce((sum, line) => sum + line.priceMax, 0));
  return {
    currency: rateCard.currency,
    hourlyRate,
    lines: priced,
    subtotalMin,
    subtotalMax,
    totalMin: subtotalMin,
    totalMax: subtotalMax,
  };
}
