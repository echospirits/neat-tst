import assert from 'node:assert/strict';
import test from 'node:test';
import { getSocialBaseUrl } from '../lib/socialPublishing/config';
import { buildOAuthAuthorizationUrl, getMetaLoginConfiguration, getOAuthConfiguration } from '../lib/socialPublishing/providers/oauth';
import { createDispatchMediaUrl, verifyDispatchMediaSignature } from '../lib/socialPublishing/media';

const canonical = 'https://neat-tst.vercel.app';
const legacy = 'https://neat-tst-joe-1533s-projects.vercel.app';
function configure(values: Record<string, string | undefined>) {
  const prior = { ...process.env };
  for (const [key, value] of Object.entries({ SOCIAL_META_CONFIG_ID: undefined, SOCIAL_META_TOKEN_TYPE: undefined, SOCIAL_TOKEN_ENCRYPTION_KEY: undefined, CALENDAR_TOKEN_ENCRYPTION_KEY: 'fixture-encryption-key-at-least-32-characters', ...values })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
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

test('optional verified USER Meta configuration replaces scopes while retaining code, callback and independent OAuth state', () => {
  const restore = configure({ SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', SOCIAL_META_CONFIG_ID: '123456789012345', SOCIAL_META_TOKEN_TYPE: 'USER', SOCIAL_BASE_URL: canonical });
  try {
    assert.deepEqual(getMetaLoginConfiguration(), { id: '123456789012345', tokenType: 'USER' });
    for (const provider of ['FACEBOOK', 'INSTAGRAM'] as const) {
      const settings = getOAuthConfiguration(provider, legacy);
      assert.equal(settings.configured, true);
      const url = new URL(buildOAuthAuthorizationUrl(provider, { state: 'independent-random-csrf-state', redirectUri: settings.callbackUrl }));
      assert.equal(url.searchParams.get('config_id'), '123456789012345');
      assert.equal(url.searchParams.get('scope'), null);
      assert.equal(url.searchParams.get('response_type'), 'code');
      assert.equal(url.searchParams.get('state'), 'independent-random-csrf-state');
      assert.equal(url.searchParams.get('client_id'), 'fixture-app');
      assert.equal(url.searchParams.get('redirect_uri'), `${canonical}/api/social/oauth/meta/callback`);
    }
  } finally { restore(); }
});

test('Meta configuration readiness exposes missing USER attestation and malformed numeric identity without hiding other providers', () => {
  const restore = configure({ SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', SOCIAL_META_CONFIG_ID: '123456789012345', SOCIAL_BASE_URL: canonical, SOCIAL_GOOGLE_CLIENT_ID: 'fixture-google', SOCIAL_GOOGLE_CLIENT_SECRET: 'fixture-google-secret', SOCIAL_LINKEDIN_CLIENT_ID: 'fixture-linkedin', SOCIAL_LINKEDIN_CLIENT_SECRET: 'fixture-linkedin-secret' });
  try {
    for (const tokenType of ['', 'SYSTEM_USER', 'BISU', 'BEARER', 'UNKNOWN']) {
      process.env.SOCIAL_META_TOKEN_TYPE = tokenType;
      for (const provider of ['FACEBOOK', 'INSTAGRAM'] as const) {
        const configuration = getOAuthConfiguration(provider);
        assert.equal(configuration.configured, false);
        assert.ok(configuration.missing.some(key => key.startsWith('SOCIAL_META_TOKEN_TYPE')));
        assert.match(configuration.configurationError!, /Unknown and system-user configurations are unsupported/);
        assert.throws(() => buildOAuthAuthorizationUrl(provider, { state: 'csrf-state', redirectUri: configuration.callbackUrl }), /User access token/);
      }
    }
    process.env.SOCIAL_META_TOKEN_TYPE = 'USER';
    for (const configId of ['not-numeric', '123&scope=extra', '1.2', '1'.repeat(101)]) {
      process.env.SOCIAL_META_CONFIG_ID = configId;
      const configuration = getOAuthConfiguration('FACEBOOK');
      assert.equal(configuration.configured, false);
      assert.ok(configuration.missing.some(key => key.startsWith('SOCIAL_META_CONFIG_ID')));
      assert.match(configuration.configurationError!, /numeric ID/);
    }
    for (const provider of ['GOOGLE_BUSINESS', 'LINKEDIN'] as const) {
      const configuration = getOAuthConfiguration(provider);
      assert.equal(configuration.configured, true);
      const url = new URL(buildOAuthAuthorizationUrl(provider, { state: 'provider-specific-state', redirectUri: configuration.callbackUrl }));
      assert.equal(url.searchParams.get('config_id'), null);
      assert.ok(url.searchParams.get('scope'));
    }
  } finally { restore(); }
});

test('blank Meta configuration preserves legacy scope-based login without requiring a new token-type setting', () => {
  const restore = configure({ SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', SOCIAL_META_CONFIG_ID: '  ', SOCIAL_BASE_URL: canonical });
  try {
    assert.equal(getMetaLoginConfiguration(), null);
    const configuration = getOAuthConfiguration('FACEBOOK');
    assert.equal(configuration.configured, true);
    const url = new URL(buildOAuthAuthorizationUrl('FACEBOOK', { state: 'legacy-state', redirectUri: configuration.callbackUrl }));
    assert.equal(url.searchParams.get('config_id'), null);
    assert.equal(url.searchParams.get('state'), 'legacy-state');
    assert.match(url.searchParams.get('scope')!, /instagram_basic/);
    assert.match(url.searchParams.get('scope')!, /pages_manage_posts/);
  } finally { restore(); }
});

test('OAuth readiness reports only the encryption key name and requires the existing crypto facility’s trimmed minimum', () => {
  const restore = configure({ SOCIAL_BASE_URL: canonical, SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', SOCIAL_GOOGLE_CLIENT_ID: 'fixture-google', SOCIAL_GOOGLE_CLIENT_SECRET: 'fixture-google-secret', SOCIAL_LINKEDIN_CLIENT_ID: 'fixture-linkedin', SOCIAL_LINKEDIN_CLIENT_SECRET: 'fixture-linkedin-secret' });
  try {
    for (const key of [undefined, '', ' '.repeat(40), ' '.repeat(32) + 'short-fixture-key' + ' '.repeat(32)]) {
      if (key === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
      else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = key;
      for (const provider of ['FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS', 'LINKEDIN'] as const) {
        const configuration = getOAuthConfiguration(provider);
        assert.equal(configuration.configured, false);
        assert.deepEqual(configuration.missing, ['CALENDAR_TOKEN_ENCRYPTION_KEY']);
        assert.equal(JSON.stringify(configuration).includes('short-fixture-key'), false);
      }
    }
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = '  ' + 'x'.repeat(32) + '  ';
    assert.equal(getOAuthConfiguration('FACEBOOK').configured, true);
    assert.equal(getOAuthConfiguration('GOOGLE_BUSINESS').missing.includes('CALENDAR_TOKEN_ENCRYPTION_KEY'), false);
  } finally { restore(); }
});

test('OAuth readiness selects the Social key independently and reports only its name when an override is invalid', () => {
  const restore = configure({ SOCIAL_BASE_URL: canonical, SOCIAL_META_APP_ID: 'fixture-app', SOCIAL_META_APP_SECRET: 'fixture-secret', CALENDAR_TOKEN_ENCRYPTION_KEY: 'short-calendar', SOCIAL_TOKEN_ENCRYPTION_KEY: 'fixture-social-key-at-least-32-characters' });
  try {
    assert.equal(getOAuthConfiguration('FACEBOOK').configured, true);
    assert.deepEqual(getOAuthConfiguration('INSTAGRAM').missing, []);
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = 'fixture-calendar-key-at-least-32-characters';
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = '  short-social  ';
    for (const provider of ['FACEBOOK', 'INSTAGRAM'] as const) {
      const configuration = getOAuthConfiguration(provider);
      assert.equal(configuration.configured, false);
      assert.deepEqual(configuration.missing, ['SOCIAL_TOKEN_ENCRYPTION_KEY']);
      assert.equal(JSON.stringify(configuration).includes('short-social'), false);
    }
  } finally { restore(); }
});
