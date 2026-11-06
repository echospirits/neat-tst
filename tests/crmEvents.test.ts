import test from "node:test";
import assert from "node:assert/strict";
import { eventWindows, saveEvent } from "../lib/crm/events";
import type { CrmDb } from "../lib/crm/activity";
import { EventbriteProvider, MockEventProvider } from "../lib/crm/eventbrite";
import { isTerminalTasting } from "../lib/tastings/model";
import { activeTastingWhere } from "../lib/tastings/statusWhere";
test("event comparison windows exclude event day and use equal spans", () => {
  const w = eventWindows(
    new Date("2026-10-11T12:00:00Z"),
    30,
    "PREVIOUS_PERIOD",
  );
  assert.equal(w.beforeEnd.toISOString(), "2026-10-11T00:00:00.000Z");
  assert.equal(w.afterStart.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(
    w.afterEnd.getTime() - w.afterStart.getTime(),
    w.beforeEnd.getTime() - w.beforeStart.getTime(),
  );
});
test("Eventbrite maps paginated responses without importing attendee PII", async () => {
  let checked = false;
  const fetcher = (async (url: URL, options: RequestInit) => {
    checked = true;
    assert.equal(url.origin, "https://www.eventbriteapi.com");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(
      (options.headers as Record<string, string>).Authorization,
      "Bearer fixture",
    );
    return new Response(
      JSON.stringify({
        events: [
          {
            id: "42",
            name: { text: "Tour" },
            start: { utc: "2026-11-01T19:00:00Z" },
            end: { utc: "2026-11-01T20:00:00Z" },
            status: "live",
            venue: { name: "Visitor center" },
          },
        ],
        pagination: { has_more_items: true },
      }),
    );
  }) as typeof fetch;
  const page = await new EventbriteProvider("fixture", "123", fetcher).page(
    "2",
  );
  assert.ok(checked);
  assert.equal(page.cursor, "3");
  assert.equal(page.events[0].title, "Tour");
  await assert.rejects(() =>
    new EventbriteProvider("fixture", "123", fetcher).page(
      "https://attacker.invalid",
    ),
  );
  assert.equal((await new MockEventProvider().page()).events.length, 1);
});

function eventScheduleFixture({ enabled = true, tasting = null, eventConflict = false, existing = null }: {
  enabled?: boolean;
  tasting?: { id: string; organizationId: string; assignedTasterUserId: string; startsAt: Date; endsAt: Date; cancelledAt?: Date | null; completedAt?: Date | null; agencyApproval?: string; stateApproval?: string; workflowStatusOverride?: string | null } | null;
  eventConflict?: boolean;
  existing?: { id: string; version: number } | null;
} = {}) {
  const locks: string[] = [];
  const lookups: Array<{ kind: string; query: any }> = [];
  const created: any[] = [];
  const audit: any[] = [];
  const db = {
    $executeRaw: async (_strings: TemplateStringsArray, key: string) => { locks.push(key); return 1; },
    user: { count: async ({ where }: any) => { assert.equal(where.organizationId, 'org-a'); return where.id.in.length; } },
    organizationFeature: { findFirst: async (query: any) => {
      lookups.push({ kind: 'feature', query });
      assert.equal(query.where.organizationId, 'org-a');
      assert.equal(query.where.featureKey, 'TASTING_MANAGEMENT');
      return enabled ? { id: 'pilot' } : null;
    } },
    tastingEvent: { findFirst: async (query: any) => {
      lookups.push({ kind: 'tasting', query });
      const where = query.where;
      assert.deepEqual(where.AND, [activeTastingWhere]);
      return tasting && tasting.organizationId === where.organizationId && where.assignedTasterUserId.in.includes(tasting.assignedTasterUserId)
        && !isTerminalTasting({ ...tasting, agencyApproval: tasting.agencyApproval ?? 'NOT_REQUESTED', stateApproval: tasting.stateApproval ?? 'NOT_SUBMITTED' })
        && tasting.startsAt < where.startsAt.lt && tasting.endsAt > where.endsAt.gt ? { id: tasting.id } : null;
    } },
    eventShift: {
      findUnique: async () => existing,
      findFirst: async (query: any) => { lookups.push({ kind: 'event', query }); return query.where.status && eventConflict ? { id: 'other-event' } : null; },
      create: async ({ data }: any) => { const record = { ...data, id: 'event-created', version: 1 }; created.push(record); return record; },
    },
    organizationAuditEvent: { create: async ({ data }: any) => { audit.push(data); return data; } },
  };
  const input = {
    version: 0, submissionKey: '123e4567-e89b-42d3-a456-426614174000', title: 'Staff training',
    startsAt: new Date('2026-11-20T21:00:00.000Z'), endsAt: new Date('2026-11-20T22:00:00.000Z'),
    location: 'Visitor center', staffUserIds: ['taster-a'], eventType: 'TRAINING', status: 'open', attendance: null,
    details: { products: '', samples: null, cost: null, outcomes: '', photoLinks: '', windowDays: 30, comparison: 'PREVIOUS_PERIOD' },
  };
  return { db: db as unknown as CrmDb, input, locks, lookups, created, audit };
}
const tastingConflict = {
  id: 'tasting-a', organizationId: 'org-a', assignedTasterUserId: 'taster-a',
  startsAt: new Date('2026-11-20T20:00:00.000Z'), endsAt: new Date('2026-11-20T21:30:00.000Z'),
};
const eventActor = { organizationId: 'org-a', userId: 'admin-a' };

test('generic event scheduling rejects overlapping active tasting assignments under the shared scheduling lock', async () => {
  const f = eventScheduleFixture({ tasting: tastingConflict });
  await assert.rejects(saveEvent(f.db, eventActor, f.input), /overlapping tasting/);
  assert.deepEqual(f.locks, ['tasting:org-a', 'events:org-a']);
  assert.equal(f.created.length, 0);
  assert.equal(f.audit.length, 0);
  const where = f.lookups.find(call => call.kind === 'tasting')!.query.where;
  assert.equal(where.organizationId, 'org-a');
  assert.equal(where.AND[0].completedAt, null);
  const legacyActive = where.AND[0].OR[1].AND[1];
  assert.equal(legacyActive.cancelledAt, null);
  assert.equal(legacyActive.agencyApproval.not, 'DENIED');
  assert.equal(legacyActive.stateApproval.not, 'DENIED');
});

test('generic events ignore foreign, terminal and adjacent tasting assignments and keep their ordinary event checks', async () => {
  for (const changes of [
    { organizationId: 'org-b' }, { cancelledAt: new Date() }, { completedAt: new Date() },
    { agencyApproval: 'DENIED' }, { stateApproval: 'DENIED' },
    { workflowStatusOverride: 'COMPLETED' }, { workflowStatusOverride: 'CANCELLED' },
    { workflowStatusOverride: 'AGENCY_DENIED' }, { workflowStatusOverride: 'STATE_DENIED' },
    { completedAt: new Date(), workflowStatusOverride: 'DRAFT' },
    { endsAt: new Date('2026-11-20T21:00:00.000Z') },
  ]) {
    const f = eventScheduleFixture({ tasting: { ...tastingConflict, ...changes } });
    await saveEvent(f.db, eventActor, f.input);
    assert.equal(f.created.length, 1);
    assert.equal(f.audit.length, 1);
  }
  const ordinary = eventScheduleFixture({ eventConflict: true });
  await assert.rejects(saveEvent(ordinary.db, eventActor, ordinary.input), /overlapping event/);
});

test('generic events cannot overlap a reopened tasting even when its earlier cancelled or denied milestones remain', async () => {
  for (const changes of [
    { cancelledAt: new Date(), workflowStatusOverride: 'DRAFT' },
    { agencyApproval: 'DENIED', workflowStatusOverride: 'TASTER_APPROVED' },
    { stateApproval: 'DENIED', workflowStatusOverride: 'STATE_APPROVED' },
  ]) {
    const f = eventScheduleFixture({ tasting: { ...tastingConflict, ...changes } });
    await assert.rejects(saveEvent(f.db, eventActor, f.input), /overlapping tasting/);
    assert.equal(f.created.length, 0);
    assert.equal(f.audit.length, 0);
  }
});

test('a dark tasting pilot never queries tasting assignments while generic event creation remains available', async () => {
  const f = eventScheduleFixture({ enabled: false, tasting: tastingConflict });
  await saveEvent(f.db, eventActor, f.input);
  assert.equal(f.lookups.filter(call => call.kind === 'tasting').length, 0);
  assert.equal(f.created.length, 1);
});

test('replaying a generic event create returns the original before conflict or audit work', async () => {
  const original = { id: 'existing-event', version: 2 };
  const f = eventScheduleFixture({ existing: original, tasting: tastingConflict });
  assert.equal(await saveEvent(f.db, eventActor, f.input), original);
  assert.equal(f.lookups.length, 0);
  assert.equal(f.created.length, 0);
  assert.equal(f.audit.length, 0);
});
