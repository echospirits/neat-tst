import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizeOhlqLoadDates, parseOhlqLoadDates, resolveOhlqBackfillDates } from '../lib/ohlqLoadDates';

test('explicit load batches retain exact dates and sort oldest first', () => {
  assert.deepEqual(normalizeOhlqLoadDates(['2026-11-18', '2026-11-17']), ['2026-11-17', '2026-11-18']);
  assert.deepEqual(parseOhlqLoadDates('2024-02-29,2024-02-28'), ['2024-02-28', '2024-02-29']);
  assert.deepEqual(resolveOhlqBackfillDates({ dates: '2026-11-18,2026-11-17' }, new Date('2026-11-25T12:00:00Z')), ['2026-11-17', '2026-11-18']);
});

async function runBackfill(argv: string[], failedDates: string[] = []) {
  const calls: Array<{ reportDate: string; deferIntelligence: boolean }> = [];
  const outputs: string[] = [];
  const intelligenceDates: string[] = [];
  const process = { argv: ['node', 'backfill-script', ...argv], env: { GITHUB_OUTPUT: 'test-output' }, exitCode: 0 };
  let disconnect!: () => void;
  const finished = new Promise<void>((resolve) => { disconnect = resolve; });
  const dependencies: Record<string, unknown> = {
    'node:fs': { appendFileSync: (_path: string, body: string) => outputs.push(body) },
    '../lib/environmentFile': { loadLocalEnvironmentFile: () => undefined },
    '../lib/ohlqAnnualSalesWorkflow': {
      runOhlqAnnualSalesWorkflow: async (input: { reportDate: string; deferIntelligence: boolean }) => {
        calls.push({ reportDate: input.reportDate, deferIntelligence: input.deferIntelligence });
        if (failedDates.includes(input.reportDate)) throw new Error('Download unavailable');
        return { reports: {}, ok: true, durationMs: 1 };
      },
    },
    '../lib/prisma': { prisma: { $disconnect: async () => { disconnect(); } } },
    '../lib/opportunityEngine': { runOpportunityIntelligenceAfterImport: async ({ reportDate }: { reportDate: Date }) => { intelligenceDates.push(reportDate.toISOString().slice(0, 10)); return { intelligence: { persisted: 1 } }; } },
    '../lib/agencyMarketIntelligenceService': { runAgencyMarketIntelligenceAfterImport: async () => ({}) },
    '../lib/ohlqAnnualSalesRetention': { pruneOhlqAnnualSalesRows: async () => ({}) },
    '../lib/ohlqDataStatus': { toOhlqDateOnlyUtc: (value: string) => new Date(`${value}T00:00:00Z`) },
    '../lib/ohlqReportStorage': { getOhlqReportStorageDirectories: () => ({}) },
    '../lib/ohlqLoadDates': { resolveOhlqBackfillDates },
  };
  const source = ts.transpileModule(readFileSync('scripts/backfill-ohlq-annual-sales.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(source, { exports: {}, process, console: { log: () => undefined, error: () => undefined }, require: (name: string) => { assert(name in dependencies, name); return dependencies[name]; } });
  await finished;
  return { calls, outputs, intelligenceDates, exitCode: process.exitCode };
}

test('explicit batch CLI imports oldest first and emits only the latest successful report date', async () => {
  const result = await runBackfill(['--dates', '2026-11-18,2026-11-17', '--import-only']);
  assert.deepEqual(result.calls, [{ reportDate: '2026-11-17', deferIntelligence: true }, { reportDate: '2026-11-18', deferIntelligence: true }]);
  assert.deepEqual(result.outputs, ['report_date=2026-11-18\n']);
  assert.equal(result.exitCode, 0);
});

test('a partial import-only batch attempts the newest date but stays failed and emits no success output', async () => {
  const result = await runBackfill(['--dates', '2026-11-18,2026-11-17', '--import-only'], ['2026-11-17']);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[1].reportDate, '2026-11-18');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.outputs, []);
});

test('full backfills still stop on failure and intelligence-only evaluates the latest frozen date once', async () => {
  const failed = await runBackfill(['--dates', '2026-11-18,2026-11-17'], ['2026-11-17']);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.exitCode, 1);
  const intelligence = await runBackfill(['--dates', '2026-11-18,2026-11-17', '--intelligence-only']);
  assert.deepEqual(intelligence.intelligenceDates, ['2026-11-18']);
  assert.equal(intelligence.calls.length, 0);
  assert.equal(intelligence.exitCode, 0);
});

test('missing, repeated and conflicting CLI selectors fail before any import', async () => {
  for (const argv of [['--dates'], ['--dates', '--import-only'], ['--date', '2026-11-18', '--date', '2026-11-17'], ['--dates', '2026-11-18', '--days', '2']]) {
    const result = await runBackfill(argv);
    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
    assert.equal(result.outputs.length, 0);
  }
});

test('load dates reject impossible dates, duplicates, empty entries and unbounded batches', () => {
  for (const dates of [[], ['2026-02-29'], ['2026-11-31'], ['2026-11-18', '2026-11-18'], [''], ['2026-11-18\n'], ['$(touch bad)'], Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)]) {
    assert.throws(() => normalizeOhlqLoadDates(dates));
  }
  for (const csv of ['', '2026-11-18,', '2026-11-18, 2026-11-17']) assert.throws(() => parseOhlqLoadDates(csv));
});

test('backfill requires exactly one explicit selector and preserves Eastern default dates', () => {
  for (const input of [{ date: '2026-11-18', dates: '2026-11-17' }, { dates: '2026-11-18', days: '2' }, { date: '2026-11-18', days: '2' }, { date: '' }, { days: '' }, { days: '0' }, { days: '31' }, { days: '1.5' }]) {
    assert.throws(() => resolveOhlqBackfillDates(input));
  }
  assert.deepEqual(resolveOhlqBackfillDates({ date: '2026-11-18' }), ['2026-11-18']);
  assert.deepEqual(resolveOhlqBackfillDates({ days: '2' }, new Date('2026-11-19T04:59:00Z')), ['2026-11-16', '2026-11-17']);
  assert.deepEqual(resolveOhlqBackfillDates({ days: '2' }, new Date('2026-11-19T05:00:00Z')), ['2026-11-17', '2026-11-18']);
  assert.equal(resolveOhlqBackfillDates({}, new Date('2026-11-19T12:00:00Z')).length, 7);
});
