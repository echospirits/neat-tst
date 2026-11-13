import { SOCIAL_PROVIDERS, type SocialProvider } from './types';

const setupCodes = new Set([
  'oauth_not_configured',
  'oauth_encryption_key_invalid',
  'meta_config_id_invalid',
  'meta_config_user_type_required',
]);
const callbackCodes = new Set([...setupCodes, 'network_interrupted', 'invalid_json', 'invalid_response', 'incomplete_discovery', 'discovery_limit', 'invalid_api_version', 'invalid_account_id', 'invalid_location_id']);
const grantedScopeNames = new Set(['public_profile', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish', 'business_management', 'https://www.googleapis.com/auth/business.manage', 'rw_organization_admin', 'w_organization_social', 'r_organization_social']);

function ownCode(error: unknown): unknown {
  try {
    if (error && typeof error === 'object') return Object.getOwnPropertyDescriptor(error, 'code')?.value;
  } catch { /* A hostile accessor/proxy is not diagnostic data. */ }
  return undefined;
}
const prismaCode = (code: string) => code.length === 5 && /^P[0-9]{4}$/.test(code);
function callbackCode(error: unknown): string {
  const code = ownCode(error);
  // HTTP status is 4xx/5xx; provider/subcode are bounded decimal codes only.
  if (typeof code !== 'string' || code.length > 64 || /\s/.test(code)) return 'unexpected';
  return prismaCode(code) || callbackCodes.has(code) || /^http_[45][0-9]{2}(?:_provider_[0-9]{1,8}(?:_subcode_[0-9]{1,8})?)?$/.test(code) ? code : 'unexpected';
}
function diagnosticProvider(provider: unknown): SocialProvider | 'UNKNOWN' {
  return typeof provider === 'string' && (SOCIAL_PROVIDERS as readonly string[]).includes(provider) ? provider as SocialProvider : 'UNKNOWN';
}

/** Never serialize an exception, message, stack, URL or arbitrary provider code. */
export function socialOAuthStartDiagnostic(error: unknown): { event: 'social_oauth_start_failed'; code: string } {
  const code = ownCode(error);
  return {
    event: 'social_oauth_start_failed',
    code: typeof code === 'string' && (prismaCode(code) || setupCodes.has(code)) ? code : 'unexpected',
  };
}

export function socialOAuthGrantDiagnostic(provider: SocialProvider, scopes: readonly string[]) {
  return { event: 'social_oauth_grants' as const, provider: diagnosticProvider(provider), stage: 'GRANTS' as const, grantedScopes: [...new Set(scopes.filter(scope => grantedScopeNames.has(scope)))].sort() };
}

export function socialOAuthDiscoveryDiagnostic(provider: SocialProvider, result: { count: number } | { error: unknown }) {
  const base = { event: 'social_oauth_discovery' as const, provider: diagnosticProvider(provider), stage: 'DISCOVERY' as const };
  if ('error' in result) return { ...base, outcome: 'FAILED' as const, count: 0, code: callbackCode(result.error) };
  const count = Number.isSafeInteger(result.count) && result.count > 0 ? result.count : 0;
  return { ...base, outcome: count ? 'FOUND' as const : 'EMPTY' as const, count };
}

export function socialOAuthCallbackDiagnostic(error: unknown) {
  return { event: 'social_oauth_callback_failed' as const, stage: 'CALLBACK' as const, code: callbackCode(error) };
}
