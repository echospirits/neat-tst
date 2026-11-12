import assert from 'node:assert/strict';
import test from 'node:test';
import { getSocialBaseUrl } from '../lib/socialPublishing/config';
import { getOAuthConfiguration } from '../lib/socialPublishing/providers/oauth';
import { createDispatchMediaUrl, verifyDispatchMediaSignature } from '../lib/socialPublishing/media';

const canonical = 'https://neat-tst.vercel.app';
const legacy = 'https://neat-tst-joe-1533s-projects.vercel.app';
function configure(values: Record<string, string | undefined>) {
  const prior = { ...process.env };
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  return () => { for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key]; Object.assign(process.env, prior); };
}

test('Social origin override normalizes the canonical origin without changing the legacy application base', () => {
  const restore = configure({ SOCIAL_BASE_URL: ` ${canonical}:443/social?ignored=true#fragment `, APP_BASE_URL: legacy });
  try {
    assert.equal(getSocialBaseUrl(), canonical);
    assert.equal(getSocialBaseUrl('https://explicit-fallback.example.test'), canonical);
    assert.equal(process.env.APP_BASE_URL, legacy);
  } finally { restore(); }
});

test('unset or blank Social origin keeps explicit caller fallback and existing application fallback behavior', () => {
  const restore = configure({ SOCIAL_BASE_URL: undefined, APP_BASE_URL: legacy });
  try {
    assert.equal(getSocialBaseUrl('https://fixture.example.test/path'), 'https://fixture.example.test');
    assert.equal(getSocialBaseUrl(), legacy);
    process.env.SOCIAL_BASE_URL = '  ';
    assert.equal(getSocialBaseUrl(), legacy);
    delete process.env.APP_BASE_URL;
    assert.equal(getSocialBaseUrl('https://fixture.example.test'), 'https://fixture.example.test');
    assert.throws(() => getSocialBaseUrl(), /Configure SOCIAL_BASE_URL or APP_BASE_URL/);
  } finally { restore(); }
});

test('malformed or unsafe nonempty Social override fails closed instead of using a valid fallback', () => {
  const restore = configure({ APP_BASE_URL: legacy, APP_ENV: 'test' });
  try {
    for (const base of ['not-a-url', '//neat-tst.vercel.app', 'https:neat-tst.vercel.app', 'https:///neat-tst.vercel.app', 'javascript:alert(1)', 'file:///private', 'https://user:password@neat-tst.vercel.app', 'https://[invalid', 'https://neat-tst.vercel.app\n.evil.invalid', 'https://neat-tst.vercel.app\\other']) {
      process.env.SOCIAL_BASE_URL = base;
      assert.throws(() => getSocialBaseUrl('https://valid-fallback.example.test'), /valid absolute HTTP\(S\) origin/, base);
    }
    process.env.SOCIAL_BASE_URL = 'http://neat-tst.vercel.app';
    assert.throws(() => getSocialBaseUrl(), /requires an HTTPS base URL/);
  } finally { restore(); }
});

test('HTTP is restricted to explicit development loopback, including IPv6', () => {
  const restore = configure({ APP_ENV: 'development', APP_BASE_URL: legacy });
  try {
    for (const origin of ['http://localhost:3118', 'http://127.0.0.1:3118', 'http://[::1]:3118']) {
      process.env.SOCIAL_BASE_URL = origin;
      assert.equal(getSocialBaseUrl(), origin);
      for (const environment of ['test', 'production']) { process.env.APP_ENV = environment; assert.throws(() => getSocialBaseUrl(), /requires an HTTPS base URL/); }
      process.env.APP_ENV = 'development';
    }
    process.env.SOCIAL_BASE_URL = 'http://localhost.evil.invalid:3118';
    assert.throws(() => getSocialBaseUrl(), /requires an HTTPS base URL/);
  } finally { restore(); }
});

test('all Social OAuth callback families honor the override and preserve their existing lowercase paths', () => {
  const restore = configure({ SOCIAL_BASE_URL: canonical, APP_BASE_URL: legacy });
  try {
    for (const [provider, route] of [['FACEBOOK', 'meta'], ['INSTAGRAM', 'meta'], ['GOOGLE_BUSINESS', 'google'], ['LINKEDIN', 'linkedin']] as const) {
      assert.equal(getOAuthConfiguration(provider, legacy).callbackUrl, `${canonical}/api/social/oauth/${route}/callback`);
    }
    delete process.env.SOCIAL_BASE_URL;
    assert.equal(getOAuthConfiguration('FACEBOOK', 'https://explicit.example.test').callbackUrl, 'https://explicit.example.test/api/social/oauth/meta/callback');
  } finally { restore(); }
});

test('dispatch media URLs use the same Social-only origin and retain their single-version signature', () => {
  const restore = configure({ SOCIAL_BASE_URL: canonical, APP_BASE_URL: legacy, SOCIAL_MEDIA_SIGNING_SECRET: 'test-only-signing-secret-at-least-32-characters', APP_ENV: 'test' });
  try {
    const media = { id: 'fixture-media', organizationId: 'fixture-tenant', storageKey: 'private-fixture', sha256: 'a'.repeat(64) };
    const now = new Date('2026-11-12T20:00:00Z');
    const url = new URL(createDispatchMediaUrl(media, now));
    assert.equal(url.origin, canonical);
    assert.equal(url.pathname, '/api/social/media/fixture-media');
    assert.equal(verifyDispatchMediaSignature(media, url.searchParams.get('expires'), url.searchParams.get('signature'), now), true);
    assert.equal(verifyDispatchMediaSignature({ ...media, organizationId: 'different-tenant' }, url.searchParams.get('expires'), url.searchParams.get('signature'), now), false);
    assert.equal(process.env.APP_BASE_URL, legacy);
  } finally { restore(); }
});
