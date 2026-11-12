import { createHmac, timingSafeEqual } from 'node:crypto';
import { get } from '@vercel/blob';
import { MAX_SOCIAL_MEDIA_BYTES } from './mediaProbe';

type PrivateMedia = { id: string; organizationId: string; storageKey: string; sha256: string };
const MEDIA_URL_LIFETIME_SECONDS = 24 * 60 * 60;

export function socialBlobToken() {
  const token = process.env.SOCIAL_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('Social media storage is not configured. An administrator must connect a private Blob store with SOCIAL_BLOB_READ_WRITE_TOKEN.');
  return token;
}
function signingSecret() {
  const secret = process.env.SOCIAL_MEDIA_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('Set SOCIAL_MEDIA_SIGNING_SECRET to at least 32 random characters before dispatching media.');
  return secret;
}
function mediaSignature(media: Pick<PrivateMedia, 'id' | 'organizationId' | 'sha256'>, expires: number) {
  return createHmac('sha256', signingSecret()).update(JSON.stringify([media.organizationId, media.id, media.sha256, expires])).digest('base64url');
}
/** Mint only near dispatch. Drafts never carry an expiring public file URL. */
export function createDispatchMediaUrl(media: PrivateMedia, now = new Date()) {
  const origin = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (!origin) throw new Error('APP_BASE_URL is required for dispatch media URLs.');
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(base.hostname) && process.env.APP_ENV === 'development')) throw new Error('Dispatch media URLs require an HTTPS APP_BASE_URL.');
  const expires = Math.floor(now.getTime() / 1000) + MEDIA_URL_LIFETIME_SECONDS;
  const url = new URL(`/api/social/media/${encodeURIComponent(media.id)}`, base);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('signature', mediaSignature(media, expires));
  return url.toString();
}
export function verifyDispatchMediaSignature(media: Pick<PrivateMedia, 'id' | 'organizationId' | 'sha256'>, expires: string | null, signature: string | null, now = new Date()) {
  if (!expires || !/^\d{10}$/.test(expires) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const seconds = Number(expires), current = Math.floor(now.getTime() / 1000);
  if (seconds < current || seconds > current + MEDIA_URL_LIFETIME_SECONDS) return false;
  const expected = Buffer.from(mediaSignature(media, seconds));
  const provided = Buffer.from(signature);
  return provided.length === expected.length && timingSafeEqual(new Uint8Array(provided), new Uint8Array(expected));
}

export async function readSocialMedia(media: Pick<PrivateMedia, 'storageKey'>): Promise<Buffer> {
  const blob = await get(media.storageKey, { access: 'private', token: socialBlobToken(), useCache: false });
  if (!blob || blob.statusCode !== 200 || blob.blob.size > MAX_SOCIAL_MEDIA_BYTES) throw new Error('The private media version is unavailable or too large. Upload a new version.');
  const reader = blob.stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_SOCIAL_MEDIA_BYTES) { await reader.cancel(); throw new Error('The media exceeds the 200 MB pilot limit.'); }
      parts.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}

export function socialUploadPath(organizationId: string, groupId: string, userId: string, uploadId: string, extension: string) {
  if (![organizationId, groupId, userId, uploadId].every(value => /^[a-zA-Z0-9_-]{1,120}$/.test(value)) || !['jpg', 'png', 'mp4'].includes(extension)) throw new Error('Invalid media upload identity.');
  return `social/${organizationId}/${groupId}/${userId}/${uploadId}.${extension}`;
}
