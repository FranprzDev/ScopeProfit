import type { Requirement, Risk } from '@scopeprofit/contracts';

export const requirementTypeLabels: Record<Requirement['type'], string> = {
  functional: 'Funcional',
  rule: 'Regla de negocio',
  data: 'Datos',
  integration: 'Integración',
  nonfunctional: 'No funcional',
};

export const requirementPriorityLabels: Record<Requirement['priority'], string> = {
  must: 'Necesario',
  should: 'Deseable',
};

export const riskSeverityLabels: Record<Risk['severity'], string> = {
  red: 'Rojo',
  yellow: 'Amarillo',
  green: 'Verde',
};
