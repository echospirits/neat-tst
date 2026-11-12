import { socialOptionsSchema, type PublishContent, type SocialDestination, type SocialFormat } from '../types';

export const supportedFormats: Record<SocialDestination['provider'], readonly SocialFormat[]> = {
  INSTAGRAM: ['IMAGE', 'CAROUSEL', 'REEL', 'STORY'],
  FACEBOOK: ['TEXT', 'LINK', 'IMAGE', 'VIDEO', 'REEL'],
  GOOGLE_BUSINESS: ['IMAGE', 'EVENT'],
  LINKEDIN: ['TEXT', 'IMAGE', 'LINK', 'MULTI_IMAGE', 'VIDEO'],
};
const MB = 1024 * 1024;
export function validateContent(destination: SocialDestination, content: PublishContent): string[] {
  const errors: string[] = [];
  const { provider } = destination;
  const media = content.media;
  const manual = Boolean(content.options?.manualInstructions?.trim());
  if (!manual && !supportedFormats[provider].includes(content.format)) errors.push(`${content.format} is not supported for ${provider} in this pilot. Use the native app or select a supported format.`);
  if (!socialOptionsSchema.safeParse(content.options ?? {}).success) errors.push('An option is unsupported or invalid. Music, tags, collaborators and Story interactions require the manual workflow until separately verified.');
  if (!content.caption.trim() && !media.length && !content.link) errors.push('Add copy, a link or media.');
  if (content.link) { try { if (new URL(content.link).protocol !== 'https:') errors.push('Use an HTTPS link.'); } catch { errors.push('The link is invalid.'); } }
  if (content.caption.length > (provider === 'INSTAGRAM' ? 2200 : provider === 'LINKEDIN' ? 3000 : provider === 'GOOGLE_BUSINESS' ? 1500 : 63206)) errors.push('The caption exceeds this platform’s character limit.');
  const minimum = ['TEXT', 'LINK'].includes(content.format) ? 0 : content.format === 'EVENT' ? 0 : ['CAROUSEL', 'MULTI_IMAGE'].includes(content.format) ? 2 : 1;
  const maximum = content.format === 'CAROUSEL' ? 10 : content.format === 'MULTI_IMAGE' ? 20 : ['TEXT', 'LINK'].includes(content.format) ? 0 : 1;
  if (media.length < minimum || media.length > maximum) errors.push(`This format requires ${minimum === maximum ? minimum : `${minimum}–${maximum}`} media item${maximum === 1 ? '' : 's'}.`);
  if (content.format === 'LINK' && !content.link) errors.push('This format requires a link.');
  if (!manual && content.link && !(provider === 'GOOGLE_BUSINESS' || content.format === 'LINK' || (provider === 'FACEBOOK' && content.format === 'TEXT'))) errors.push('This format does not attach a separate link through the pilot API. Put the URL in the approved caption or choose a link post.');
  if (!manual && content.event && !(provider === 'GOOGLE_BUSINESS' && content.format === 'EVENT')) errors.push('Event details apply only to Google event posts.');
  if (provider === 'LINKEDIN' && !/^urn:li:organization:\d+$/.test(destination.externalId)) errors.push('LinkedIn publishing requires a company Page organization URN; personal profiles are outside this pilot.');
  if (provider === 'GOOGLE_BUSINESS') {
    if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(destination.externalId)) errors.push('Select a discovered Google Business Profile location.');
    if (content.options?.googlePolicyAcknowledged !== true) errors.push('Provide a separate venue-focused Google version and acknowledge the alcohol-product policy.');
    if (content.options?.googleCallToAction && content.options.googleCallToAction !== 'CALL' && !content.link) errors.push('The selected Google action requires an HTTPS link.');
    if (content.format === 'EVENT') {
      if (!content.event?.title.trim() || !content.link) errors.push('A Google event requires a title, start/end time and a call-to-action link.');
      const start = Date.parse(content.event?.startAt ?? ''); const end = Date.parse(content.event?.endAt ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push('Event end time must follow its start time.');
    }
  }
  if (provider !== 'GOOGLE_BUSINESS' && (content.options?.googleCallToAction || content.options?.googlePolicyAcknowledged)) errors.push('Google options apply only to Google Business Profile.');
  if (!manual && content.options?.shareToFeed !== undefined && !(provider === 'INSTAGRAM' && content.format === 'REEL')) errors.push('Share to feed applies only to Instagram Reels.');
  if (!manual && content.options?.altText && !(content.format === 'IMAGE' || content.format === 'MULTI_IMAGE')) errors.push('Alt text is supported here for image posts only.');
  if (!manual && content.options?.altText && !['INSTAGRAM', 'LINKEDIN'].includes(provider)) errors.push('Alt text is not implemented for this platform; use native completion if required.');
  if (!manual && provider === 'INSTAGRAM' && content.format === 'STORY' && destination.metadata.accountType !== 'BUSINESS') errors.push('Instagram Stories require a verified Business account. Creator Story eligibility is not assumed.');
  if (!manual && provider === 'INSTAGRAM' && content.format === 'STORY' && (content.caption || content.link)) errors.push('Plain API Stories do not render a caption or link sticker. Put those elements in the finished media or choose manual completion.');
  for (const item of media) {
    if (!item.id || !/^[a-f0-9]{64}$/i.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || !Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width <= 0 || item.height <= 0) { errors.push('Media dimensions, immutable checksum and size must be verified before publication.'); continue; }
    const video = item.mimeType === 'video/mp4';
    const image = ['image/jpeg', 'image/png'].includes(item.mimeType);
    if (!image && !video) errors.push('Prepare this file as JPEG, PNG or finished MP4 video.');
    if (item.bytes > 200 * MB || item.width > 20000 || item.height > 20000) errors.push('Media exceeds the pilot’s 200 MiB / 20,000-pixel preparation limit.');
    if (video && (!Number.isFinite(item.durationSeconds) || (item.durationSeconds ?? 0) <= 0 || (item.durationSeconds ?? Infinity) > 3600)) errors.push('Verify a finished MP4 duration between 1 second and 60 minutes.');
    if (['IMAGE', 'MULTI_IMAGE'].includes(content.format) && !image) errors.push('This format accepts images only.');
    if (['VIDEO', 'REEL'].includes(content.format) && !video) errors.push('This format requires a finished MP4 video.');
    if (!manual && provider === 'GOOGLE_BUSINESS' && (!image || item.bytes > 5 * MB || item.width < 250 || item.height < 250)) errors.push('Google pilot posts require JPEG/PNG, at most 5 MiB, and at least 250 × 250 pixels. Local Post videos are not implemented.');
    if (!manual && provider === 'INSTAGRAM') {
      if (image && (item.mimeType !== 'image/jpeg' || item.bytes > 8 * MB || item.width < 320 || item.width > 1440)) errors.push('Prepare Instagram images as JPEG, at most 8 MiB, with width 320–1440 pixels (pilot limit).');
      const ratio = item.width / item.height;
      if (content.format !== 'STORY' && image && (ratio < 0.8 || ratio > 1.91)) errors.push('Instagram feed images need an aspect ratio from 4:5 through 1.91:1.');
      if (video && (item.bytes > 300 * MB || (item.durationSeconds ?? 0) < 3 || (item.durationSeconds ?? Infinity) > (content.format === 'STORY' ? 60 : 900))) errors.push('Prepare Instagram MP4 at most 300 MiB, 3–900 seconds (Stories at most 60 seconds).');
      if (video && (ratio < 0.5625 || ratio > 1.91)) errors.push('Instagram video aspect ratio must be from 9:16 through 1.91:1.');
      if (content.format === 'STORY' && Math.abs(ratio - 9 / 16) > 0.02) errors.push('Prepare plain Stories at 9:16.');
    }
    if (!manual && provider === 'LINKEDIN') {
      if (image && (item.bytes > 10 * MB || item.width * item.height >= 36152320)) errors.push('Prepare LinkedIn images below 10 MiB and 36,152,320 pixels.');
      if (video && (item.bytes < 75 * 1024 || item.bytes > 500 * MB || (item.durationSeconds ?? 0) < 3 || (item.durationSeconds ?? Infinity) > 1800)) errors.push('Prepare LinkedIn MP4 from 75 KiB to 500 MiB and 3 seconds to 30 minutes.');
    }
    if (!manual && provider === 'FACEBOOK') {
      if (image && item.bytes > 10 * MB) errors.push('Prepare Facebook photos at most 10 MiB (pilot limit).');
      if (video && (item.bytes > 300 * MB || !item.durationSeconds || item.durationSeconds > (content.format === 'REEL' ? 60 : 14400))) errors.push('Prepare Facebook MP4 at most 300 MiB; Reels at most 60 seconds, videos at most 4 hours (conservative pilot limits).');
      if (content.format === 'REEL' && (Math.abs(item.width / item.height - 9 / 16) > 0.02 || item.width < 540 || item.height < 960 || (item.durationSeconds ?? 0) < 4)) errors.push('Prepare a Facebook Reel at 9:16, at least 540 × 960 pixels and 4 seconds long (conservative official-sample limits).');
    }
  }
  return [...new Set(errors)];
}
