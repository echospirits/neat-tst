import { z } from 'zod';

export const SUPPORT_CATEGORIES = { BUG: 'Bug / something broken', DATA: 'Data issue', ENHANCEMENT: 'Enhancement request', QUESTION: 'General question' } as const;
export const SUPPORT_STATUSES = { OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_ON_USER: 'Waiting for you', PLANNED: 'Fix planned', COMPLETE: 'Complete' } as const;
export const MAX_SUPPORT_SCREENSHOT_BYTES = 600 * 1024;
export const SUPPORT_TRAIL_KEY = 'neat:support-trail';
export const SUPPORT_PAGE_SIZE = 30;

export type SupportTrailEntry = { path: string; at: string };

export function supportReturnPath(value: unknown) {
  return typeof value === 'string' && /^\/support(?:\?[^#]{0,1200})?$/.test(value) ? value : '/support';
}

// Keep record identity, but never search terms, URL tokens, fragments or input values.
export function safeSupportPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//')) return null;
  const path = value.split(/[?#]/)[0];
  if (!/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(path) || path.length > 220) return null;
  if (path !== '/' && !/^\/(?:agencies|wholesale|wholesale-orders|visits|alerts|search|accounts|opportunities|agency-focus|pipeline|tags|analytics|profile|settings|users|admin|support)(?:\/|$)/.test(path)) return null;
  return path;
}

export function sanitizeSupportDiagnostics(value: unknown, now = new Date()) {
  const input = z.object({
    trail: z.array(z.object({ path: z.unknown(), at: z.string() })).max(10).optional(),
    browser: z.enum(['Chrome', 'Edge', 'Firefox', 'Safari', 'Other']).optional(),
    viewport: z.object({ width: z.number().int().min(100).max(10000), height: z.number().int().min(100).max(10000) }).optional(),
  }).safeParse(value);
  if (!input.success) return { trail: [] as SupportTrailEntry[] };
  const trail = (input.data.trail ?? []).flatMap(({ path, at }) => {
    const safePath = safeSupportPath(path), date = new Date(at);
    return safePath && Number.isFinite(date.getTime()) && date <= now && now.getTime() - date.getTime() <= 30 * 60_000
      ? [{ path: safePath, at: date.toISOString() }] : [];
  });
  return { ...input.data, trail };
}

export function readSupportTrail(storage: Pick<Storage, 'getItem'>, scope: string): SupportTrailEntry[] {
  try {
    const saved = JSON.parse(storage.getItem(SUPPORT_TRAIL_KEY) ?? '{}');
    return saved.scope === scope ? sanitizeSupportDiagnostics({ trail: saved.trail }).trail ?? [] : [];
  } catch { return []; }
}

export const createSupportSchema = z.object({
  requestId: z.string().uuid(),
  category: z.enum(['BUG', 'DATA', 'ENHANCEMENT', 'QUESTION']),
  title: z.string().trim().min(3, 'Add a short summary (at least 3 characters).').max(160),
  description: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(5000),
});

const dateOnly = z.string().refine((value) => {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Choose a valid date.');
export const supportReplySchema = z.object({
  requestId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  body: z.string().trim().min(1, 'Write a response before saving.').max(5000),
  action: z.enum(['reply', 'note']),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'PLANNED', 'COMPLETE']).optional(),
  anticipatedFixDate: dateOnly.optional(),
  priority: z.enum(['NORMAL', 'URGENT']).optional(),
}).superRefine((value, context) => {
  if (value.action === 'reply' && value.status === 'PLANNED' && !value.anticipatedFixDate) context.addIssue({ code: 'custom', path: ['anticipatedFixDate'], message: 'Add an anticipated fix date for a planned fix.' });
});

export function supportDate(value: Date | string | null | undefined) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function validateSupportScreenshot(bytes: Uint8Array, contentType: string) {
  if (!bytes.length || bytes.length > MAX_SUPPORT_SCREENSHOT_BYTES) return false;
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (contentType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}
