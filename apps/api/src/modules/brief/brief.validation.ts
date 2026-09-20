import { z } from 'zod';
import { BriefData, TiptapNode } from '@scopeprofit/contracts';
import { fail } from '../../security';
const text = z.string().max(10000);
const list = z.array(text).max(200);
export const briefSchema = z
  .object({
    summary: text,
    requirements: z
      .array(
        z.object({
          id: text,
          description: text,
          type: z.enum(['functional', 'rule', 'data', 'integration', 'nonfunctional']),
          priority: z.enum(['must', 'should']),
          source: text,
          sourceMessageId: z.string().uuid(),
          systemNote: text,
        }),
      )
      .max(200),
    questions: z
      .array(z.object({ id: text, question: text, reason: text, blocksEstimate: z.boolean() }))
      .max(100),
    risks: z
      .array(
        z.object({
          id: text,
          description: text,
          impact: text,
          mitigation: text,
          severity: z.enum(['red', 'yellow', 'green']),
        }),
      )
      .max(100),
    included: list,
    excluded: list,
    assumptions: list,
    acceptanceCriteria: list,
    estimates: z
      .array(
        z.object({
          module: text,
          minHours: z.number().finite().min(0).max(100000),
          maxHours: z.number().finite().min(0).max(100000),
          uncertainty: text,
        }),
      )
      .max(100),
    nextSteps: list,
  })
  .strict();
export function validateBrief(data: unknown): BriefData {
  const result = briefSchema.safeParse(data);
  if (!result.success) fail('INVALID_BRIEF');
  for (const estimate of result.data.estimates)
    if (estimate.maxHours < estimate.minHours) fail('INVALID_ESTIMATE');
  return result.data;
}
export function validateSources(brief: BriefData, messages: { id: string; content: string }[]) {
  for (const requirement of brief.requirements) {
    const source = messages.find((m) => m.id === requirement.sourceMessageId);
    if (!source || !requirement.source.trim() || !source.content.includes(requirement.source))
      fail('INVALID_REQUIREMENT_SOURCE');
  }
}
export function validateEditor(node: unknown): TiptapNode {
  let count = 0;
  const allowed = new Set([
    'doc',
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'table',
    'tableRow',
    'tableHeader',
    'tableCell',
    'text',
    'hardBreak',
  ]);
  function walk(value: unknown, depth: number) {
    if (!value || typeof value !== 'object') fail('INVALID_EDITOR_CONTENT');
    const current = value as Record<string, unknown>;
    if (
      ++count > 10000 ||
      depth > 20 ||
      typeof current.type !== 'string' ||
      !allowed.has(current.type)
    )
      fail('INVALID_EDITOR_CONTENT');
    if (
      current.text !== undefined &&
      (current.type !== 'text' || typeof current.text !== 'string' || current.text.length > 10000)
    )
      fail('INVALID_EDITOR_CONTENT');
    if (current.attrs) {
      if (typeof current.attrs !== 'object' || current.attrs === null)
        fail('INVALID_EDITOR_CONTENT');
      const attrs = Object.keys(current.attrs);
      if (attrs.some((k) => !['level', 'colspan', 'rowspan', 'colwidth'].includes(k)))
        fail('INVALID_EDITOR_CONTENT');
      const level = (current.attrs as Record<string, unknown>).level;
      if (level && ![1, 2, 3].includes(level as number)) fail('INVALID_EDITOR_CONTENT');
    }
    if (
      current.marks &&
      (!Array.isArray(current.marks) ||
        current.marks.some((mark: unknown) => {
          if (!mark || typeof mark !== 'object') return true;
          const value = mark as Record<string, unknown>;
          return (
            !['bold', 'italic', 'strike', 'code', 'underline'].includes(value.type as string) ||
            value.attrs
          );
        }))
    )
      fail('INVALID_EDITOR_CONTENT');
    if (current.content) {
      if (!Array.isArray(current.content)) fail('INVALID_EDITOR_CONTENT');
      current.content.forEach((child) => walk(child, depth + 1));
    }
  }
  walk(node, 0);
  if ((node as TiptapNode).type !== 'doc' || JSON.stringify(node).length > 1000000)
    fail('INVALID_EDITOR_CONTENT');
  return node as TiptapNode;
}
