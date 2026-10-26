import type { BriefData } from '@scopeprofit/contracts';
export const SCOPE_SECTIONS = [
  'summary',
  'requirements',
  'questions',
  'risks',
  'included',
  'excluded',
  'assumptions',
  'acceptanceCriteria',
  'estimates',
  'nextSteps',
  'quoteValidity',
  'diagrams',
] as const satisfies readonly (keyof BriefData)[];
export type ScopeSection = (typeof SCOPE_SECTIONS)[number];
