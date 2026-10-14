#!/usr/bin/env node
// Builds one Markdown coverage table from any number of LCOV reports.
// LCOV is the shared format: c8/istanbul (`lcov` reporter) and coverage.py
// (`coverage lcov`, or pytest-cov `--cov-report=lcov`) both emit it, so every
// package, Node or Python, reports the same way.
//
// Usage: node scripts/coverage-summary.mjs <label>=<path/to/lcov.info> [...]
// Prints the table and appends it to $GITHUB_STEP_SUMMARY when that is set.
import { appendFile, readFile } from 'node:fs/promises';

const METRICS = [
  { label: 'Lines', found: 'LF', hit: 'LH' },
  { label: 'Functions', found: 'FNF', hit: 'FNH' },
  { label: 'Branches', found: 'BRF', hit: 'BRH' },
];

function parseLcov(text) {
  const totals = {};
  for (const metric of METRICS) {
    totals[metric.found] = 0;
    totals[metric.hit] = 0;
  }
  for (const line of text.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    if (key in totals) totals[key] += Number(line.slice(separator + 1)) || 0;
  }
  return totals;
}

function percent(hit, found) {
  if (found === 0) return 'n/a';
  return `${((hit / found) * 100).toFixed(2)}% (${hit}/${found})`;
}

async function main() {
  const reports = process.argv.slice(2);
  if (reports.length === 0) {
    console.error('Usage: node scripts/coverage-summary.mjs <label>=<lcov.info> [...]');
    process.exit(1);
  }
  const rows = [];
  for (const report of reports) {
    const separator = report.indexOf('=');
    if (separator === -1) throw new Error(`Expected <label>=<path>, got "${report}"`);
    const label = report.slice(0, separator);
    const totals = parseLcov(await readFile(report.slice(separator + 1), 'utf8'));
    const cells = METRICS.map((metric) => percent(totals[metric.hit], totals[metric.found]));
    rows.push(`| ${label} | ${cells.join(' | ')} |`);
  }
  const table = [
    '### Coverage',
    '',
    `| Package | ${METRICS.map((metric) => metric.label).join(' | ')} |`,
    `| --- | ${METRICS.map(() => '---').join(' | ')} |`,
    ...rows,
    '',
  ].join('\n');
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, table);
}

await main();
