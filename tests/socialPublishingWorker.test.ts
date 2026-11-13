import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { encryptCalendarToken } from '../lib/calendar/crypto';
import { encryptSocialToken, decryptSocialToken } from '../lib/socialPublishing/crypto';
import { getSocialProvider } from '../lib/socialPublishing/providers';
import { publishOperation } from '../lib/socialPublishing/providers/http';
import { processSocialDelivery } from '../lib/socialPublishing/worker';
import { socialHash } from '../lib/socialPublishing/model';
import { SocialProviderError, type ExternalIds, type ProviderContext } from '../lib/socialPublishing/types';

type Row = Record<string, unknown>;
/** An atomic in-memory persistence fixture, not database or live-provider evidence. */
function fixture(mode: 'LIVE' | 'SIMULATED' = 'LIVE') {
  const now = new Date();
  const payload = { title: 'Fixture', caption: 'Reviewed fixture', note: '', proposedAt: now.toISOString(), destinations: [{ destinationId: 'destination', externalId: 'page-fixture', provider: 'FACEBOOK', displayName: 'Fixture Page', caption: 'Reviewed fixture', format: 'TEXT', mediaIds: [], media: [], options: {} }] };
  const credential = { id: 'credential', health: 'CONNECTED', credentialsEncrypted: encryptCalendarToken(JSON.stringify({ accessToken: 'fixture-never-live', scopes: ['pages_manage_posts'] })), expiresAt: null as Date | null, scopes: ['pages_manage_posts'] };
  const row = {
    id: 'delivery', organizationId: 'org_echo_spirits', postId: 'post', revisionId: 'revision', destinationId: 'destination', provider: 'FACEBOOK', externalId: 'page-fixture', mode, status: 'QUEUED',
    nextAttemptAt: new Date(now.getTime() - 1000), scheduledAt: new Date(now.getTime() - 1000), createdAt: now, leaseToken: null as string | null, leaseUntil: null as Date | null, attempts: 0, startedAt: null as Date | null, externalIds: {} as ExternalIds,
    post: { id: 'post', organizationId: 'org_echo_spirits', groupId: 'group', status: 'APPROVED', currentRevision: 1 },
    revision: { id: 'revision', number: 1, approvedByUserId: 'admin', approvedAt: new Date(now.getTime() - 1000), invalidatedAt: null as Date | null, payload, contentHash: socialHash(payload) },
    destination: { id: 'destination', organizationId: 'org_echo_spirits', groupId: 'group', credentialId: 'credential', provider: 'FACEBOOK', externalId: 'page-fixture', displayName: 'Fixture Page', handle: null, profileImageUrl: null, metadata: {}, enabled: true, credential },
  };
  const logs: Row[] = []; const audits: Row[] = [];
  const tenantLiveControl = { liveEnabled: true, liveNotBefore: '2026-11-01T00:00:00Z' };
  const matches = (where: Row) => {
    if (where.id && where.id !== row.id) return false;
    if (where.leaseToken && where.leaseToken !== row.leaseToken) return false;
    const status = where.status as { in?: string[] } | undefined;
    if (status?.in && !status.in.includes(row.status)) return false;
    const next = where.nextAttemptAt as { lte?: Date } | undefined;
    if (next?.lte && row.nextAttemptAt > next.lte) return false;
    if (where.OR && row.leaseUntil && row.leaseUntil >= now) return false;
    return true;
  };
  const update = (data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'attempts') row.attempts += (value as { increment: number }).increment;
      else (row as unknown as Row)[key] = value;
    }
  };
  const db = {
    $executeRaw: async () => 1,
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
    socialDelivery: {
      findUniqueOrThrow: async () => structuredClone(row),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { if (!matches(where)) return { count: 0 }; update(data); return { count: 1 }; },
      update: async ({ data }: { data: Row }) => { update(data); return structuredClone(row); },
    },
    user: { findFirst: async () => ({ id: 'admin', organizationId: 'org_echo_spirits', isActive: true, role: 'ADMIN' }) },
    organization: { findFirst: async () => ({ id: 'org_echo_spirits', active: true, accountStatus: 'ACTIVE', crmPreferences: { socialPublishing: tenantLiveControl } }) },
    organizationFeature: { findFirst: async () => ({ featureKey: 'SOCIAL_PUBLISHING', enabled: true }) },
    socialMedia: { findMany: async () => [] },
    socialDestination: { update: async ({ data }: { data: Row }) => Object.assign(row.destination, data), updateMany: async ({ data }: { data: Row }) => { Object.assign(row.destination, data); return { count: 1 }; } },
    socialCredential: { update: async ({ data }: { data: Row }) => Object.assign(credential, data) },
    socialAttempt: { create: async ({ data }: { data: Row }) => { logs.push(data); return data; }, count: async ({ where }: { where: Row }) => logs.filter(log => log.outcome === where.outcome).length },
    socialAudit: { create: async ({ data }: { data: Row }) => { audits.push(data); return data; } },
  };
  return { db: db as unknown as PrismaClient, row, now, logs, audits, tenantLiveControl };
}

describe('Social durable worker boundaries — simulated persistence/provider fixtures', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = 'fixture-social-token-encryption-key-never-live';
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    process.env.SOCIAL_PILOT_USER_IDS = 'admin';
    process.env.SOCIAL_LIVE_PUBLISHING_ENABLED = 'true'; process.env.SOCIAL_LIVE_ENVIRONMENT = 'test'; process.env.APP_ENV = 'test';
    process.env.SOCIAL_LIVE_ORGANIZATION_ID = 'org_echo_spirits'; process.env.SOCIAL_LIVE_DESTINATION_IDS = 'destination'; process.env.SOCIAL_LIVE_NOT_BEFORE = new Date(Date.now() - 3600_000).toISOString();
    mock.method(globalThis, 'fetch', async () => { throw new Error('Live network is forbidden in worker fixtures.'); });
  });
  afterEach(() => { mock.restoreAll(); for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); });

  it('executes a durable simulated approval without provider traffic and records the simulation separately', async () => {
    const f = fixture('SIMULATED'); delete process.env.SOCIAL_LIVE_PUBLISHING_ENABLED;
    const result = await processSocialDelivery(f.db, f.row.id, f.now);
    assert.equal(result.status, 'SIMULATED'); assert.equal(f.logs[0].mode, 'SIMULATED'); assert.match(String(f.logs[0].detail), /no provider request/);
  });

  it('blocks unapproved, invalidated, superseded, excessively late and disabled-destination work before prepare', async () => {
    const adapter = getSocialProvider('FACEBOOK'); const prep = mock.method(adapter, 'prepare', async () => { throw new Error('Must not prepare'); });
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.row.revision.approvedByUserId = ''; },
      (f: ReturnType<typeof fixture>) => { f.row.revision.invalidatedAt = new Date(); },
      (f: ReturnType<typeof fixture>) => { f.row.post.currentRevision = 2; },
      (f: ReturnType<typeof fixture>) => { f.row.scheduledAt = new Date(Date.now() - 16 * 60_000); },
      (f: ReturnType<typeof fixture>) => { f.row.destination.enabled = false; },
    ]) {
      const f = fixture(); change(f); const result = await processSocialDelivery(f.db, f.row.id, f.now); assert.equal(result.status, 'NEEDS_ATTENTION');
    }
    assert.equal(prep.mock.callCount(), 0);
  });

  it('only allows one concurrent worker to claim and publish a destination', async () => {
    const f = fixture(); const adapter = getSocialProvider('FACEBOOK');
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => ({ ids: ctx.ids, ready: true }));
    const publish = mock.method(adapter, 'publish', async (ctx: ProviderContext) => { await ctx.checkpoint({ publicationStarted: true }); await ctx.assertCanPublish(); return { status: 'PUBLISHED' as const, ids: { publicationStarted: true, postId: 'fixture-post' }, confirmed: true }; });
    const results = await Promise.all([processSocialDelivery(f.db, f.row.id, f.now), processSocialDelivery(f.db, f.row.id, f.now)]);
    assert.equal(results.filter(result => result.claimed).length, 1); assert.equal(publish.mock.callCount(), 1); assert.equal(f.row.status, 'PUBLISHED');
    assert.equal((await processSocialDelivery(f.db, f.row.id, new Date())).claimed, false);
  });

  it('reads dedicated Social credentials when Calendar configuration is invalid', async () => {
    const f = fixture();
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'fixture-dedicated-social-key-at-least-32-characters';
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = 'short-calendar';
    f.row.destination.credential.credentialsEncrypted = encryptSocialToken(JSON.stringify({ accessToken: 'dedicated-fixture-token', scopes: ['pages_manage_posts'] }));
    assert.match(f.row.destination.credential.credentialsEncrypted, /^s1\./);
    const adapter = getSocialProvider('FACEBOOK');
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => { assert.equal(ctx.credentials.accessToken, 'dedicated-fixture-token'); return { ids: ctx.ids, ready: true }; });
    const publish = mock.method(adapter, 'publish', async (ctx: ProviderContext) => { await ctx.checkpoint({ publicationStarted: true }); await ctx.assertCanPublish(); return { status: 'PUBLISHED' as const, ids: { postId: 'fixture-post' }, confirmed: true }; });
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'PUBLISHED');
    assert.equal(publish.mock.callCount(), 1);
    assert.equal(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY, 'short-calendar');
  });

  it('refreshes retained v1 credentials and persists the new token with dedicated s1 encryption', async () => {
    const f = fixture();
    const externalId = 'urn:li:organization:123';
    f.row.provider = f.row.destination.provider = f.row.revision.payload.destinations[0].provider = 'LINKEDIN';
    f.row.externalId = f.row.destination.externalId = f.row.revision.payload.destinations[0].externalId = externalId;
    f.row.revision.contentHash = socialHash(f.row.revision.payload);
    f.row.destination.credential.expiresAt = new Date(Date.now() - 1000);
    f.row.destination.credential.credentialsEncrypted = encryptCalendarToken(JSON.stringify({ accessToken: 'expired-fixture-token', refreshToken: 'fixture-refresh-token', scopes: ['w_organization_social'], expiresAt: new Date(Date.now() - 1000).toISOString() }));
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'fixture-dedicated-social-key-at-least-32-characters';
    process.env.SOCIAL_LINKEDIN_CLIENT_ID = 'fixture-client'; process.env.SOCIAL_LINKEDIN_CLIENT_SECRET = 'fixture-client-secret';
    let refreshes = 0;
    mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), 'https://www.linkedin.com/oauth/v2/accessToken');
      assert.equal(new URLSearchParams(String(init?.body)).get('refresh_token'), 'fixture-refresh-token');
      refreshes++;
      return new Response(JSON.stringify({ access_token: 'refreshed-fixture-token', expires_in: 3600 }), { headers: { 'content-type': 'application/json' } });
    });
    const adapter = getSocialProvider('LINKEDIN');
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => { assert.equal(ctx.credentials.accessToken, 'refreshed-fixture-token'); return { ids: ctx.ids, ready: true }; });
    mock.method(adapter, 'publish', async (ctx: ProviderContext) => { await ctx.assertCanPublish(); return { status: 'PUBLISHED' as const, ids: { postId: 'fixture-post' }, confirmed: true }; });
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'PUBLISHED');
    assert.equal(refreshes, 1);
    assert.match(f.row.destination.credential.credentialsEncrypted, /^s1\./);
    assert.equal(JSON.parse(decryptSocialToken(f.row.destination.credential.credentialsEncrypted)).accessToken, 'refreshed-fixture-token');
  });

  it('rechecks current approval after preparation before the irreversible request', async () => {
    const f = fixture(); const adapter = getSocialProvider('FACEBOOK'); let sends = 0;
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => { f.row.revision.invalidatedAt = new Date(); return { ids: ctx.ids, ready: true }; });
    mock.method(adapter, 'publish', async (ctx: ProviderContext) => publishOperation(ctx, async () => { sends++; return { status: 'PUBLISHED' as const, ids: ctx.ids }; }));
    const result = await processSocialDelivery(f.db, f.row.id, f.now);
    assert.equal(sends, 0); assert.equal(result.status, 'NEEDS_ATTENTION');
  });

  it('requires a live environment/tenant/destination gate even for a directly invoked worker', async () => {
    const f = fixture(); process.env.SOCIAL_LIVE_DESTINATION_IDS = 'another-destination';
    const adapter = getSocialProvider('FACEBOOK'); const prep = mock.method(adapter, 'prepare', async () => { throw new Error('Must not prepare'); });
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'NEEDS_ATTENTION'); assert.equal(prep.mock.callCount(), 0);
  });

  it('rechecks the current tenant pause after media preparation even while pinned environment values still allow live', async () => {
    const f = fixture(); const adapter = getSocialProvider('FACEBOOK'); let sends = 0;
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => { f.tenantLiveControl.liveEnabled = false; return { ids: ctx.ids, ready: true }; });
    mock.method(adapter, 'publish', async (ctx: ProviderContext) => publishOperation(ctx, async () => { sends++; return { status: 'PUBLISHED' as const, ids: ctx.ids }; }));
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'NEEDS_ATTENTION');
    assert.equal(process.env.SOCIAL_LIVE_PUBLISHING_ENABLED, 'true'); assert.equal(sends, 0);
  });

  it('records an ambiguous outcome, then reconciles read-only without recreating after cancellation', async () => {
    const f = fixture(); const adapter = getSocialProvider('FACEBOOK');
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => ({ ids: ctx.ids, ready: true }));
    const publish = mock.method(adapter, 'publish', async (ctx: ProviderContext) => { await ctx.checkpoint({ publicationStarted: true, postId: 'accepted-fixture-post' }); await ctx.assertCanPublish(); throw new SocialProviderError('Uncertain response', 'AMBIGUOUS', 'fixture_timeout'); });
    const check = mock.method(adapter, 'check', async (_ctx: ProviderContext, ids: ExternalIds) => ({ status: 'PUBLISHED' as const, ids, confirmed: true }));
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'NEEDS_ATTENTION');
    f.row.status = 'PROCESSING'; f.row.nextAttemptAt = new Date(0); f.row.post.status = 'CANCELED'; f.row.revision.invalidatedAt = new Date();
    assert.equal((await processSocialDelivery(f.db, f.row.id, new Date())).status, 'PUBLISHED');
    assert.equal(check.mock.callCount(), 1); assert.equal(publish.mock.callCount(), 1);
  });

  it('clears a definitive rejected send marker and refuses to publish its retry after the late bound', async () => {
    const f = fixture(); const adapter = getSocialProvider('FACEBOOK');
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => ({ ids: ctx.ids, ready: true }));
    const publish = mock.method(adapter, 'publish', async (ctx: ProviderContext) => publishOperation(ctx, async () => { throw new SocialProviderError('Rate limit', 'TRANSIENT', 'http_429', 10); }));
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'RETRY'); assert.equal(f.row.startedAt, null); assert.equal(f.row.externalIds.publicationStarted, false);
    f.row.scheduledAt = new Date(Date.now() - 16 * 60_000); f.row.nextAttemptAt = new Date(0);
    assert.equal((await processSocialDelivery(f.db, f.row.id, new Date())).status, 'NEEDS_ATTENTION'); assert.equal(publish.mock.callCount(), 1);
  });

  it('keeps processing distinct from publication, and invalid credentials require reconnect instead of endless retry', async () => {
    const f = fixture(); const adapter = getSocialProvider('FACEBOOK');
    mock.method(adapter, 'prepare', async (ctx: ProviderContext) => ({ ids: ctx.ids, ready: true }));
    mock.method(adapter, 'publish', async (ctx: ProviderContext) => { await ctx.checkpoint({ publicationStarted: true, postId: 'processing-fixture' }); return { status: 'PROCESSING' as const, ids: ctx.ids }; });
    assert.equal((await processSocialDelivery(f.db, f.row.id, f.now)).status, 'PROCESSING');
    f.row.nextAttemptAt = new Date(0);
    mock.method(adapter, 'check', async () => { throw new SocialProviderError('Revoked', 'AUTHORIZATION', 'http_401'); });
    assert.equal((await processSocialDelivery(f.db, f.row.id, new Date())).status, 'NEEDS_ATTENTION'); assert.equal(f.row.destination.credential.health, 'RECONNECT_REQUIRED');
  });
});
