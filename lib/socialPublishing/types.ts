import { z } from 'zod';

export const SOCIAL_PROVIDERS = ['INSTAGRAM', 'FACEBOOK', 'GOOGLE_BUSINESS', 'LINKEDIN'] as const;
export type SocialProvider = typeof SOCIAL_PROVIDERS[number];
export const SOCIAL_FORMATS = ['TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'REEL', 'STORY', 'LINK', 'EVENT', 'MULTI_IMAGE'] as const;
export type SocialFormat = typeof SOCIAL_FORMATS[number];

export const socialOptionsSchema = z.object({
  shareToFeed: z.boolean().optional(),
  altText: z.string().max(1000).optional(),
  googlePolicyAcknowledged: z.boolean().optional(),
  googleCallToAction: z.enum(['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL']).optional(),
  manualInstructions: z.string().max(2000).optional(),
}).strict();
export type SocialOptions = z.infer<typeof socialOptionsSchema>;

export type MediaVersion = {
  id: string;
  fileName?: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  durationSeconds?: number | null;
  sha256: string;
};
export type PublishContent = {
  caption: string;
  format: SocialFormat;
  media: MediaVersion[];
  link?: string;
  event?: { title: string; startAt: string; endAt: string };
  options?: SocialOptions;
};
export type SocialDestination = {
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  handle?: string;
  profileImageUrl?: string;
  metadata: Record<string, unknown>;
};
/** Server only. Never return this object from a client-facing discovery endpoint. */
export type SocialCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  ownerId?: string;
};
/** Discovery can return per-Page tokens; persist encrypted, strip before displaying metadata. */
export type DiscoveredDestination = SocialDestination & { credentials?: SocialCredentials };
export type ExternalIds = {
  containerId?: string;
  mediaIds?: string[];
  postId?: string;
  /** Persist BEFORE an irreversible post operation; recovery must check, never recreate blindly. */
  publicationStarted?: boolean;
  uploadComplete?: boolean;
};
export type PreparedMedia = { ids: ExternalIds; ready: boolean; rejected?: string };
export type ProviderOutcome = {
  status: 'ACCEPTED' | 'PROCESSING' | 'PUBLISHED' | 'REJECTED' | 'NEEDS_ATTENTION';
  ids: ExternalIds;
  postUrl?: string;
  detail?: string;
  /** API readback confirms serving/visible state; public human inspection is separate evidence. */
  confirmed?: boolean;
};
export type ProviderContext = {
  destination: SocialDestination;
  credentials: SocialCredentials;
  content: PublishContent;
  ids: ExternalIds;
  getMediaUrl(media: MediaVersion): Promise<string>;
  readMedia(media: MediaVersion): Promise<Uint8Array>;
  checkpoint(ids: ExternalIds): Promise<void>;
  /** Must recheck current approval, revision, cancellation, tenant/group and live gates. */
  assertCanPublish(): Promise<void>;
};
export type SocialProviderAdapter = {
  provider: SocialProvider;
  discover(credentials: SocialCredentials): Promise<DiscoveredDestination[]>;
  validate(destination: SocialDestination, content: PublishContent): string[];
  prepare(context: ProviderContext): Promise<PreparedMedia>;
  publish(context: ProviderContext, prepared: PreparedMedia): Promise<ProviderOutcome>;
  check(context: ProviderContext, ids: ExternalIds): Promise<ProviderOutcome>;
};
export class SocialProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'CONFIGURATION' | 'AUTHORIZATION' | 'CONTENT' | 'TRANSIENT' | 'AMBIGUOUS',
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) { super(message); this.name = 'SocialProviderError'; }
}
