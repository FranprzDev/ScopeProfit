import type { BriefData } from '@scopeprofit/contracts';

export type BriefDiffEntry = {
  key: string;
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
};

const listKeys = new Set([
  'requirements',
  'questions',
  'risks',
  'estimates',
  'included',
  'excluded',
  'assumptions',
  'acceptanceCriteria',
  'nextSteps',
]);

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffBrief(before: BriefData, after: BriefData): BriefDiffEntry[] {
  const entries: BriefDiffEntry[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const previous = before[key as keyof BriefData];
    const current = after[key as keyof BriefData];
    if (listKeys.has(key)) {
      if (((previous as unknown[]) ?? []).every((item) => typeof item === 'string')) {
        const oldItems = new Set((previous as string[] | undefined) ?? []);
        const newItems = new Set((current as string[] | undefined) ?? []);
        for (const item of newItems)
          if (!oldItems.has(item))
            entries.push({ key: `${key}.${item}`, kind: 'added', after: item });
        for (const item of oldItems)
          if (!newItems.has(item))
            entries.push({ key: `${key}.${item}`, kind: 'removed', before: item });
        continue;
      }
      const previousItems = new Map(
        ((previous as Array<{ id: string }> | undefined) ?? []).map((item) => [item.id, item]),
      );
      for (const item of (current as Array<{ id: string }> | undefined) ?? []) {
        const old = previousItems.get(item.id);
        if (!old) entries.push({ key: `${key}.${item.id}`, kind: 'added', after: item });
        else if (!equal(old, item))
          entries.push({ key: `${key}.${item.id}`, kind: 'changed', before: old, after: item });
        previousItems.delete(item.id);
      }
      for (const [id, item] of previousItems)
        entries.push({ key: `${key}.${id}`, kind: 'removed', before: item });
    } else if (!equal(previous, current)) {
      entries.push({ key, kind: 'changed', before: previous, after: current });
    }
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key));
}
