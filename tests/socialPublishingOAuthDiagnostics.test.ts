import assert from 'node:assert/strict';
import test from 'node:test';
import { socialOAuthStartDiagnostic, socialOAuthCallbackDiagnostic, socialOAuthDiscoveryDiagnostic, socialOAuthGrantDiagnostic } from '../lib/socialPublishing/oauthDiagnostics';
import { SocialProviderError } from '../lib/socialPublishing/types';

function discoveryCode(error: unknown) {
  const diagnostic = socialOAuthDiscoveryDiagnostic('INSTAGRAM', { error });
  assert.ok('code' in diagnostic);
  return diagnostic.code;
}

test('OAuth start diagnostics emit only a constant event and exact Prisma or allowlisted setup code', () => {
  for (const code of ['P1001', 'P2028', 'P2025']) {
    assert.deepEqual(socialOAuthStartDiagnostic(Object.assign(new Error('private exception text'), { code })), { event: 'social_oauth_start_failed', code });
  }
  for (const code of ['oauth_not_configured', 'oauth_encryption_key_invalid', 'meta_config_id_invalid', 'meta_config_user_type_required']) {
    assert.deepEqual(socialOAuthStartDiagnostic(new SocialProviderError('private exception text', 'CONFIGURATION', code)), { event: 'social_oauth_start_failed', code });
  }
});

test('callback and discovery codes accept only fixed local/Prisma values or bounded numeric HTTP/Graph codes', () => {
  for (const code of ['P2028', 'network_interrupted', 'invalid_response', 'http_400', 'http_403_provider_200', 'http_400_provider_190_subcode_463']) {
    assert.deepEqual(socialOAuthCallbackDiagnostic({ code, message: 'PRIVATE_FIXTURE' }), { event: 'social_oauth_callback_failed', stage: 'CALLBACK', code });
    assert.equal(discoveryCode({ code }), code);
  }
  for (const code of ['http_400_provider_100_PRIVATE_FIXTURE', 'http_400_provider_123456789', 'http_400_provider_-10', 'http_400_provider_1_subcode_123456789', 'http_200', 'http_400_subcode_10', 'http_400\n', 'http_400\u2028', 'P2028\n', 'PRIVATE_FIXTURE']) {
    assert.equal(socialOAuthCallbackDiagnostic({ code }).code, 'unexpected');
    assert.equal(discoveryCode({ code }), 'unexpected');
  }
  let hooks = 0;
  const error = Object.defineProperty({ message: 'PRIVATE_FIXTURE', toJSON() { hooks++; return 'PRIVATE_FIXTURE'; } }, 'code', { get() { hooks++; return 'http_400'; } });
  assert.equal(socialOAuthCallbackDiagnostic(error).code, 'unexpected');
  assert.equal(discoveryCode(error), 'unexpected');
  assert.equal(hooks, 0);
});

test('grant diagnostics filter and deduplicate exact known scopes; discovery exposes only fixed outcomes/counts', () => {
  assert.deepEqual(socialOAuthGrantDiagnostic('FACEBOOK', ['pages_show_list', 'PRIVATE_FIXTURE', 'pages_show_list', 'instagram_basic', 'pages_show_list?token=PRIVATE_FIXTURE']), { event: 'social_oauth_grants', provider: 'FACEBOOK', stage: 'GRANTS', grantedScopes: ['instagram_basic', 'pages_show_list'] });
  assert.deepEqual(socialOAuthDiscoveryDiagnostic('FACEBOOK', { count: 0 }), { event: 'social_oauth_discovery', provider: 'FACEBOOK', stage: 'DISCOVERY', outcome: 'EMPTY', count: 0 });
  assert.deepEqual(socialOAuthDiscoveryDiagnostic('FACEBOOK', { count: 2 }), { event: 'social_oauth_discovery', provider: 'FACEBOOK', stage: 'DISCOVERY', outcome: 'FOUND', count: 2 });
  assert.equal(socialOAuthDiscoveryDiagnostic('PRIVATE_FIXTURE' as 'FACEBOOK', { count: 0 }).provider, 'UNKNOWN');
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
