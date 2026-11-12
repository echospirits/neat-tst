import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  socialLocalTimestamp,
  socialLivePolicy,
  socialDeliveryGuard,
  socialRetryDelay,
  socialDraftInput,
  deriveSocialDeliveryStatus,
} from '../lib/socialPublishing/model';
const valid = {
  approvedAt: new Date('2026-11-12T12:00:00Z'),
  invalidatedAt: null,
  postStatus: 'APPROVED',
  currentRevision: 2,
  revisionNumber: 2,
  destinationEnabled: true,
  connectionHealth: 'CONNECTED_UNVERIFIED',
  expiresAt: null,
  scheduledAt: new Date('2026-11-12T13:00:00Z'),
  started: false,
};
test('social schedule preserves Eastern wall time and rejects both DST hazards', () => {
  assert.equal(
    socialLocalTimestamp('2026-11-12', '09:00').toISOString(),
    '2026-11-12T14:00:00.000Z',
  );
  assert.equal(
    socialLocalTimestamp('2026-07-12', '09:00').toISOString(),
    '2026-07-12T13:00:00.000Z',
  );
  assert.throws(
    () => socialLocalTimestamp('2026-03-08', '02:30'),
    /daylight saving/,
  );
  assert.throws(
    () => socialLocalTimestamp('2026-11-01', '01:30'),
    /daylight saving/,
  );
});
test('delivery approval, revision, revocation, cancellation and bounded lateness fail closed', () => {
  const now = new Date('2026-11-12T13:00:00Z');
  assert.equal(socialDeliveryGuard(valid, now), null);
  for (const change of [
    { approvedAt: null },
    { invalidatedAt: now },
    { postStatus: 'DRAFT' },
    { postStatus: 'CANCELED' },
    { revisionNumber: 1 },
    { destinationEnabled: false },
    { connectionHealth: 'RECONNECT_REQUIRED' },
    { expiresAt: now },
  ])
    assert.ok(socialDeliveryGuard({ ...valid, ...change }, now));
  assert.ok(
    socialDeliveryGuard(valid, new Date(now.getTime() + 15 * 60_000 + 1)),
  );
  assert.equal(
    socialDeliveryGuard(
      { ...valid, started: true },
      new Date(now.getTime() + 16 * 60_000),
    ),
    null,
  );
});
test('live controls require every environment, tenant, destination and fresh-approval gate', () => {
  const approvedAt = new Date('2026-11-12T12:00:00Z');
  const env = {
    APP_ENV: 'test',
    SOCIAL_LIVE_PUBLISHING_ENABLED: 'true',
    SOCIAL_LIVE_ENVIRONMENT: 'test',
    SOCIAL_LIVE_ORGANIZATION_ID: 'org_echo_spirits',
    SOCIAL_LIVE_DESTINATION_IDS: 'dest-a,dest-b',
    SOCIAL_LIVE_NOT_BEFORE: '2026-11-12T11:00:00Z',
  };
  assert.equal(
    socialLivePolicy('org_echo_spirits', 'dest-a', approvedAt, env).enabled,
    true,
  );
  for (const key of Object.keys(env))
    assert.equal(
      socialLivePolicy('org_echo_spirits', 'dest-a', approvedAt, {
        ...env,
        [key]: '',
      }).enabled,
      false,
      key,
    );
  assert.equal(
    socialLivePolicy('org_other', 'dest-a', approvedAt, env).enabled,
    false,
  );
  assert.equal(
    socialLivePolicy('org_echo_spirits', 'dest-other', approvedAt, env).enabled,
    false,
  );
  assert.equal(
    socialLivePolicy(
      'org_echo_spirits',
      'dest-a',
      new Date('2026-11-12T10:59:59Z'),
      env,
    ).enabled,
    false,
  );
  assert.equal(
    socialLivePolicy('org_echo_spirits', 'dest-a', approvedAt, {
      ...env,
      APP_ENV: 'production',
    }).enabled,
    false,
  );
});
test('draft validation rejects duplicate destinations, unsafe links and unknown native options', () => {
  const input = {
    groupId: 'g',
    title: 'Venue event',
    destinations: [
      {
        destinationId: 'd',
        caption: 'Venue update',
        format: 'IMAGE',
        mediaIds: ['m'],
      },
    ],
  };
  assert.equal(socialDraftInput.safeParse(input).success, true);
  assert.equal(
    socialDraftInput.safeParse({
      ...input,
      destinations: [...input.destinations, ...input.destinations],
    }).success,
    false,
  );
  assert.equal(
    socialDraftInput.safeParse({
      ...input,
      destinations: [{ ...input.destinations[0], link: 'javascript:alert(1)' }],
    }).success,
    false,
  );
  assert.equal(
    socialDraftInput.safeParse({
      ...input,
      destinations: [
        { ...input.destinations[0], options: { musicId: 'unverified' } },
      ],
    }).success,
    false,
  );
});
test('rate-limit backoff is bounded and partial success remains visible', () => {
  assert.equal(socialRetryDelay(1), 60_000);
  assert.equal(socialRetryDelay(2), 120_000);
  assert.equal(socialRetryDelay(3, 500), 500_000);
  assert.equal(socialRetryDelay(20, 100000), 3600_000);
  assert.equal(
    deriveSocialDeliveryStatus([{ status: 'PUBLISHED' }, { status: 'FAILED' }]),
    'PARTIAL',
  );
  assert.equal(
    deriveSocialDeliveryStatus([
      { status: 'QUEUED' },
      { status: 'NEEDS_ATTENTION' },
    ]),
    'NEEDS_ATTENTION',
  );
  assert.equal(
    deriveSocialDeliveryStatus([{ status: 'SIMULATED', mode: 'SIMULATED' }]),
    'SIMULATED',
  );
});

// Tenant pause is durable across old deployment/workflow environment snapshots.
import { socialTenantLivePolicy } from '../lib/socialPublishing/model';
test('current tenant pause and reactivation invalidate older live approvals', () => {
  const approved = new Date('2026-11-12T12:00:00Z');
  assert.equal(socialTenantLivePolicy({}, approved).enabled, false);
  assert.equal(
    socialTenantLivePolicy(
      {
        socialPublishing: {
          liveEnabled: false,
          liveNotBefore: '2026-11-12T11:00:00Z',
        },
      },
      approved,
    ).enabled,
    false,
  );
  assert.equal(
    socialTenantLivePolicy(
      {
        socialPublishing: {
          liveEnabled: true,
          liveNotBefore: '2026-11-12T11:00:00Z',
        },
      },
      approved,
    ).enabled,
    true,
  );
  assert.equal(
    socialTenantLivePolicy(
      {
        socialPublishing: {
          liveEnabled: true,
          liveNotBefore: '2026-11-12T12:01:00Z',
        },
      },
      approved,
    ).enabled,
    false,
  );
});

import { socialHash } from '../lib/socialPublishing/model';
test('approval integrity survives JSONB object-key reordering and preserves media order', () => {
  const original = {
    caption: 'reviewed',
    destinations: [
      {
        id: 'd',
        media: ['first', 'second'],
        options: { shareToFeed: true, altText: 'view' },
      },
    ],
  };
  const reordered = {
    destinations: [
      {
        options: { altText: 'view', shareToFeed: true },
        media: ['first', 'second'],
        id: 'd',
      },
    ],
    caption: 'reviewed',
  };
  assert.equal(socialHash(original), socialHash(reordered));
  assert.notEqual(
    socialHash(original),
    socialHash({
      ...original,
      destinations: [
        { ...original.destinations[0], media: ['second', 'first'] },
      ],
    }),
  );
});
