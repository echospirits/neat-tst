import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRole } from '@prisma/client';
import { updateTastingSpacing } from '../lib/tastings/settings';

function fixture(role: UserRole = UserRole.ADMIN) {
  const writes: unknown[] = [], audits: any[] = [];
  const actor = { organizationId: 'org-a', userId: 'admin-a', role };
  const db = {
    $executeRaw: async (...args: unknown[]) => { writes.push(args); },
    user: { findFirst: async () => ({ id: actor.userId, role }) },
    organizationFeature: { findFirst: async () => ({ id: 'pilot' }) },
    organization: { findFirst: async () => ({ id: actor.organizationId, settings: { unrelated: 'preserve', tastingMinimumDays: 10 } }) },
    organizationAuditEvent: { create: async (input: any) => { audits.push(input.data); } },
  };
  return { actor, db: db as any, writes, audits };
}
test('spacing settings change one tenant JSON key atomically and records previous/new values', async () => {
  const f = fixture();
  await updateTastingSpacing(f.db, f.actor, { previousDays: '10', minimumDays: '14' });
  assert.equal(f.writes.length, 2);
  assert.match(String((f.writes[1] as any[])[0]), /jsonb_set/);
  assert.deepEqual((f.writes[1] as any[]).slice(1), ['14', 'org-a']);
  assert.equal(f.audits[0].organizationId, 'org-a');
  assert.deepEqual(f.audits[0].metadata, { kind: 'TASTING_SPACING_CHANGED', previousDays: 10, minimumDays: 14 });
});
test('spacing settings reject non-admins, stale state and invalid values; no-op creates no audit', async () => {
  const ordinary = fixture(UserRole.USER);
  await assert.rejects(updateTastingSpacing(ordinary.db, ordinary.actor, { previousDays: 10, minimumDays: 14 }), /Administrator/);
  const f = fixture();
  await assert.rejects(updateTastingSpacing(f.db, f.actor, { previousDays: 9, minimumDays: 14 }), /changed/);
  await assert.rejects(updateTastingSpacing(f.db, f.actor, { previousDays: 10, minimumDays: -1 }));
  await updateTastingSpacing(f.db, f.actor, { previousDays: 10, minimumDays: 10 });
  assert.equal(f.audits.length, 0);
});
