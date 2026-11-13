import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import { extendWithAccountStateAccess, withOrganizationStateAccess } from '../lib/accountStateAccess';
import { completeScopedSocialOAuth, startScopedSocialOAuth } from '../lib/socialPublishing/oauthFlow';
import { getSocialProvider } from '../lib/socialPublishing/providers';
import { SocialProviderError } from '../lib/socialPublishing/types';

type Args = Record<string, unknown>;
type QueryOperation = (input: { model: string; operation: string; args: Args; query: (args: Args) => Promise<unknown> }) => Promise<unknown>;
const actor = { organizationId: 'org_echo_spirits', userId: 'fixture-admin', role: 'ADMIN' as const };

/** A held interactive transaction occupies the only connection; base-client reentry fails. */
function singleConnectionFixture() {
  let held = false;
  let state: Args | null = null;
  let operation: QueryOperation | undefined;
  const events: string[] = [];
  const credentials: Args[] = [];
  const destinations: Args[] = [];
  async function baseRead(name: string, result: unknown) {
    events.push(`base:${name}`);
    if (held) throw Object.assign(new Error('Fixture pool has no free connection'), { code: 'P2028' });
    return result;
  }
  const base = {
    organization: { findUnique: async () => baseRead('organization', { active: true, accountStatus: 'ACTIVE', enabledStates: ['OH'] }) },
    agency: { findMany: async () => baseRead('agency', []) },
    wholesaleAccount: { findMany: async () => baseRead('wholesale', []) },
    $queryRawUnsafe: async () => baseRead('references', []),
    $extends: (extension: { query: { $allModels: { $allOperations: QueryOperation } } }) => { operation = extension.query.$allModels.$allOperations; return {}; },
  } as unknown as PrismaClient;
  extendWithAccountStateAccess(base);
  const call = (model: string, name: string, query: (args: Args) => Promise<unknown>) => (args: Args) => {
    assert.ok(held, 'domain reads/writes use the interactive transaction');
    events.push(`tx:${model}.${name}`);
    return operation!({ model, operation: name, args, query });
  };
  const tx = {
    user: { findFirst: call('User', 'findFirst', async () => ({ id: actor.userId, role: actor.role })) },
    organization: { findFirst: call('Organization', 'findFirst', async () => ({ id: actor.organizationId })) },
    organizationFeature: { findFirst: call('OrganizationFeature', 'findFirst', async () => ({ id: 'fixture-feature' })) },
    socialOAuthState: {
      create: call('SocialOAuthState', 'create', async ({ data }) => { state = data as Args; return state; }),
      findFirst: call('SocialOAuthState', 'findFirst', async ({ where }) => state && Object.entries(where as Args).every(([key, value]) => key === 'expiresAt' ? (state![key] as Date) > (value as { gt: Date }).gt : state![key] === value) ? state : null),
      deleteMany: call('SocialOAuthState', 'deleteMany', async ({ where }) => { const count = state && state.id === (where as Args).id && state.sessionHash === (where as Args).sessionHash ? 1 : 0; if (count) state = null; return { count }; }),
    },
    socialDestination: {
      findUnique: call('SocialDestination', 'findUnique', async () => null),
      upsert: call('SocialDestination', 'upsert', async ({ create }) => { destinations.push(create as Args); return { id: 'fixture-destination' }; }),
    },
    socialCredential: { create: call('SocialCredential', 'create', async ({ data }) => { credentials.push(data as Args); return { id: 'fixture-credential' }; }) },
  } as unknown as Prisma.TransactionClient;
  const db = {
    $transaction: async <T>(work: (client: Prisma.TransactionClient) => Promise<T>) => {
      assert.equal(held, false);
      held = true; events.push('transaction:begin');
      try { return await work(tx); } finally { held = false; events.push('transaction:end'); }
    },
  } as unknown as PrismaClient;
  return {
    base, db, events, credentials, destinations,
    held: () => held,
    state: () => state,
    dependencies: { db, withScope: <T>(organizationId: string, work: () => Promise<T>) => withOrganizationStateAccess(base, organizationId, work) },
  };
}

function configure() {
  const prior = { ...process.env };
  Object.assign(process.env, { SOCIAL_PILOT_USER_IDS: actor.userId, SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', SOCIAL_META_CONFIG_ID: '123456789', SOCIAL_META_TOKEN_TYPE: 'USER', SOCIAL_TOKEN_ENCRYPTION_KEY: 'fixture-social-key-at-least-32-characters', CALENDAR_TOKEN_ENCRYPTION_KEY: 'short-calendar', SOCIAL_BASE_URL: 'https://neat.example.test' });
  return () => { for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key]; Object.assign(process.env, prior); mock.restoreAll(); };
}

test('single-slot control rejects loading account-state scope after the transaction has reserved the connection', async () => {
  const fixture = singleConnectionFixture();
  await assert.rejects(fixture.db.$transaction(() => withOrganizationStateAccess(fixture.base, actor.organizationId, async () => undefined)), (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'P2028');
  assert.deepEqual(fixture.events, ['transaction:begin', 'base:organization', 'transaction:end']);
});

test('OAuth callers prime the real state-policy context before start, state consumption and every destination transaction', async () => {
  const restore = configure();
  const fixture = singleConnectionFixture();
  const requests: string[] = [];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.equal(fixture.held(), false, 'provider requests never hold a database connection');
    const url = String(input); requests.push(url);
    const body = url.includes('/oauth/access_token') ? { access_token: 'fixture-user-token', expires_in: 3600 }
      : url.includes('/me/permissions') ? { data: [{ permission: 'pages_show_list', status: 'granted' }] }
      : url.includes('/me/accounts') ? { data: [{ id: 'fixture-page', name: 'Fixture Page', access_token: 'fixture-page-token', tasks: ['CREATE_CONTENT'] }] }
      : { id: 'fixture-authorization-owner' };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
  try {
    const url = new URL(await startScopedSocialOAuth(actor, 'original-session', 'meta', fixture.dependencies));
    const state = url.searchParams.get('state')!;
    assert.equal(fixture.state()?.sessionHash, 'original-session');
    assert.match(String(fixture.state()?.verifierEncrypted), /^s1\./);
    assert.equal(requests.length, 0);
    assert.deepEqual(fixture.events.slice(0, 5), ['base:organization', 'base:agency', 'base:wholesale', 'base:references', 'transaction:begin']);
    const outcome = await completeScopedSocialOAuth(actor, 'original-session', 'meta', { state, code: 'fixture-code', denied: false }, fixture.dependencies);
    assert.deepEqual(outcome, { discovered: 1, discoveryFailures: 0, diagnostics: { grantedScopes: ['pages_show_list'], discovery: [
      { event: 'social_oauth_discovery', provider: 'FACEBOOK', stage: 'DISCOVERY', outcome: 'FOUND', count: 1 },
      { event: 'social_oauth_discovery', provider: 'INSTAGRAM', stage: 'DISCOVERY', outcome: 'EMPTY', count: 0 },
    ] } });
    assert.equal(fixture.state(), null);
    assert.equal(fixture.credentials.length, 1);
    assert.match(String(fixture.credentials[0].credentialsEncrypted), /^s1\./);
    assert.equal(fixture.destinations.length, 1);
    assert.equal(fixture.destinations[0].provider, 'FACEBOOK');
    assert.equal(fixture.credentials[0].authorizationOwnerId, 'fixture-authorization-owner');
    assert.equal(JSON.stringify(fixture.credentials).includes('fixture-page-token'), false, 'persisted credentials are encrypted');
    assert.equal(fixture.events.filter(event => event === 'transaction:begin').length, 3);
    assert.equal(fixture.events.filter(event => event === 'base:organization').length, 2, 'one preload per incoming route, reused through downstream persistence');
    assert.equal(requests.length, 6, 'two token exchanges, identity, permissions and independent Facebook/Instagram discovery');
  } finally { restore(); }
});

test('scoped callback still rejects another session before provider requests and consumes denied state once', async () => {
  const restore = configure();
  const fixture = singleConnectionFixture();
  let requests = 0;
  mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Unexpected provider request'); });
  try {
    const url = new URL(await startScopedSocialOAuth(actor, 'original-session', 'meta', fixture.dependencies));
    const state = url.searchParams.get('state')!;
    await assert.rejects(completeScopedSocialOAuth(actor, 'other-session', 'meta', { state, code: 'fixture-code', denied: false }, fixture.dependencies), /another session/);
    assert.ok(fixture.state());
    await assert.rejects(completeScopedSocialOAuth(actor, 'original-session', 'meta', { state, code: null, denied: true }, fixture.dependencies), /not granted/);
    assert.equal(fixture.state(), null);
    await assert.rejects(completeScopedSocialOAuth(actor, 'original-session', 'meta', { state, code: 'fixture-code', denied: false }, fixture.dependencies), /expired/);
    assert.equal(requests, 0);
    assert.equal(fixture.credentials.length, 0);
  } finally { restore(); }
});

test('discovery diagnostics distinguish empty and failed providers without persisting an unmatched user token', async () => {
  const restore = configure();
  const fixture = singleConnectionFixture();
  const logs: unknown[] = [];
  mock.method(console, 'info', (value: unknown) => { logs.push(value); });
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes('/oauth/access_token') ? { access_token: 'PRIVATE_FIXTURE_USER_TOKEN', expires_in: 3600 }
      : url.includes('/me/permissions') ? { data: [
        { permission: 'pages_show_list', status: 'granted' },
        { permission: 'pages_manage_posts', status: 'declined' },
        { permission: 'PRIVATE_FIXTURE_SCOPE_TOKEN', status: 'granted' },
      ] } : { id: 'PRIVATE_FIXTURE_OWNER_ID' };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
  mock.method(getSocialProvider('FACEBOOK'), 'discover', async () => []);
  mock.method(getSocialProvider('INSTAGRAM'), 'discover', async () => { throw new SocialProviderError('PRIVATE_FIXTURE_BODY_URL_TOKEN', 'AUTHORIZATION', 'http_400_provider_10'); });
  try {
    const url = new URL(await startScopedSocialOAuth(actor, 'original-session', 'meta', fixture.dependencies));
    const result = await completeScopedSocialOAuth(actor, 'original-session', 'meta', { state: url.searchParams.get('state')!, code: 'fixture-code', denied: false }, fixture.dependencies);
    assert.equal(result.discovered, 0); assert.equal(result.discoveryFailures, 1);
    assert.deepEqual(result.diagnostics, { grantedScopes: ['pages_show_list'], discovery: [
      { event: 'social_oauth_discovery', provider: 'FACEBOOK', stage: 'DISCOVERY', outcome: 'EMPTY', count: 0 },
      { event: 'social_oauth_discovery', provider: 'INSTAGRAM', stage: 'DISCOVERY', outcome: 'FAILED', count: 0, code: 'http_400_provider_10' },
    ] });
    assert.deepEqual(logs, [{ event: 'social_oauth_grants', provider: 'FACEBOOK', stage: 'GRANTS', grantedScopes: ['pages_show_list'] }, ...result.diagnostics.discovery]);
    assert.equal(JSON.stringify({ result, logs }).includes('PRIVATE_FIXTURE'), false);
    assert.equal(fixture.credentials.length, 0); assert.equal(fixture.destinations.length, 0);
    assert.equal(fixture.state(), null);
  } finally { restore(); }
});
