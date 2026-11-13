import type { SocialCredentials, SocialProvider } from '../types';
import { SocialProviderError } from '../types';
import { jsonRequest, list, object, requiredString, string } from './http';
import { getSocialBaseUrl } from '../config';
import { getSocialCryptoConfiguration } from '../crypto';

export const META_GRAPH_VERSION = process.env.SOCIAL_META_GRAPH_VERSION || 'v26.0';
export const LINKEDIN_VERSION = process.env.SOCIAL_LINKEDIN_VERSION || '202609';
export const providerScopes: Record<SocialProvider, string[]> = {
  INSTAGRAM: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'],
  FACEBOOK: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
  GOOGLE_BUSINESS: ['https://www.googleapis.com/auth/business.manage'],
  LINKEDIN: ['rw_organization_admin', 'w_organization_social', 'r_organization_social'],
};
const family = (provider: SocialProvider) => ['INSTAGRAM', 'FACEBOOK'].includes(provider) ? 'META' : provider === 'GOOGLE_BUSINESS' ? 'GOOGLE' : 'LINKEDIN';
/** Configuration IDs select provider settings; they never replace OAuth state or prove token type. */
export function getMetaLoginConfiguration(): { id: string; tokenType: 'USER' } | null {
  const id = process.env.SOCIAL_META_CONFIG_ID?.trim();
  if (!id) return null;
  if (!/^[0-9]{1,100}$/.test(id)) throw new SocialProviderError('SOCIAL_META_CONFIG_ID must be the numeric ID of the matching Meta login configuration.', 'CONFIGURATION', 'meta_config_id_invalid');
  if (process.env.SOCIAL_META_TOKEN_TYPE?.trim() !== 'USER') throw new SocialProviderError('Confirm the matching configuration uses User access token, then set SOCIAL_META_TOKEN_TYPE=USER. Unknown and system-user configurations are unsupported.', 'CONFIGURATION', 'meta_config_user_type_required');
  return { id, tokenType: 'USER' };
}
export function getOAuthConfiguration(provider: SocialProvider, baseUrl?: string) {
  const prefix = `SOCIAL_${family(provider)}`;
  const keys = family(provider) === 'META' ? [`${prefix}_APP_ID`, `${prefix}_APP_SECRET`] : [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`];
  const missing = keys.filter(key => !process.env[key]?.trim());
  const crypto = getSocialCryptoConfiguration();
  if (!crypto.configured) missing.push(crypto.keyName);
  let configurationError: string | undefined;
  if (family(provider) === 'META') {
    try { getMetaLoginConfiguration(); }
    catch (error) {
      if (!(error instanceof SocialProviderError)) throw error;
      configurationError = error.message;
      missing.push(error.code === 'meta_config_id_invalid' ? 'SOCIAL_META_CONFIG_ID (numeric ID required)' : 'SOCIAL_META_TOKEN_TYPE (verified USER configuration required)');
    }
  }
  const apiVersion = family(provider) === 'META' ? META_GRAPH_VERSION : provider === 'LINKEDIN' ? LINKEDIN_VERSION : 'Account Management v1 / Business Information v1 / Local Posts v4';
  const accessStatus = process.env[`${prefix}_ACCESS_STATUS`] ?? 'PENDING';
  const route = family(provider) === 'META' ? 'meta' : provider === 'GOOGLE_BUSINESS' ? 'google' : 'linkedin';
  return { configured: missing.length === 0, missing, configurationError, callbackUrl: new URL(`/api/social/oauth/${route}/callback`, getSocialBaseUrl(baseUrl)).href, apiVersion, accessStatus };
}
function client(provider: SocialProvider) {
  const prefix = `SOCIAL_${family(provider)}`;
  const clientId = process.env[family(provider) === 'META' ? `${prefix}_APP_ID` : `${prefix}_CLIENT_ID`];
  const clientSecret = process.env[family(provider) === 'META' ? `${prefix}_APP_SECRET` : `${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new SocialProviderError(`Configure ${prefix} credentials before connecting.`, 'CONFIGURATION', 'oauth_not_configured');
  return { clientId, clientSecret };
}
export function buildOAuthAuthorizationUrl(provider: SocialProvider, input: { state: string; redirectUri: string; codeChallenge?: string }): string {
  const metaConfiguration = family(provider) === 'META' ? getMetaLoginConfiguration() : null;
  const { clientId } = client(provider);
  const scopes = family(provider) === 'META' ? [...new Set([...providerScopes.INSTAGRAM, ...providerScopes.FACEBOOK])] : providerScopes[provider];
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: input.redirectUri, response_type: 'code', state: input.state, scope: scopes.join(provider === 'FACEBOOK' || provider === 'INSTAGRAM' ? ',' : ' ') });
  if (metaConfiguration) { params.delete('scope'); params.set('config_id', metaConfiguration.id); }
  if (provider === 'GOOGLE_BUSINESS') { params.set('access_type', 'offline'); params.set('prompt', 'consent'); if (input.codeChallenge) { params.set('code_challenge', input.codeChallenge); params.set('code_challenge_method', 'S256'); } }
  const endpoint = provider === 'GOOGLE_BUSINESS' ? 'https://accounts.google.com/o/oauth2/v2/auth' : provider === 'LINKEDIN' ? 'https://www.linkedin.com/oauth/v2/authorization' : `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
  return `${endpoint}?${params}`;
}
export async function exchangeOAuthCode(provider: SocialProvider, input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<SocialCredentials> {
  if (family(provider) === 'META') getMetaLoginConfiguration();
  const { clientId, clientSecret } = client(provider);
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: input.code, redirect_uri: input.redirectUri, grant_type: 'authorization_code' });
  if (provider === 'GOOGLE_BUSINESS' && input.codeVerifier) params.set('code_verifier', input.codeVerifier);
  const endpoint = provider === 'GOOGLE_BUSINESS' ? 'https://oauth2.googleapis.com/token' : provider === 'LINKEDIN' ? 'https://www.linkedin.com/oauth/v2/accessToken' : `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
  let result = await jsonRequest(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  if (family(provider) === 'META') {
    result = await jsonRequest(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret, fb_exchange_token: requiredString(result.access_token, 'an access token') }) });
  }
  const accessToken = requiredString(result.access_token, 'an access token');
  let scopes = string(result.scope).split(/[ ,]+/).filter(Boolean);
  let ownerId: string | undefined;
  if (family(provider) === 'META') {
    const headers = { authorization: `Bearer ${accessToken}` };
    const me = await jsonRequest(`https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id`, { headers });
    ownerId = string(me.id) || undefined;
    const permissions = await jsonRequest(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`, { headers });
    scopes = list(permissions.data).map(object).filter(item => item.status === 'granted').map(item => string(item.permission)).filter(Boolean);
  }
  // Google/LinkedIn may omit scope for unchanged grants; requested scopes are recorded
  // separately by the caller and must not be presented as verified grants if absent.
  return { accessToken, refreshToken: string(result.refresh_token) || undefined, expiresAt: typeof result.expires_in === 'number' ? new Date(Date.now() + result.expires_in * 1000).toISOString() : undefined, scopes, ownerId };
}
export async function refreshSocialCredentials(provider: SocialProvider, credentials: SocialCredentials): Promise<SocialCredentials> {
  if (!credentials.expiresAt || Date.parse(credentials.expiresAt) > Date.now() + 60_000) return credentials;
  if (!credentials.refreshToken || family(provider) === 'META') throw new SocialProviderError('This authorization expired. An administrator must reconnect the account.', 'AUTHORIZATION', 'authorization_expired');
  const { clientId, clientSecret } = client(provider);
  const endpoint = provider === 'GOOGLE_BUSINESS' ? 'https://oauth2.googleapis.com/token' : 'https://www.linkedin.com/oauth/v2/accessToken';
  let result: Record<string, unknown>;
  try { result = await jsonRequest(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken, client_id: clientId, client_secret: clientSecret }) }); }
  catch (error) { if (error instanceof SocialProviderError && (error.code.startsWith('http_400') || error.kind === 'AUTHORIZATION')) throw new SocialProviderError('The refresh grant is invalid or revoked. An administrator must reconnect.', 'AUTHORIZATION', 'refresh_grant_invalid'); throw error; }
  return { ...credentials, accessToken: requiredString(result.access_token, 'an access token'), refreshToken: string(result.refresh_token) || credentials.refreshToken, expiresAt: new Date(Date.now() + (typeof result.expires_in === 'number' ? result.expires_in : 3600) * 1000).toISOString(), scopes: string(result.scope) ? string(result.scope).split(/[ ,]+/) : credentials.scopes };
}
