import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma, TastingEvent } from '@prisma/client';
import { completeTastingFromVisit, requireTastingExecutionContext, tastingScheduleFingerprint } from '../lib/tastings/execution';

const now = new Date('2026-11-05T23:30:00Z');
const actor = { organizationId: 'org-a', userId: 'taster-a' };
function fixture() {
  const event = { id: 'tasting-a', organizationId: 'org-a', agencyId: 'agency-internal', assignedTasterUserId: 'taster-a', scheduledDate: new Date('2026-11-05'), startsAt: new Date('2026-11-05T23:00:00Z'), endsAt: new Date('2026-11-06T01:00:00Z'), cancelledAt: null, completedAt: null, completedVisitId: null, agencyApproval: 'APPROVED', stateApproval: 'APPROVED', version: 1 } as TastingEvent;
  const photo = { organizationId: 'org-a', storageKey: 'visit-photos/proof.jpg', contentType: 'image/jpeg', sizeBytes: 200 };
  const visit = { id: 'visit-a', organizationId: 'org-a', tastingEventId: event.id, agencyId: event.agencyId, createdByUserId: 'taster-a', locationType: 'agency', visitAt: now, photos: [photo] };
  const history: unknown[] = [];
  let entitled = true;
  const db = {
    $executeRaw: async () => 1,
    organizationFeature: { findFirst: async ({ where }: any) => entitled && where.organizationId === 'org-a' && where.featureKey === 'TASTING_MANAGEMENT' ? { id: 'feature' } : null },
    user: { findFirst: async ({ where }: any) => where.organizationId === 'org-a' && where.id === 'taster-a' ? { id: 'taster-a' } : null },
    organization: { findFirst: async ({ where }: any) => where.id === 'org-a' ? { id: 'org-a' } : null },
    tastingEvent: { findFirst: async ({ where }: any) => where.id === event.id && where.organizationId === event.organizationId ? event : null, update: async ({ where, data }: any) => { assert.equal(where.organizationId_id.organizationId, event.organizationId); Object.assign(event, { ...data, version: event.version + 1 }); return event; } },
    tastingWorkflowEvent: { create: async ({ data }: any) => { history.push(data); } },
    loggedVisit: { findFirst: async ({ where }: any) => Object.entries(where).every(([key, value]) => (visit as any)[key] === value) ? { ...visit, photos: visit.photos.filter(p => p.organizationId === actor.organizationId && p.storageKey && p.contentType.startsWith('image/') && p.sizeBytes > 0) } : null },
  } as unknown as Prisma.TransactionClient;
  return { db, event, visit, history, disable: () => { entitled = false; } };
}

test('linked tasting context requires entitlement, same tenant, assignment, account and NY business date', async () => {
  const f = fixture();
  assert.equal((await requireTastingExecutionContext(f.db, actor, f.event.id, { agencyId: f.event.agencyId, now })).id, f.event.id);
  for (const wrong of [{ ...actor, organizationId: 'org-b' }, { ...actor, userId: 'other-user' }]) await assert.rejects(requireTastingExecutionContext(f.db, wrong, f.event.id, { now }), /unavailable|assigned/);
  await assert.rejects(requireTastingExecutionContext(f.db, actor, f.event.id, { agencyId: 'wrong-agency', now }), /same retail account/);
  await assert.rejects(requireTastingExecutionContext(f.db, actor, f.event.id, { now: new Date('2026-11-06T05:01:00Z') }), /scheduled date/);
  // 00:30 UTC still belongs to the previous New York date.
  assert.ok(await requireTastingExecutionContext(f.db, actor, f.event.id, { now: new Date('2026-11-06T00:30:00Z') }));
  f.disable();
  await assert.rejects(requireTastingExecutionContext(f.db, actor, f.event.id, { now }), /unavailable/);
});

test('completion needs persisted verified photo evidence and never treats missing photos or wrong day as complete', async () => {
  for (const invalid of ['missing-photo', 'foreign-photo', 'url-only', 'wrong-date', 'wrong-account', 'wrong-taster'] as const) {
    const f = fixture();
    if (invalid === 'missing-photo') f.visit.photos = [];
    if (invalid === 'foreign-photo') f.visit.photos[0].organizationId = 'org-b';
    if (invalid === 'url-only') f.visit.photos[0].storageKey = '';
    if (invalid === 'wrong-date') f.visit.visitAt = new Date('2026-11-04T22:00:00Z');
    if (invalid === 'wrong-account') f.visit.agencyId = 'other-agency';
    if (invalid === 'wrong-taster') f.visit.createdByUserId = 'other-taster';
    await assert.rejects(completeTastingFromVisit(f.db, actor, { tastingId: f.event.id, visitId: f.visit.id, fingerprint: tastingScheduleFingerprint(f.event), now }), /verified photo/);
    assert.equal(f.event.completedAt, null); assert.equal(f.history.length, 0);
  }
});

test('a qualifying Visit completes exactly once and preserves completed evidence on retries', async () => {
  const f = fixture();
  const input = { tastingId: f.event.id, visitId: f.visit.id, fingerprint: tastingScheduleFingerprint(f.event), now };
  await completeTastingFromVisit(f.db, actor, input);
  assert.equal(f.event.completedVisitId, f.visit.id); assert.equal(f.event.completedAt, now); assert.equal(f.history.length, 1);
  await completeTastingFromVisit(f.db, actor, input);
  assert.equal(f.history.length, 1);
  await assert.rejects(completeTastingFromVisit(f.db, { ...actor, userId: 'other-user' }, input), /unavailable|assigned/);
  await assert.rejects(completeTastingFromVisit(f.db, actor, { ...input, visitId: 'different-visit' }), /already has/);
});

test('schedule/assignment changes or cancellation during upload cannot complete another proposal', async () => {
  for (const change of ['startsAt', 'agencyId', 'assignedTasterUserId', 'cancelledAt', 'agencyApproval', 'stateApproval'] as const) {
    const f = fixture(); const fingerprint = tastingScheduleFingerprint(f.event);
    if (change === 'startsAt') f.event.startsAt = new Date('2026-11-05T22:00:00Z');
    if (change === 'agencyId') f.event.agencyId = 'another-store';
    if (change === 'assignedTasterUserId') f.event.assignedTasterUserId = 'another-taster';
    if (change === 'cancelledAt') f.event.cancelledAt = now;
    if (change === 'agencyApproval') f.event.agencyApproval = 'DENIED';
    if (change === 'stateApproval') f.event.stateApproval = 'DENIED';
    await assert.rejects(completeTastingFromVisit(f.db, actor, { tastingId: f.event.id, visitId: f.visit.id, fingerprint, now }));
    assert.equal(f.event.completedAt, null); assert.equal(f.history.length, 0);
  }
});
