import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ECHO_ORGANIZATION_ID } from '../echoAccess';
import { SOCIAL_FORMATS, socialOptionsSchema } from './types';
import { tastingLocalTimestamp } from '../tastings/time';

export const SOCIAL_TIMEZONE = 'America/New_York';
export const SOCIAL_LATE_LIMIT_MS = 15 * 60_000;
export const SOCIAL_MAX_ATTEMPTS = 4;
export const socialLocalTimestamp = tastingLocalTimestamp;
export const socialDraftInput = z
  .object({
    id: z.string().max(100).optional(),
    version: z.coerce.number().int().nonnegative().default(0),
    groupId: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(200),
    caption: z.string().max(10000).default(''),
    note: z.string().max(4000).default(''),
    proposedAt: z.string().datetime({ offset: true }).nullable().optional(),
    destinations: z
      .array(
        z
          .object({
            destinationId: z.string().min(1).max(100),
            caption: z.string().max(10000),
            format: z.enum(SOCIAL_FORMATS),
            mediaIds: z.array(z.string().min(1)).max(20),
            link: z
              .union([
                z
                  .string()
                  .url()
                  .refine(
                    (v) => new URL(v).protocol === 'https:',
                    'Use an HTTPS link.',
                  ),
                z.literal(''),
              ])
              .optional(),
            event: z
              .object({
                title: z.string().max(200),
                startAt: z.string().datetime({ offset: true }),
                endAt: z.string().datetime({ offset: true }),
              })
              .optional(),
            options: socialOptionsSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.destinations.map((d) => d.destinationId)).size !==
      v.destinations.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Select each destination once.',
      });
  });
export type SocialDraftInput = z.infer<typeof socialDraftInput>;
export type SocialSnapshot = {
  title: string;
  caption: string;
  note: string;
  proposedAt: string | null;
  destinations: Array<
    SocialDraftInput['destinations'][number] & {
      externalId: string;
      provider: string;
      displayName: string;
      media: import('./types').MediaVersion[];
    }
  >;
};
// PostgreSQL JSONB and provider payload serialization may reorder object keys.
// Canonicalize objects while retaining array order (especially reviewed media).
function canonicalSocialValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSocialValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonicalSocialValue(v)]),
    );
  return value;
}
export const socialHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalSocialValue(value)))
    .digest('hex');
export function socialTesterEnabled(
  userId: string,
  env: Record<string, string | undefined> = process.env,
) {
  return (env.SOCIAL_PILOT_USER_IDS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .includes(userId);
}
export function socialLivePolicy(
  organizationId: string,
  destinationId: string,
  approvedAt: Date | undefined | null,
  env: Record<string, string | undefined> = process.env,
) {
  if (env.SOCIAL_LIVE_PUBLISHING_ENABLED !== 'true')
    return { enabled: false, reason: 'Live publishing is disabled.' };
  const allowed = (env.SOCIAL_LIVE_DESTINATION_IDS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const notBefore = new Date(env.SOCIAL_LIVE_NOT_BEFORE ?? '');
  if (
    env.APP_ENV !== 'test' ||
    env.SOCIAL_LIVE_ENVIRONMENT !== 'test' ||
    organizationId !== ECHO_ORGANIZATION_ID ||
    env.SOCIAL_LIVE_ORGANIZATION_ID !== organizationId ||
    !allowed.includes(destinationId) ||
    !Number.isFinite(notBefore.getTime())
  )
    return {
      enabled: false,
      reason:
        'Live pilot environment, tenant, destination or activation timestamp is not configured.',
    };
  if (approvedAt && approvedAt < notBefore)
    return {
      enabled: false,
      reason: 'Approve this revision again after live activation.',
    };
  return { enabled: true, reason: 'Live destination explicitly allowed.' };
}
export function socialDeliveryGuard(
  v: {
    approvedAt: Date | null;
    invalidatedAt: Date | null;
    postStatus: string;
    currentRevision: number;
    revisionNumber: number;
    destinationEnabled: boolean;
    connectionHealth: string;
    expiresAt: Date | null;
    scheduledAt: Date;
    started: boolean;
  },
  now: Date,
) {
  if (
    !v.approvedAt ||
    v.invalidatedAt ||
    v.postStatus !== 'APPROVED' ||
    v.currentRevision !== v.revisionNumber
  )
    return 'Approval is canceled, missing or superseded.';
  if (
    !v.destinationEnabled ||
    ['DISCONNECTED', 'RECONNECT_REQUIRED'].includes(v.connectionHealth) ||
    (v.expiresAt && v.expiresAt <= now)
  )
    return 'Reconnect this destination before publishing.';
  if (
    !v.started &&
    now.getTime() - v.scheduledAt.getTime() > SOCIAL_LATE_LIMIT_MS
  )
    return 'More than 15 minutes late. Choose a new time or explicitly publish now.';
  return null;
}
export function socialRetryDelay(attempt: number, retryAfter?: number) {
  return (
    Math.min(
      3600,
      Math.max(60 * 2 ** Math.max(0, attempt - 1), retryAfter ?? 0),
    ) * 1000
  );
}
export function deriveSocialDeliveryStatus(
  deliveries: readonly { status: string; mode?: string }[],
) {
  if (!deliveries.length) return 'Not scheduled';
  const statuses = new Set(deliveries.map((d) => d.status));
  if (statuses.size === 1) return deliveries[0].status;
  if (
    statuses.has('PUBLISHED') ||
    statuses.has('MANUALLY_CONFIRMED') ||
    statuses.has('SIMULATED')
  )
    return 'PARTIAL';
  if (
    statuses.has('NEEDS_ATTENTION') ||
    statuses.has('FAILED') ||
    statuses.has('REJECTED')
  )
    return 'NEEDS_ATTENTION';
  return 'IN_PROGRESS';
}

export function socialTenantLivePolicy(
  preferences: unknown,
  approvedAt?: Date | null,
) {
  const value = (
    preferences as {
      socialPublishing?: { liveEnabled?: unknown; liveNotBefore?: unknown };
    } | null
  )?.socialPublishing;
  const enabledAt =
    typeof value?.liveNotBefore === 'string'
      ? new Date(value.liveNotBefore)
      : new Date(NaN);
  if (value?.liveEnabled !== true || !Number.isFinite(enabledAt.getTime()))
    return {
      enabled: false,
      reason: 'The tenant live-publishing control is paused.',
    };
  if (approvedAt && approvedAt < enabledAt)
    return {
      enabled: false,
      reason: 'Approve this exact revision again after tenant live activation.',
    };
  return {
    enabled: true,
    reason: 'Tenant live publishing explicitly enabled.',
  };
}
