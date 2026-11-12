import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Prisma } from '@prisma/client';
import {
  startSocialOAuth,
  consumeSocialOAuthState,
  socialOAuthFamily,
} from '../lib/socialPublishing/oauth';

test('OAuth state is one-use and bound to tenant, admin, provider and exact login session', async () => {
  const prior = { ...process.env };
  Object.assign(process.env, {
    SOCIAL_PILOT_USER_IDS: 'admin',
    SOCIAL_META_APP_ID: 'fixture-app-never-contacted',
    SOCIAL_META_APP_SECRET: 'fixture-secret-never-contacted',
    CALENDAR_TOKEN_ENCRYPTION_KEY: 'fixture-key-32-characters-not-a-secret',
    APP_BASE_URL: 'https://fixture.example.invalid',
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
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'https://fixture.example.invalid/api/social/oauth/meta/callback',
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
    await assert.rejects(
      () => consumeSocialOAuthState(db, actor, 'session-a', 'meta', state),
      /another session/,
    );
    assert.throws(() => socialOAuthFamily('__proto__'), /Unknown/);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
});
