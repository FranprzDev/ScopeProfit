export interface EntryHours {
  hours: number;
  extraHours: number;
}

export interface EntrySplit {
  fromRetainer: number;
  extraHours: number;
  billableExtra: boolean;
}

export interface MaintenanceBalanceTotals {
  hoursPerMonth: number;
  consumedRetainer: number;
  consumedExtra: number;
  remaining: number;
  entriesCount: number;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function computeEntrySplit(hours: number, remaining: number): EntrySplit {
  const requested = round2(Math.max(0, hours));
  const available = round2(Math.max(0, remaining));
  const fromRetainer = round2(Math.min(available, requested));
  const extraHours = round2(requested - fromRetainer);
  return { fromRetainer, extraHours, billableExtra: extraHours > 0 };
}

export function computeBalance(
  entries: EntryHours[],
  hoursPerMonth: number,
): MaintenanceBalanceTotals {
  const consumedRetainer = round2(
    entries.reduce((sum, entry) => sum + (round2(entry.hours) - round2(entry.extraHours)), 0),
  );
  const consumedExtra = round2(entries.reduce((sum, entry) => sum + round2(entry.extraHours), 0));
  const remaining = round2(Math.max(0, round2(hoursPerMonth) - consumedRetainer));
  return {
    hoursPerMonth: round2(hoursPerMonth),
    consumedRetainer,
    consumedExtra,
    remaining,
    entriesCount: entries.length,
  };
}
