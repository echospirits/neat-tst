import assert from 'node:assert/strict';
import test from 'node:test';
import { socialOAuthStartDiagnostic } from '../lib/socialPublishing/oauthDiagnostics';
import { SocialProviderError } from '../lib/socialPublishing/types';

test('OAuth start diagnostics emit only a constant event and exact Prisma or allowlisted setup code', () => {
  for (const code of ['P1001', 'P2028', 'P2025']) {
    assert.deepEqual(socialOAuthStartDiagnostic(Object.assign(new Error('private exception text'), { code })), { event: 'social_oauth_start_failed', code });
  }
  for (const code of ['oauth_not_configured', 'oauth_encryption_key_invalid', 'meta_config_id_invalid', 'meta_config_user_type_required']) {
    assert.deepEqual(socialOAuthStartDiagnostic(new SocialProviderError('private exception text', 'CONFIGURATION', code)), { event: 'social_oauth_start_failed', code });
  }
});

test('arbitrary codes/messages/stacks/URLs/tokens and error serialization hooks cannot enter the diagnostic', () => {
  const privateText = 'PRIVATE_FIXTURE_TOKEN_STATE_USER_URL';
  let hooks = 0;
  const getter = Object.defineProperty({ message: privateText }, 'code', { get() { hooks++; throw new Error(privateText); } });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(privateText); } });
  const values = [
    privateText, null, undefined, new Error(privateText), getter, proxy, Object.create({ code: 'P2028' }),
    ...['P2028\n', 'P2028\0', `P2028_${privateText}`, `oauth_not_configured_${privateText}`, privateText].map(code => ({ code, message: privateText, stack: privateText, url: privateText, toJSON() { hooks++; return privateText; } })),
    { code: { toString() { hooks++; return privateText; } }, message: privateText },
  ];
  for (const value of values) {
    const diagnostic = socialOAuthStartDiagnostic(value);
    assert.deepEqual(diagnostic, { event: 'social_oauth_start_failed', code: 'unexpected' });
    assert.equal(JSON.stringify(diagnostic).includes(privateText), false);
  }
  const known = socialOAuthStartDiagnostic({ code: 'P2028', message: privateText, stack: privateText, token: privateText, toJSON() { hooks++; return privateText; } });
  assert.deepEqual(known, { event: 'social_oauth_start_failed', code: 'P2028' });
  assert.equal(hooks, 0);
});
