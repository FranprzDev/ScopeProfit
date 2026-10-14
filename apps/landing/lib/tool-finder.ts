import type { Tool, ToolGroup } from '@/app/content';

export interface ToolMatch {
  tool: Tool;
  group: string;
  score: number;
}

const STOPWORDS = new Set([
  'algo',
  'como',
  'con',
  'del',
  'los',
  'las',
  'para',
  'por',
  'que',
  'quiero',
  'una',
  'uno',
  'unos',
]);

const KEYWORD_WEIGHT = 3;
const TEXT_WEIGHT = 1;
const MIN_PREFIX = 4;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function words(value: string): string[] {
  const result: string[] = [];
  for (const word of normalize(value).split(/[^a-z0-9]+/)) {
    if (word.length >= 3 && !STOPWORDS.has(word)) {
      result.push(word);
    }
  }
  return result;
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < MIN_PREFIX || b.length < MIN_PREFIX) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function scoreTool(tool: Tool, queryWords: string[]): number {
  const keywordWords = words(tool.keywords.join(' '));
  const textWords = words(`${tool.name.replace(/_/g, ' ')} ${tool.text}`);
  let score = 0;
  for (const queryWord of queryWords) {
    if (keywordWords.some((word) => sameWord(word, queryWord))) score += KEYWORD_WEIGHT;
    if (textWords.some((word) => sameWord(word, queryWord))) score += TEXT_WEIGHT;
  }
  return score;
}

/** Ranks the real MCP tools against what a visitor would ask their assistant. Ties keep catalogue order. */
export function findTools(query: string, groups: ToolGroup[], limit = 3): ToolMatch[] {
  const queryWords = words(query);
  if (queryWords.length === 0) return [];
  const matches: ToolMatch[] = [];
  for (const group of groups) {
    for (const tool of group.tools) {
      const score = scoreTool(tool, queryWords);
      if (score > 0) matches.push({ tool, group: group.title, score });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
