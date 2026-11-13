import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptCalendarToken, encryptCalendarToken } from '../lib/calendar/crypto';
import { decryptSocialToken, encryptSocialToken, getSocialCryptoConfiguration } from '../lib/socialPublishing/crypto';

const dedicated = 'fixture-social-key-at-least-32-characters';
const calendar = 'fixture-calendar-key-at-least-32-characters';
function configure(social: string | undefined, legacy: string | undefined) {
  const prior = { social: process.env.SOCIAL_TOKEN_ENCRYPTION_KEY, legacy: process.env.CALENDAR_TOKEN_ENCRYPTION_KEY };
  const assign = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
  assign('SOCIAL_TOKEN_ENCRYPTION_KEY', social); assign('CALENDAR_TOKEN_ENCRYPTION_KEY', legacy);
  return () => { assign('SOCIAL_TOKEN_ENCRYPTION_KEY', prior.social); assign('CALENDAR_TOKEN_ENCRYPTION_KEY', prior.legacy); };
}

test('dedicated Social encryption works with missing or invalid Calendar configuration and independent random IVs', () => {
  const restore = configure(`  ${dedicated}  `, undefined);
  try {
    for (const legacy of [undefined, 'short-calendar']) {
      if (legacy === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY; else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = legacy;
      assert.deepEqual(getSocialCryptoConfiguration(), { keyName: 'SOCIAL_TOKEN_ENCRYPTION_KEY', configured: true });
      const token = encryptSocialToken('fixture-private-credentials-雪');
      const second = encryptSocialToken('fixture-private-credentials-雪');
      assert.match(token, /^s1\./); assert.notEqual(token, second);
      assert.equal(Buffer.from(token.split('.')[1], 'base64url').length, 12);
      assert.equal(Buffer.from(token.split('.')[2], 'base64url').length, 16);
      assert.equal(decryptSocialToken(token), 'fixture-private-credentials-雪');
      assert.equal(token.includes('fixture-private'), false);
      assert.equal(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY, legacy);
    }
  } finally { restore(); }
});

test('absent or blank Social key preserves v1 writes and legacy ciphertext remains readable with an override', () => {
  const restore = configure(undefined, calendar);
  try {
    for (const social of [undefined, '', '  ']) {
      if (social === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY; else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = social;
      assert.deepEqual(getSocialCryptoConfiguration(), { keyName: 'CALENDAR_TOKEN_ENCRYPTION_KEY', configured: true });
      const token = encryptSocialToken('legacy-fixture');
      assert.match(token, /^v1\./); assert.equal(decryptCalendarToken(token), 'legacy-fixture');
    }
    const legacy = encryptCalendarToken('retained-v1-social-fixture');
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = dedicated;
    assert.equal(decryptSocialToken(legacy), 'retained-v1-social-fixture');
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'invalid';
    assert.equal(decryptSocialToken(legacy), 'retained-v1-social-fixture', 'v1 always uses its original Calendar key');
  } finally { restore(); }
});

test('nonblank invalid Social key fails closed instead of falling back to a valid Calendar key', () => {
  const restore = configure(' '.repeat(32) + 'short' + ' '.repeat(32), calendar);
  try {
    assert.deepEqual(getSocialCryptoConfiguration(), { keyName: 'SOCIAL_TOKEN_ENCRYPTION_KEY', configured: false });
    assert.throws(() => encryptSocialToken('fixture'), /SOCIAL_TOKEN_ENCRYPTION_KEY/);
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = dedicated;
    const token = encryptSocialToken('fixture');
    for (const social of [undefined, '', 'short', 'wrong-social-key-at-least-32-characters']) {
      if (social === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY; else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = social;
      assert.throws(() => decryptSocialToken(token));
    }
  } finally { restore(); }
});

test('s1 authenticates ciphertext/IV/tag and rejects malformed or unknown envelopes', () => {
  const restore = configure(dedicated, calendar);
  try {
    const token = encryptSocialToken('authenticated-fixture');
    for (const part of [1, 2, 3]) {
      const pieces = token.split('.');
      const bytes = Buffer.from(pieces[part], 'base64url'); bytes[0] ^= 1; pieces[part] = bytes.toString('base64url');
      assert.throws(() => decryptSocialToken(pieces.join('.')));
    }
    for (const value of ['', token + '.extra', token.replace(/^s1/, 's2'), 's1.a.b.c', token + '=', token.replace(/^s1/, 'v1')]) assert.throws(() => decryptSocialToken(value));
    const empty = encryptSocialToken(''); assert.equal(decryptSocialToken(empty), '');
  } finally { restore(); }
});
