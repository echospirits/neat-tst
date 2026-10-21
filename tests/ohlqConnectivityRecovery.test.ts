import assert from 'node:assert/strict';
import test from 'node:test';
import { OhlqReportDataSource, type PrismaClient } from '@prisma/client';
import { retryDatabaseStatusWrite } from '../lib/databaseStatusRetry';
import { recordOhlqReportRunStarted } from '../lib/ohlqDataStatus';
import { assertAgencyIntelligenceInputsComplete } from '../lib/agencyIntelligenceService';
import { runOhlqTenantInventoryWorkflow } from '../lib/ohlqTenantInventoryWorkflow';

test('status retries are bounded, sanitized, and exclude permanent errors', async () => {
  const delays: number[] = [], warnings: string[] = [];
  let calls = 0;
  const error = { code: 'P1001', message: 'secret connection details' };
  await assert.rejects(retryDatabaseStatusWrite(async () => { calls++; throw error; }, {
    sleep: async ms => { delays.push(ms); }, warn: message => { warnings.push(message); },
  }), caught => caught === error);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
  assert.ok(warnings.every(message => !message.includes('secret')));
  for (const code of ['P1000', 'P2002', 'P2003', 'P2025', undefined]) {
    calls = 0;
    await assert.rejects(retryDatabaseStatusWrite(async () => { calls++; throw { code }; }));
    assert.equal(calls, 1);
  }
});

test('sales start status recovers with the same key and timestamp', async () => {
  const writes: unknown[] = [];
  const db = { ohlqReportImportStatus: { upsert: async (args: unknown) => {
    writes.push(args);
    if (writes.length === 1) throw { code: 'P1001' };
    return args;
  } } } as unknown as PrismaClient;
  await recordOhlqReportRunStarted({ db, reportDate: '2026-10-20', source: OhlqReportDataSource.ANNUAL_SALES_SUMMARY });
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
});

test('intelligence readiness retries a transient read but still rejects incomplete inputs', async () => {
  let calls = 0;
  const db = {
    ohlqReportImportStatus: { findMany: async () => [{ status: 'COMPLETED' }, { status: 'COMPLETED' }] },
    ohlqTenantInventoryImportStatus: { findUnique: async () => {
      if (++calls === 1) throw { code: 'P1001' };
      return { status: 'COMPLETED' };
    } },
  } as unknown as PrismaClient;
  const options = { db, organizationId: 'org-a', inventoryReportDate: new Date(), salesReportDate: new Date() };
  await assertAgencyIntelligenceInputsComplete(options);
  assert.equal(calls, 2);
  (db.ohlqTenantInventoryImportStatus.findUnique as unknown) = async () => ({ status: 'ERRORED' });
  await assert.rejects(assertAgencyIntelligenceInputsComplete(options), /required OHLQ inputs/);
});

for (const failedStage of ['intelligence', 'import', 'start'] as const) {
  test(`inventory retains truthful status when ${failedStage} fails and continues other tenants`, async () => {
    const previous = process.env.OHLQ_TENANT_CREDENTIAL_ENCRYPTION_KEY;
    process.env.OHLQ_TENANT_CREDENTIAL_ENCRYPTION_KEY = 'test-key';
    try {
      const states: Record<string, string[]> = {};
      const imports: string[] = [], refreshes: string[] = [];
      const db = {
        organization: { findMany: async () => ['org-a', 'org-b'].map(id => ({ id, displayName: id, features: [{}], accountOverlays: [] })) },
        ohlqReportImportStatus: { findFirst: async () => ({ reportDate: new Date('2026-10-20') }) },
        ohlqTenantInventoryImportStatus: { upsert: async ({ where, update }: any) => {
          const id = where.organizationId_reportDate.organizationId;
          if (failedStage === 'start' && id === 'org-a' && update.status === 'RUNNING') throw { code: 'P1000' };
          (states[id] ??= []).push(update.status);
          return {};
        } },
      } as unknown as PrismaClient;
      type Services = NonNullable<NonNullable<Parameters<typeof runOhlqTenantInventoryWorkflow>[0]>['services']>;
      const services = {
        credentials: async () => ({ username: 'test', password: 'test' }),
        download: async () => ({ csvBuffer: Buffer.from('test'), reportDate: '2026-10-21', filename: 'test.csv', sizeBytes: 4 }),
        importCsv: async ({ organizationId }: any) => {
          imports.push(organizationId);
          if (failedStage === 'import' && organizationId === 'org-a') throw new Error('import failed');
          return { importedRows: 1, deletedRows: 0, parsedRows: 1, skippedRows: 0, diagnostics: {}, reportDate: '2026-10-21' };
        },
        refresh: async ({ organizationId }: any) => {
          refreshes.push(organizationId);
          if (failedStage === 'intelligence' && organizationId === 'org-a') throw { code: 'P1001' };
          return {};
        },
      } as unknown as Services;
      await assert.rejects(runOhlqTenantInventoryWorkflow({ db, services, logger: { log() {}, error() {} } }),
        failedStage === 'intelligence' ? /import failures: none; retail intelligence failures after successful import: org-a/ : /import failures: org-a/);
      assert.equal(states['org-a'].at(-1), failedStage === 'intelligence' ? 'COMPLETED' : 'ERRORED');
      assert.equal(states['org-b'].at(-1), 'COMPLETED');
      assert.equal(imports.filter(id => id === 'org-a').length, failedStage === 'start' ? 0 : 1);
      assert.ok(refreshes.includes('org-b'));
    } finally {
      if (previous === undefined) delete process.env.OHLQ_TENANT_CREDENTIAL_ENCRYPTION_KEY;
      else process.env.OHLQ_TENANT_CREDENTIAL_ENCRYPTION_KEY = previous;
    }
  });
}
