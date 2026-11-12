import { getAppEnvironment } from '../appEnvironment';

/** Social-only origin override. Existing application/integration base URLs stay untouched. */
export function getSocialBaseUrl(fallback?: string): string {
  const selected = process.env.SOCIAL_BASE_URL?.trim() || fallback?.trim() || process.env.APP_BASE_URL?.trim();
  if (!selected) throw new Error('Configure SOCIAL_BASE_URL or APP_BASE_URL for Social Publishing.');
  let url: URL;
  try {
    if (!/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(selected) || /[\u0000-\u0020\\]/.test(selected)) throw new Error('Invalid origin.');
    url = new URL(selected);
    if (!url.hostname || url.username || url.password) throw new Error('Invalid origin.');
  } catch {
    throw new Error('Configure SOCIAL_BASE_URL or APP_BASE_URL as a valid absolute HTTP(S) origin without embedded credentials.');
  }
  const developmentLoopback = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && getAppEnvironment() === 'development';
  if (url.protocol !== 'https:' && !developmentLoopback) throw new Error('Social Publishing requires an HTTPS base URL; HTTP loopback is allowed only in development.');
  return url.origin;
}
