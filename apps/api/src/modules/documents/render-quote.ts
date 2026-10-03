import type { Quote, QuoteLine, QuoteMilestone, QuoteStatus } from '@scopeprofit/contracts';
import { round2 } from '../pricing/pricing.calc';
import { markdownToDocx, markdownToPdf } from './render';

export interface QuoteProposalSource extends Quote {
  lines: QuoteLine[];
  milestones: QuoteMilestone[];
}

export interface QuoteProposalContext {
  projectName: string;
  clientName: string;
  author: string;
  date: string;
}

export interface QuoteProposalLine {
  module: string;
  hours: string;
  hourlyRate: string;
  price: string;
}

export interface QuoteProposalMilestone {
  name: string;
  detail: string;
}

export interface QuoteProposalRateCard {
  label: string;
  baseRate: string;
  marginPercent: number;
  effectiveRate: string;
  capturedAt: string;
}

export interface QuoteProposalInput {
  projectName: string;
  clientName: string;
  author: string;
  date: string;
  status: QuoteStatus;
  currency: string;
  lines: QuoteProposalLine[];
  subtotal: string;
  total: string;
  milestones: QuoteProposalMilestone[];
  validUntil: string;
  terms: string;
  rateCard: QuoteProposalRateCard | null;
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const numberFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = (value: number) => numberFormat.format(value);
const money = (value: number, currency: string) => `${num(value)} ${currency.toUpperCase()}`;
const priceRange = (min: number, max: number, currency: string) =>
  `${num(min)} – ${num(max)} ${currency.toUpperCase()}`;

export const statusLabel = (status: QuoteStatus): string => STATUS_LABELS[status];

export const formatDate = (value: string | null | undefined): string =>
  value && ISO_DATE.test(value) ? value.slice(0, 10) : '—';

function readRateCardSnapshot(snapshot: unknown): {
  label: string;
  hourlyRate: number;
  marginPercent: number;
  currency: string;
  capturedAt: string | null;
} | null {
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
  return {
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : 'Tarifa estándar',
    hourlyRate,
    marginPercent,
    currency,
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
  };
}

export function buildQuoteProposal(
  quote: QuoteProposalSource,
  context: QuoteProposalContext,
): QuoteProposalInput {
  const snapshot = readRateCardSnapshot(quote.rateCardSnapshot);
  const currency = quote.currency;
  return {
    projectName: context.projectName.trim() || 'Proyecto',
    clientName: context.clientName.trim() || 'Cliente',
    author: context.author.trim() || 'Profesional',
    date: formatDate(context.date),
    status: quote.status,
    currency,
    lines: quote.lines.map((line) => ({
      module: line.module,
      hours: `${line.minHours}–${line.maxHours} h`,
      hourlyRate: money(line.hourlyRate, currency),
      price: priceRange(line.priceMin, line.priceMax, currency),
    })),
    subtotal: priceRange(quote.subtotalMin, quote.subtotalMax, currency),
    total: priceRange(quote.totalMin, quote.totalMax, currency),
    milestones: quote.milestones.map((milestone) => ({
      name: milestone.name,
      detail:
        milestone.percent !== null
          ? `${milestone.percent} % — ${priceRange(
              round2((milestone.percent / 100) * quote.totalMin),
              round2((milestone.percent / 100) * quote.totalMax),
              currency,
            )}`
          : money(milestone.amount ?? 0, currency),
    })),
    validUntil: quote.validUntil ? formatDate(quote.validUntil) : 'Sin vencimiento',
    terms: quote.terms?.trim() || 'Sin condiciones adicionales.',
    rateCard: snapshot
      ? {
          label: snapshot.label,
          baseRate: money(snapshot.hourlyRate, snapshot.currency),
          marginPercent: snapshot.marginPercent,
          effectiveRate: money(
            round2(snapshot.hourlyRate * (1 + snapshot.marginPercent / 100)),
            snapshot.currency,
          ),
          capturedAt: formatDate(snapshot.capturedAt),
        }
      : null,
  };
}

export function proposalMarkdown(input: QuoteProposalInput): string {
  return [
    `# Propuesta comercial — ${input.projectName}`,
    `Cliente: ${input.clientName}`,
    `Profesional: ${input.author}`,
    `Fecha: ${input.date}`,
    `Estado: ${statusLabel(input.status)}`,
    `Moneda: ${input.currency.toUpperCase()}`,
    '',
    '## Detalle por módulo',
    ...input.lines.map(
      (line) => `- ${line.module} | ${line.hours} | tarifa ${line.hourlyRate} | ${line.price}`,
    ),
    '',
    `Subtotal: ${input.subtotal}`,
    `Total estimado: ${input.total}`,
    '',
    '## Hitos de pago',
    ...(input.milestones.length
      ? input.milestones.map((milestone) => `- ${milestone.name}: ${milestone.detail}`)
      : ['- Sin hitos de pago definidos']),
    '',
    '## Condiciones',
    `- Validez de la oferta: ${input.validUntil}`,
    `- Términos y condiciones: ${input.terms}`,
    '',
    '## Tarifa aplicada',
    ...(input.rateCard
      ? [
          `- ${input.rateCard.label}: ${input.rateCard.baseRate}/h + ${input.rateCard.marginPercent} % de margen → ${input.rateCard.effectiveRate}/h`,
          `- Tarifa capturada el ${input.rateCard.capturedAt}`,
        ]
      : ['- Sin tarifa asociada']),
    '',
  ].join('\n');
}

export async function renderQuoteProposal(
  input: QuoteProposalInput,
): Promise<{ pdf: Buffer; docx: Buffer }> {
  const md = proposalMarkdown(input);
  const [pdf, docx] = await Promise.all([
    markdownToPdf(md, { title: `Propuesta — ${input.projectName}`, author: input.author }),
    markdownToDocx(md),
  ]);
  return { pdf, docx };
}
