import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { runSupplyJobs } from '../lib/productionSupplies/jobs';
import { refreshSupplyShipmentTracking } from '../lib/productionSupplies/tracking';
import { syncSupplyMailbox } from '../lib/productionSupplies/mail';

function queueFake() {
  const mailboxes = [{ organizationId: 'org-one', userId: 'joe', next: 1 }, { organizationId: 'org-one', userId: 'karl', next: 2 }, { organizationId: 'org-one', userId: 'nikhil', next: 3 }];
  const shipments = [{ id: 'shipment-one', organizationId: 'org-one', next: 1 }, { id: 'shipment-two', organizationId: 'org-two', next: 2 }, { id: 'shipment-three', organizationId: 'org-one', next: 3 }];
  const selections: Array<{ kind: string; args: Record<string, unknown> }> = [];
  const db = {
    organization: { findMany: async () => [{ id: 'org-one' }, { id: 'org-two' }] },
    supplyMailboxSync: { findMany: async (args: Record<string, unknown>) => { selections.push({ kind: 'mail', args }); return [...mailboxes].sort((a, b) => a.next - b.next).slice(0, Number(args.take)); } },
    supplyShipment: { findMany: async (args: Record<string, unknown>) => { selections.push({ kind: 'tracking', args }); return [...shipments].sort((a, b) => a.next - b.next).slice(0, Number(args.take)); } },
  };
  return { db: db as unknown as PrismaClient, mailboxes, shipments, selections };
}

test('global due scheduling bounds work and advances fairly between Production people and tenants', async () => {
  const fake = queueFake(), mailRuns: string[] = [], trackingRuns: string[] = [];
  const services = {
    reconcile: async () => ['unused-membership-array'],
    mailbox: (async (_org, user, _db, options) => { assert.equal(options?.budgetMs, 120_000); mailRuns.push(user); fake.mailboxes.find(item => item.userId === user)!.next += 10; return { processed: 1 }; }) as typeof syncSupplyMailbox,
    tracking: (async (_org, shipment, _db, options) => { assert.equal(options?.timeoutMs, 8000); assert.equal(options?.maxAttempts, 2); trackingRuns.push(shipment); fake.shipments.find(item => item.id === shipment)!.next += 10; return { status: 'updated' }; }) as typeof refreshSupplyShipmentTracking,
  };
  const first = await runSupplyJobs(fake.db, services);
  assert.deepEqual(mailRuns, ['joe', 'karl']);
  assert.deepEqual(trackingRuns, ['shipment-one', 'shipment-two']);
  assert.equal(first.mailboxChecks, 2);
  assert.equal(first.tracking.length, 2);
  await runSupplyJobs(fake.db, services);
  assert.equal(mailRuns[2], 'nikhil');
  assert.equal(trackingRuns[2], 'shipment-three');
  assert.deepEqual(fake.selections[0].args.orderBy, [{ nextCheckAt: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(fake.selections[1].args.orderBy, [{ nextSyncAt: 'asc' }, { id: 'asc' }]);
  assert.equal((fake.selections[1].args.where as { organizationId: { in: string[] } }).organizationId.in.length, 2);
});

test('tracking and both mailbox lanes start concurrently; one provider failure does not stop other work', async () => {
  const fake = queueFake(), started: string[] = [];
  let release!: () => void, allStarted!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const startedGate = new Promise<void>(resolve => { allStarted = resolve; });
  const mark = (value: string) => { started.push(value); if (started.length >= 3) allStarted(); };
  const running = runSupplyJobs(fake.db, {
    reconcile: async () => [],
    mailbox: (async (_org, user) => { mark(user); await gate; if (user === 'joe') throw new Error('one mailbox disconnected'); return { processed: 1 }; }) as typeof syncSupplyMailbox,
    tracking: (async (_org, shipment) => { mark(shipment); await gate; return { status: 'updated' }; }) as typeof refreshSupplyShipmentTracking,
  });
  await startedGate;
  assert.equal(started[0], 'shipment-one');
  assert.ok(started.includes('joe') && started.includes('karl'));
  release();
  const result = await running;
  assert.equal(result.mailboxErrors, 1);
  assert.equal(result.mailboxChecks, 1);
  assert.equal(result.tracking.length, 2);
});

test('slow reconciliation defers metadata work and leaves queue selection bounded', async () => {
  const fake = queueFake();
  let elapsed = 0, reconciled = 0;
  const result = await runSupplyJobs(fake.db, {
    clock: () => elapsed,
    reconcile: async () => { reconciled++; elapsed = 30_000; return []; },
    mailbox: (async () => ({ processed: 0, continuation: false })) as typeof syncSupplyMailbox,
    tracking: (async () => ({ status: 'updated' })) as typeof refreshSupplyShipmentTracking,
  });
  assert.equal(reconciled, 1);
  assert.equal(result.deferred, true);
  assert.ok(fake.selections.every(selection => selection.args.take === 2));
});
