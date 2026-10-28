import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { ECHO_ORGANIZATION_ID as ECHO } from '../lib/echoAccess';
import { getOrganizationOhlqCredentials } from '../lib/ohlqTenantCredentials';
import { importOhlqAgencyInventoryCsv } from '../lib/ohlqAgencyInventoryImport';
import { refreshAgencyIntelligence } from '../lib/agencyIntelligenceService';
import { refreshAgencyMarketIntelligence } from '../lib/agencyMarketIntelligenceService';
import { evaluateWholesaleAssessments } from '../lib/wholesaleAssessmentService';
import { forecastAccess } from '../lib/productionForecasting/import';
import { communicationsPilotEnabled } from '../lib/crm/communicationsPilot';
import { receiveSms } from '../lib/crm/sms/service';
import { discoverOrganizationProducts, discoverProductsForOrganizations } from '../lib/organizationProductDiscovery';

// Execute the delivered worker entry points with fixture databases/providers.
function load(path: string, mocks: Record<string, unknown>) {
  const filename = resolve(path), nativeRequire = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(code, { exports, process, Buffer, Date, URL, URLSearchParams, Request, Response, TextEncoder, console,
    require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name),
  }, { filename });
  return exports;
}

test('explicit foreign worker targets fail before reading credentials or writing data', async () => {
  const db: any = new Proxy({}, { get() { assert.fail('outside target must stop before database access'); } });
  await assert.rejects(getOrganizationOhlqCredentials('outside', db), /restricted to Echo/);
  await assert.rejects(discoverOrganizationProducts({ db, organizationId: 'outside' }), /restricted to Echo/);
  await assert.rejects(importOhlqAgencyInventoryCsv({ csv: '', reportDate: '2026-10-28', organizationId: 'outside', db }), /restricted to Echo/);
  await assert.rejects(refreshAgencyIntelligence({ db, organizationId: 'outside', inventoryReportDate: new Date(), salesReportDate: new Date() }), /restricted to Echo/);
  await assert.rejects(refreshAgencyMarketIntelligence({ db, organizationId: 'outside', asOfDate: new Date() }), /restricted to Echo/);
  await assert.rejects(evaluateWholesaleAssessments({ db, organizationId: 'outside' }), /restricted to Echo/);
  await assert.rejects(forecastAccess(db, 'outside'), /restricted to Echo/);
  assert.equal(await communicationsPilotEnabled(db, 'outside'), false);
  assert.equal(await receiveSms(db, { id: 'old-sender', organizationId: 'outside', createdByUserId: 'old-owner', provider: 'TWILIO' },
    { MessageSid: 'stop', From: '+16145550123', Body: 'STOP' }), null);
});

test('scheduled product discovery selects active Echo and skips retained outside organizations', async () => {
  const db: any = { organization: { findMany: async ({ where }: any) => {
    assert.equal(where.id, ECHO); assert.equal(where.active, true); assert.equal(where.vendorIdentifiers.some.active, true);
    return [{ id: 'outside' }];
  } } };
  const result = await discoverProductsForOrganizations({ db });
  assert.equal(result.organizationsScanned, 0); assert.equal(result.productsDiscovered, 0);
});

test('forecast workflow selects entitled Echo and rejects stale outside selection before refresh', async () => {
  const calls: string[] = [];
  const worker = load('lib/productionForecasting/workflow.ts', {
    '../prisma': { prisma: { organization: { findMany: async ({ where }: any) => {
      assert.equal(where.id, ECHO); assert.equal(where.active, true);
      assert.equal(where.features.some.featureKey, 'PRODUCTION_FORECASTING');
      return [{ id: ECHO }, { id: 'outside' }];
    } } } },
    '../appEnvironment': { isSideEffectEnabled: () => true },
    './service': { refreshProductionForecast: async (id: string) => calls.push(id) },
  });
  const result = await worker.productionForecastWorkflow();
  assert.equal(result.completed, 1); assert.equal(result.failed, 0); assert.deepEqual(calls, [ECHO]);
});

test('mailbox retention deletes only Echo expiry and retains outside connections and activities', async () => {
  const writes: string[] = [];
  const rows = [{ id: 'echo-mail', organizationId: ECHO, retentionDays: 90 }, { id: 'outside-mail', organizationId: 'outside', retentionDays: 1 }];
  const db = {
    mailboxConnection: {
      findMany: async ({ where }: any) => { assert.equal(where.organizationId, ECHO); return rows; },
      updateMany: async ({ where }: any) => { writes.push(`checkpoint:${where.organizationId}`); return { count: 1 }; },
    },
    accountActivity: { deleteMany: async ({ where }: any) => { writes.push(`delete:${where.organizationId}:${where.connectionId}`); return { count: 2 }; } },
    $transaction: async (work: (tx: unknown) => unknown) => work(db),
  };
  const worker = load('lib/crm/mail/sync.ts', { '../../prisma': { prisma: db } });
  assert.equal(await worker.sweepMailboxRetention(), 2);
  assert.deepEqual(writes, [`delete:${ECHO}:echo-mail`, `checkpoint:${ECHO}`]);
  assert.equal(rows[1].organizationId, 'outside');
});

test('communications cron keeps secret and environment gates and dispatches only Echo mailboxes', async () => {
  const before = process.env.CRON_SECRET, mailBefore = process.env.CRM_MAIL_ENABLED;
  process.env.CRON_SECRET = 'fixture-secret'; process.env.CRM_MAIL_ENABLED = 'true';
  let enabled = false, reads = 0, retention = 0;
  const calls: string[] = [];
  try {
    const worker = load('app/api/cron/communications/route.ts', {
      '../../../../lib/prisma': { prisma: { mailboxConnection: { findMany: async ({ where }: any) => {
        reads++; assert.equal(where.organizationId, ECHO); assert.equal(where.user.organizationId, ECHO);
        assert.equal(where.organization.active, true);
        return [{ id: 'echo', userId: 'owner', organizationId: ECHO }, { id: 'outside', userId: 'other', organizationId: 'outside' }];
      } } }, runWithOrganizationStateAccess: async (id: string, work: () => unknown) => { assert.equal(id, ECHO); return work(); } },
      '../../../../lib/appEnvironment': { isSideEffectEnabled: () => enabled },
      '../../../../lib/crm/mail/sync': { sweepMailboxRetention: async () => { retention++; return 0; }, syncMailbox: async (actor: any, id: string) => { assert.equal(actor.organizationId, ECHO); calls.push(id); } },
    });
    const request = (auth?: string) => new Request('https://fixture.invalid/api/cron/communications', { headers: auth ? { authorization: auth } : {} });
    assert.equal((await worker.GET(request())).status, 401);
    assert.equal((await (await worker.GET(request('Bearer fixture-secret'))).json()).status, 'disabled');
    assert.equal(reads, 0); assert.equal(retention, 0);
    enabled = true;
    const result = await (await worker.GET(request('Bearer fixture-secret'))).json();
    assert.equal(result.processed, 1); assert.equal(result.failed, 0); assert.deepEqual(calls, ['echo']);
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before;
    if (mailBefore === undefined) delete process.env.CRM_MAIL_ENABLED; else process.env.CRM_MAIL_ENABLED = mailBefore;
  }
});

test('outside SMS callbacks stop before credential decryption, signature checks or delivery/consent writes', async () => {
  const worker = load('app/api/crm/sms/[id]/route.ts', {
    '../../../../../lib/prisma': { prisma: { smsConnection: { findUnique: async () => ({ id: 'old', organizationId: 'outside', provider: 'TWILIO', credentialsEncrypted: 'fixture' }) } } },
    '../../../../../lib/calendar/crypto': { decryptCalendarToken: () => assert.fail('must not decrypt outside credential') },
  });
  const result = await worker.POST(new Request('https://fixture.invalid/api/crm/sms/old', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'Body=STOP' }), { params: Promise.resolve({ id: 'old' }) });
  assert.equal(result.status, 401); assert.equal(result.headers.get('set-cookie'), null);
});

test('automatic research resumes only Echo runs and creates no fallback ownership in another company', async () => {
  const events: string[] = [];
  const db: any = {
    organization: { findFirst: async ({ where }: any) => { assert.equal(where.id, ECHO); events.push('echo-owner'); return { id: ECHO }; } },
    accountResearchPilot: { findFirst: async ({ where, select }: any) => { assert.equal(where.organizationId, ECHO); return select.organizationId ? { id: 'stale-run', organizationId: 'outside' } : null; } },
    accountResearchJob: {
      count: async ({ where }: any) => { assert.equal(where.organizationId, ECHO); return 0; },
      findMany: async ({ where }: any) => { assert.equal(where.organizationId, ECHO); return []; },
      groupBy: async ({ where }: any) => { assert.equal(where.organizationId, ECHO); return []; },
    },
  };
  const worker = load('lib/accountResearchAutomation.ts', {
    './accountResearchOpenAI': { assertAccountResearchAutomationEnabled() {} },
    './accountResearchQueue': { getPrioritizedAccountResearchQueue: async ({ organizationId }: any) => { assert.equal(organizationId, ECHO); return []; } },
    './accountResearchPilotService': { pollAccountResearchPilot: () => assert.fail('outside run must not poll'), submitQueuedPilotJobs: () => assert.fail('outside run must not submit') },
  });
  const result = await worker.runAutomaticAccountResearch({ db });
  assert.equal(result.submitted, 0); assert.equal(result.outstandingJobs, 0); assert.deepEqual(events, ['echo-owner']);
});

test('an existing Echo research run still polls and submits a bounded wave', async () => {
  let polled = 0, submitted = 0;
  const db: any = {
    accountResearchPilot: {
      findFirst: async ({ where, select }: any) => { assert.equal(where.organizationId, ECHO); return select.organizationId ? { id: 'echo-run', organizationId: ECHO } : null; },
      findUnique: async () => ({ status: 'RUNNING' }),
    },
    accountResearchJob: { count: async () => 0, findMany: async () => [], groupBy: async () => [] },
  };
  const worker = load('lib/accountResearchAutomation.ts', {
    './accountResearchOpenAI': { assertAccountResearchAutomationEnabled() {} },
    './accountResearchQueue': { getPrioritizedAccountResearchQueue: async ({ organizationId }: any) => { assert.equal(organizationId, ECHO); return []; } },
    './accountResearchPilotService': {
      pollAccountResearchPilot: async ({ organizationId, pilotId }: any) => { assert.equal(organizationId, ECHO); assert.equal(pilotId, 'echo-run'); polled++; return { checked: 0 }; },
      submitQueuedPilotJobs: async ({ organizationId, take }: any) => { assert.equal(organizationId, ECHO); assert.equal(take, 3); submitted++; return { submitted: 3, failed: 0, paused: false, remaining: 0 }; },
    },
  });
  const result = await worker.runAutomaticAccountResearch({ db, remainingRunCapacity: 3 });
  assert.equal(polled, 1); assert.equal(submitted, 1); assert.equal(result.submitted, 3); assert.equal(result.runLimitReached, true);
});
