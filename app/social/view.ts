import type { SocialProvider, SocialFormat, SocialOptions } from '../../lib/socialPublishing/types';

export const providerNames: Record<string, string> = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', GOOGLE_BUSINESS: 'Google Business Profile', LINKEDIN: 'LinkedIn company Page' };
export const formatNames: Record<string, string> = { TEXT: 'Text', IMAGE: 'Photo', CAROUSEL: 'Carousel', VIDEO: 'Finished video', REEL: 'Reel', STORY: 'Plain Story', LINK: 'Link', EVENT: 'Event', MULTI_IMAGE: 'Multiple photos' };
export const providerFormats: Record<SocialProvider, SocialFormat[]> = { INSTAGRAM: ['IMAGE', 'CAROUSEL', 'REEL', 'STORY'], FACEBOOK: ['TEXT', 'IMAGE', 'LINK', 'VIDEO', 'REEL'], GOOGLE_BUSINESS: ['IMAGE', 'EVENT'], LINKEDIN: ['TEXT', 'IMAGE', 'LINK', 'MULTI_IMAGE', 'VIDEO'] };
export type GroupView = { id: string; label: string };
export type DestinationView = { id: string; groupId: string | null; provider: SocialProvider; externalId: string; displayName: string; handle: string | null; profileImageUrl: string | null; health: string; enabled: boolean; metadata?: Record<string, unknown> };
export type MediaView = { id: string; groupId: string; fileName: string; mimeType: string; bytes: number; width: number; height: number; durationSeconds: number | null; sha256: string };
export type DraftDestination = { destinationId: string; caption: string; format: SocialFormat; mediaIds: string[]; link?: string; event?: { title: string; startLocal: string; endLocal: string }; options?: SocialOptions };
export type ComposerDraft = { id?: string; version: number; groupId: string; title: string; caption: string; note: string; proposedLocal: string; destinations: DraftDestination[] };
export function clientDestination(destination: Omit<DestinationView, 'provider' | 'metadata'> & { provider: string; metadata?: unknown }): DestinationView {
  const metadata = destination.metadata && typeof destination.metadata === 'object' && !Array.isArray(destination.metadata) ? destination.metadata as Record<string, unknown> : {};
  return { id: destination.id, groupId: destination.groupId, provider: destination.provider as SocialProvider, externalId: destination.externalId, displayName: destination.displayName, handle: destination.handle, profileImageUrl: destination.profileImageUrl, health: destination.health, enabled: destination.enabled, metadata: { accountType: metadata.accountType } };
}
export function clientMedia(media: MediaView): MediaView {
  return { id: media.id, groupId: media.groupId, fileName: media.fileName, mimeType: media.mimeType, bytes: media.bytes, width: media.width, height: media.height, durationSeconds: media.durationSeconds, sha256: media.sha256 };
}
export function socialStatusLabel(value: string) { return value.toLowerCase().split('_').map(word => word[0]?.toUpperCase() + word.slice(1)).join(' '); }
export function localDateTime(value: string | Date | null | undefined) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
