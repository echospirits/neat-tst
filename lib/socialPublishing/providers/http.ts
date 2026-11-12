import { SocialProviderError, type ExternalIds, type ProviderContext } from '../types';

type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export function requiredString(value: unknown, label: string): string {
  const result = string(value);
  if (!result) throw new SocialProviderError(`The provider did not return ${label}; inspect this attempt before retrying.`, 'CONTENT', 'invalid_response');
  return result;
}
export async function request(url: string, init: RequestInit = {}, irreversible = false): Promise<Response> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000), redirect: 'error' }); }
  catch { throw new SocialProviderError(irreversible ? 'The publish response was interrupted. Reconcile the existing attempt before sending again.' : 'The provider request was interrupted; try again later.', irreversible ? 'AMBIGUOUS' : 'TRANSIENT', 'network_interrupted'); }
  if (response.ok) return response;
  let code = `http_${response.status}`;
  let providerCode: number | undefined;
  let providerSubcode: number | undefined;
  let providerTransient = false;
  try {
    const body = object(await response.json());
    const error = object(body.error);
    if (typeof error.code === 'number' && Number.isSafeInteger(error.code)) { providerCode = error.code; code += `_provider_${providerCode}`; }
    if (typeof error.error_subcode === 'number' && Number.isSafeInteger(error.error_subcode)) { providerSubcode = error.error_subcode; code += `_subcode_${providerSubcode}`; }
    providerTransient = error.is_transient === true;
  } catch { /* Do not expose provider bodies, access tokens, or URL query strings. */ }
  const retry = response.headers.get('retry-after');
  const parsedRetry = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : undefined;
  const retryAfter = parsedRetry && Number.isFinite(parsedRetry) ? Math.min(3600, Math.max(1, parsedRetry)) : undefined;
  // A publish-side upstream failure is ambiguous even if its body names a known
  // code. Only definite 4xx Graph rejections can clear the publication marker.
  if (response.status >= 500) throw new SocialProviderError(irreversible ? 'The platform returned an uncertain publish response. Reconcile before sending again.' : 'The platform is temporarily unavailable.', irreversible ? 'AMBIGUOUS' : 'TRANSIENT', code, retryAfter);
  const graph = new URL(url).hostname === 'graph.facebook.com';
  if (graph && providerCode !== undefined) {
    if (providerCode === 190 || providerCode === 10 || providerCode >= 200 && providerCode <= 299) throw new SocialProviderError('Meta authorization or publishing permission is missing or expired. An administrator must reconnect or review platform access.', 'AUTHORIZATION', code);
    // Official SDK classifications: 4/17/341 in the maintained Business SDK;
    // 32/613 also in Meta's official PHP Graph SDK. Unknown subcodes can denote
    // policy/integrity restrictions, so never turn them into automatic retries.
    if (response.status >= 400 && providerSubcode === undefined && [4, 17, 32, 341, 613].includes(providerCode)) throw new SocialProviderError('Meta rejected the request because its request limit was reached. Use bounded backoff.', 'TRANSIENT', code, retryAfter);
  }
  if (graph && ([1, 2].includes(providerCode ?? -1) || providerTransient)) throw new SocialProviderError(irreversible ? 'Meta returned an uncertain transient publish response. Reconcile before sending again.' : 'Meta is temporarily unavailable.', irreversible ? 'AMBIGUOUS' : 'TRANSIENT', code, retryAfter);
  if (graph && providerSubcode !== undefined && [4, 17, 32, 341, 613].includes(providerCode ?? -1)) throw new SocialProviderError('Meta rejected this request with a specific restriction. An administrator must review its code before retrying.', 'CONTENT', code);
  if (response.status === 401 || response.status === 403) throw new SocialProviderError('Authorization or publishing permission is missing or expired. An administrator must reconnect or review platform access.', 'AUTHORIZATION', code);
  if (response.status === 429) throw new SocialProviderError('The platform rate limit was reached. The queued attempt will use bounded backoff.', 'TRANSIENT', code, retryAfter);
  throw new SocialProviderError('The platform rejected this request. Review the content, account eligibility and configured API version.', 'CONTENT', code);
}
export async function jsonRequest(url: string, init?: RequestInit, irreversible = false): Promise<JsonObject> {
  const response = await request(url, init, irreversible);
  try { return object(await response.json()); }
  catch { throw new SocialProviderError('The provider returned an unreadable response. Review this attempt before retrying.', irreversible ? 'AMBIGUOUS' : 'TRANSIENT', 'invalid_json'); }
}
export async function checkpoint(context: ProviderContext, ids: ExternalIds): Promise<ExternalIds> {
  context.ids = { ...context.ids, ...ids };
  await context.checkpoint(context.ids);
  return context.ids;
}
export async function publishOperation<T>(context: ProviderContext, action: () => Promise<T>): Promise<T> {
  if (context.content.options?.manualInstructions?.trim()) throw new SocialProviderError('This revision requires native completion. Automatic publication is blocked.', 'CONTENT', 'manual_completion_required');
  if (context.ids.publicationStarted) throw new SocialProviderError('Publication already started; reconcile this attempt instead of creating another post.', 'AMBIGUOUS', 'publish_already_started');
  await checkpoint(context, { publicationStarted: true });
  await context.assertCanPublish();
  try { return await action(); }
  catch (error) {
    if (error instanceof SocialProviderError && error.kind !== 'AMBIGUOUS') await checkpoint(context, { publicationStarted: false });
    throw error;
  }
}
export function uploadUrl(value: unknown): string {
  const parsed = new URL(requiredString(value, 'an upload URL'));
  if (parsed.protocol !== 'https:' || !['linkedin.com', 'linkedin-ei.com', 'licdn.com', 'facebook.com', 'fbcdn.net'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new SocialProviderError('The provider returned an unexpected upload host.', 'CONTENT', 'unsafe_upload_host');
  }
  return parsed.href;
}
export const jsonBody = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
