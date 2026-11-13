import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  startSocialOAuth,
  consumeSocialOAuthState,
  socialOAuthFamily,
  completeSocialOAuth,
} from '../lib/socialPublishing/oauth';
import { exchangeOAuthCode } from '../lib/socialPublishing/providers/oauth';
import { SocialProviderError } from '../lib/socialPublishing/types';

for (const configuredMeta of [false, true]) {
test(`${configuredMeta ? 'USER-configured' : 'Legacy'} Meta code flow preserves original-session one-use OAuth state and the Social callback`, async () => {
  const prior = { ...process.env };
  Object.assign(process.env, {
    SOCIAL_PILOT_USER_IDS: 'admin',
    SOCIAL_META_APP_ID: 'fixture-app-never-contacted',
    SOCIAL_META_APP_SECRET: 'fixture-secret-never-contacted',
    SOCIAL_TOKEN_ENCRYPTION_KEY: '',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'fixture-key-32-characters-not-a-secret',
    APP_BASE_URL: 'https://fixture.example.invalid',
    SOCIAL_BASE_URL: 'https://neat-tst.vercel.app',
    SOCIAL_META_CONFIG_ID: configuredMeta ? '123456789012345' : '',
    SOCIAL_META_TOKEN_TYPE: configuredMeta ? 'USER' : '',
  });
  let row: Record<string, unknown> | null = null;
  const db = {
    user: { findFirst: async () => ({ id: 'admin', role: 'ADMIN' }) },
    organization: {
      findFirst: async () => ({ id: 'org_echo_spirits', crmPreferences: {} }),
    },
    organizationFeature: { findFirst: async () => ({ id: 'f' }) },
    socialOAuthState: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        row = data;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        row &&
        Object.entries(where).every(([key, value]) =>
          key === 'expiresAt'
            ? (row![key] as Date) > (value as { gt: Date }).gt
            : row![key] === value,
        )
          ? row
          : null,
      deleteMany: async () => {
        const count = row ? 1 : 0;
        row = null;
        return { count };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const actor = {
    organizationId: 'org_echo_spirits',
    userId: 'admin',
    role: 'ADMIN' as const,
  };
  try {
    const url = new URL(await startSocialOAuth(db, actor, 'session-a', 'meta'));
    const state = url.searchParams.get('state')!;
    assert.equal(url.hostname, 'www.facebook.com');
    assert.equal(url.searchParams.get('response_type'), 'code');
    if (configuredMeta) {
      assert.equal(url.searchParams.get('config_id'), '123456789012345');
      assert.equal(url.searchParams.get('scope'), null);
      assert.notEqual(state, '123456789012345');
    } else {
      assert.equal(url.searchParams.get('config_id'), null);
      assert.match(url.searchParams.get('scope')!, /instagram_basic/);
    }
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://neat-tst.vercel.app/api/social/oauth/meta/callback',
    );
    await assert.rejects(
      () => consumeSocialOAuthState(db, actor, 'session-b', 'meta', state),
      /another session/,
    );
    await assert.rejects(
      () => consumeSocialOAuthState(db, actor, 'session-a', 'google', state),
      /another session/,
    );
    await assert.rejects(
      () =>
        consumeSocialOAuthState(
          db,
          { ...actor, organizationId: 'other' },
          'session-a',
          'meta',
          state,
        ),
      /unavailable/,
    );
    await assert.rejects(
      () =>
        consumeSocialOAuthState(
          db,
          { ...actor, role: 'USER' },
          'session-a',
          'meta',
          state,
        ),
      /unavailable/,
    );
    const stored = await consumeSocialOAuthState(
      db,
      actor,
      'session-a',
      'meta',
      state,
    );
    assert.equal(stored.userId, 'admin');
    assert.equal(stored.sessionHash, 'session-a');
    await assert.rejects(
      () => consumeSocialOAuthState(db, actor, 'session-a', 'meta', state),
      /another session/,
    );
    assert.throws(() => socialOAuthFamily('__proto__'), /Unknown/);
    const exchangeRedirects: string[] = [];
    mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input);
      let body: unknown;
      if (target.endsWith('/oauth/access_token')) {
        const parameters = new URLSearchParams(String(init?.body));
        if (parameters.has('code')) exchangeRedirects.push(parameters.get('redirect_uri')!);
        body = { access_token: 'fixture-token-not-live', expires_in: 3600 };
      } else if (target.includes('/me?fields=id')) body = { id: 'fixture-authorization-owner' };
      else if (target.includes('/me/permissions') || target.includes('/me/accounts?')) body = { data: [] };
      else throw new Error('Unexpected provider fixture request; live networking is blocked.');
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    });
    assert.deepEqual(await completeSocialOAuth(actor, 'meta', 'fixture-code', stored, db as unknown as PrismaClient), { discovered: 0, discoveryFailures: 0, diagnostics: { grantedScopes: [], discovery: [
      { event: 'social_oauth_discovery', provider: 'FACEBOOK', stage: 'DISCOVERY', outcome: 'EMPTY', count: 0 },
      { event: 'social_oauth_discovery', provider: 'INSTAGRAM', stage: 'DISCOVERY', outcome: 'EMPTY', count: 0 },
    ] } });
    assert.deepEqual(exchangeRedirects, ['https://neat-tst.vercel.app/api/social/oauth/meta/callback']);
    assert.equal(process.env.APP_BASE_URL, 'https://fixture.example.invalid');
  } finally {
    mock.restoreAll();
    for (const key of Object.keys(process.env))
      if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
});
}

test('unknown/system-user Meta configuration fails before state creation, state consumption or provider requests', async () => {
  const prior = { ...process.env };
  Object.assign(process.env, {
    SOCIAL_PILOT_USER_IDS: 'admin', SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'fixture-key-32-characters-not-a-secret', SOCIAL_BASE_URL: 'https://neat-tst.vercel.app',
  });
  let created = 0, queried = 0, consumed = 0, requests = 0;
  const db = {
    user: { findFirst: async () => ({ id: 'admin', role: 'ADMIN' }) },
    organization: { findFirst: async () => ({ id: 'org_echo_spirits', crmPreferences: {} }) },
    organizationFeature: { findFirst: async () => ({ id: 'f' }) },
    socialOAuthState: {
      create: async () => { created++; }, findFirst: async () => { queried++; return null; },
      deleteMany: async () => { consumed++; return { count: 0 }; },
    },
  } as unknown as Prisma.TransactionClient;
  const actor = { organizationId: 'org_echo_spirits', userId: 'admin', role: 'ADMIN' as const };
  mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Unexpected provider request.'); });
  try {
    const cases = [
      { id: '123456789012345', type: '', error: /User access token/ },
      { id: '123456789012345', type: 'SYSTEM_USER', error: /User access token/ },
      { id: '123456789012345', type: 'BEARER', error: /User access token/ },
      { id: 'not-numeric', type: 'USER', error: /numeric ID/ },
    ];
    for (const item of cases) {
      process.env.SOCIAL_META_CONFIG_ID = item.id; process.env.SOCIAL_META_TOKEN_TYPE = item.type;
      await assert.rejects(() => startSocialOAuth(db, actor, 'original-session', 'meta'), item.error);
      await assert.rejects(() => consumeSocialOAuthState(db, actor, 'original-session', 'meta', 'a'.repeat(43)), item.error);
      await assert.rejects(() => exchangeOAuthCode('FACEBOOK', { code: 'fixture-code', redirectUri: 'https://neat-tst.vercel.app/api/social/oauth/meta/callback' }), item.error);
    }
    assert.deepEqual({ created, queried, consumed, requests }, { created: 0, queried: 0, consumed: 0, requests: 0 });
  } finally {
    mock.restoreAll();
    for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
});

test('missing or whitespace-padded short encryption key fails before state writes with a typed setup code', async () => {
  const prior = { ...process.env };
  Object.assign(process.env, { SOCIAL_PILOT_USER_IDS: 'admin', SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', SOCIAL_META_CONFIG_ID: '', SOCIAL_META_TOKEN_TYPE: '', SOCIAL_BASE_URL: 'https://neat-tst.vercel.app', SOCIAL_TOKEN_ENCRYPTION_KEY: '' });
  let writes = 0, requests = 0;
  const db = {
    user: { findFirst: async () => ({ id: 'admin', role: 'ADMIN' }) },
    organization: { findFirst: async () => ({ id: 'org_echo_spirits', crmPreferences: {} }) },
    organizationFeature: { findFirst: async () => ({ id: 'f' }) },
    socialOAuthState: { create: async () => { writes++; } },
  } as unknown as Prisma.TransactionClient;
  const actor = { organizationId: 'org_echo_spirits', userId: 'admin', role: 'ADMIN' as const };
  mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Unexpected provider request.'); });
  try {
    for (const key of [undefined, '', ' '.repeat(40), ' '.repeat(32) + 'short' + ' '.repeat(32)]) {
      if (key === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
      else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = key;
      await assert.rejects(() => startSocialOAuth(db, actor, 'original-session', 'meta'), error => error instanceof SocialProviderError && error.kind === 'CONFIGURATION' && error.code === 'oauth_encryption_key_invalid');
    }
    assert.deepEqual({ writes, requests }, { writes: 0, requests: 0 });
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = 'valid-fixture-calendar-key-at-least-32-characters';
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'short-social';
    await assert.rejects(() => startSocialOAuth(db, actor, 'original-session', 'meta'), error => error instanceof SocialProviderError && error.code === 'oauth_encryption_key_invalid' && error.message.includes('SOCIAL_TOKEN_ENCRYPTION_KEY'));
    assert.equal(writes, 0);
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = '  ' + 'x'.repeat(32) + '  ';
    const target = new URL(await startSocialOAuth(db, actor, 'original-session', 'meta'));
    assert.equal(target.hostname, 'www.facebook.com');
    assert.equal(writes, 1);
    assert.equal(requests, 0);
  } finally {
    mock.restoreAll();
    for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
});
