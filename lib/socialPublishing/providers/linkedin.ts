import { SocialProviderError, type DiscoveredDestination, type ExternalIds, type PreparedMedia, type ProviderContext, type ProviderOutcome, type SocialCredentials, type SocialProviderAdapter } from '../types';
import { checkpoint, jsonRequest, list, object, publishOperation, request, requiredString, string, uploadUrl } from './http';
import { LINKEDIN_VERSION } from './oauth';
import { validateContent } from './validation';

function headers(credentials: SocialCredentials) {
  if (!/^20\d{4}$/.test(LINKEDIN_VERSION)) throw new SocialProviderError('Configure a supported LinkedIn monthly API version.', 'CONFIGURATION', 'invalid_api_version');
  return { authorization: `Bearer ${credentials.accessToken}`, 'Linkedin-Version': LINKEDIN_VERSION, 'X-Restli-Protocol-Version': '2.0.0', 'content-type': 'application/json' };
}
async function api(credentials: SocialCredentials, path: string, body?: unknown) { return jsonRequest(`https://api.linkedin.com/rest/${path}`, { headers: headers(credentials), ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }); }
function organization(context: ProviderContext) {
  if (!/^urn:li:organization:\d+$/.test(context.destination.externalId)) throw new SocialProviderError('Select a company Page organization URN. Personal-profile publishing is outside this pilot.', 'CONTENT', 'organization_required');
  return context.destination.externalId;
}
async function checkAssets(context: ProviderContext): Promise<PreparedMedia> {
  for (const mediaId of context.ids.mediaIds ?? []) {
    const kind = mediaId.startsWith('urn:li:video:') ? 'videos' : 'images';
    const asset = await api(context.credentials, `${kind}/${encodeURIComponent(mediaId)}`);
    if (asset.status === 'PROCESSING_FAILED') return { ids: context.ids, ready: false, rejected: 'LinkedIn rejected the uploaded media. Prepare the file and submit a revised post.' };
    if (asset.status !== 'AVAILABLE') return { ids: context.ids, ready: false };
  }
  return { ids: context.ids, ready: true };
}
async function prepareLinkedIn(context: ProviderContext): Promise<PreparedMedia> {
  const owner = organization(context);
  if (context.ids.uploadComplete) return checkAssets(context);
  const content = context.content;
  const mediaIds = [...(context.ids.mediaIds ?? [])];
  if (content.format === 'VIDEO') {
    if (mediaIds.length) return { ids: context.ids, ready: false, rejected: 'Video upload was interrupted. Review the retained LinkedIn media ID before preparing a replacement attempt.' };
    await context.assertCanPublish();
    const media = content.media[0];
    const initialized = object((await api(context.credentials, 'videos?action=initializeUpload', { initializeUploadRequest: { owner, fileSizeBytes: media.bytes, uploadCaptions: false, uploadThumbnail: false } })).value);
    mediaIds.push(requiredString(initialized.video, 'a LinkedIn video URN'));
    await checkpoint(context, { mediaIds: [...mediaIds] });
    const bytes = await context.readMedia(media);
    const partIds: string[] = [];
    for (const part of list(initialized.uploadInstructions).map(object)) {
      if (typeof part.firstByte !== 'number' || typeof part.lastByte !== 'number' || part.firstByte < 0 || part.lastByte < part.firstByte || part.lastByte >= bytes.length) throw new SocialProviderError('LinkedIn returned an invalid video upload range.', 'CONTENT', 'invalid_upload_range');
      const response = await request(uploadUrl(part.uploadUrl), { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes.slice(part.firstByte, part.lastByte + 1) as BodyInit });
      partIds.push(requiredString(response.headers.get('etag'), 'an uploaded video-part ETag'));
    }
    if (!partIds.length) throw new SocialProviderError('LinkedIn did not provide video upload instructions.', 'CONTENT', 'missing_upload_parts');
    await request('https://api.linkedin.com/rest/videos?action=finalizeUpload', { method: 'POST', headers: headers(context.credentials), body: JSON.stringify({ finalizeUploadRequest: { video: mediaIds[0], uploadToken: string(initialized.uploadToken), uploadedPartIds: partIds } }) });
  } else {
    for (let index = mediaIds.length; index < content.media.length; index++) {
      await context.assertCanPublish();
      const initialized = object((await api(context.credentials, 'images?action=initializeUpload', { initializeUploadRequest: { owner } })).value);
      const mediaId = requiredString(initialized.image, 'a LinkedIn image URN');
      // Persist before uploading; an interrupted upload is reviewable, never assumed complete.
      mediaIds.push(mediaId);
      await checkpoint(context, { mediaIds: [...mediaIds] });
      const bytes = await context.readMedia(content.media[index]);
      await request(uploadUrl(initialized.uploadUrl), { method: 'PUT', headers: { authorization: `Bearer ${context.credentials.accessToken}`, 'content-type': content.media[index].mimeType }, body: bytes as BodyInit });
    }
  }
  await checkpoint(context, { mediaIds, uploadComplete: true });
  return checkAssets(context);
}
async function checkLinkedIn(context: ProviderContext, ids: ExternalIds): Promise<ProviderOutcome> {
  if (!ids.postId) return { status: 'NEEDS_ATTENTION', ids, detail: 'LinkedIn did not return a post URN. Inspect the company Page before retrying.' };
  const post = await api(context.credentials, `posts/${encodeURIComponent(ids.postId)}`);
  if (post.author !== organization(context)) throw new SocialProviderError('LinkedIn post author differs from the selected company Page.', 'CONTENT', 'post_destination_mismatch');
  return { status: post.lifecycleState === 'PUBLISHED' ? 'PUBLISHED' : post.lifecycleState === 'PUBLISH_REQUESTED' ? 'PROCESSING' : 'REJECTED', ids, confirmed: post.lifecycleState === 'PUBLISHED', postUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(ids.postId)}/`, detail: post.lifecycleState === 'PUBLISHED' ? 'LinkedIn reports PUBLISHED for the company Page. Human inspection remains separate.' : 'LinkedIn has not confirmed a published company Page post.' };
}
export const linkedinProvider: SocialProviderAdapter = {
  provider: 'LINKEDIN', validate: validateContent,
  async discover(credentials) {
    const destinations = new Map<string, DiscoveredDestination>();
    for (let page = 0; page < 50; page++) {
      const result = await api(credentials, `organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=${page * 100}`);
      const elements = list(result.elements).map(object);
      for (const acl of elements) {
        if (acl.state !== 'APPROVED' || !['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR'].includes(string(acl.role))) continue;
        const urn = string(acl.organization);
        if (!/^urn:li:organization:\d+$/.test(urn) || destinations.has(urn)) continue;
        const company = await api(credentials, `organizations/${encodeURIComponent(urn.split(':')[3])}`);
        destinations.set(urn, { provider: 'LINKEDIN', externalId: urn, displayName: string(company.localizedName) || urn, handle: string(company.vanityName) || undefined, metadata: { role: acl.role, accessTier: process.env.SOCIAL_LINKEDIN_ACCESS_STATUS ?? 'PENDING', apiVersion: LINKEDIN_VERSION, loginRoute: 'LINKEDIN_3LEGGED_OAUTH' } });
      }
      if (elements.length < 100 || !list(object(result.paging).links).some(item => object(item).rel === 'next')) return [...destinations.values()];
    }
    throw new SocialProviderError('The LinkedIn account list exceeds the pilot discovery limit.', 'CONTENT', 'discovery_limit');
  }, prepare: prepareLinkedIn,
  async publish(context, prepared) {
    if (context.ids.publicationStarted) return checkLinkedIn(context, context.ids);
    if (!prepared.ready) return { status: 'PROCESSING', ids: prepared.ids };
    const owner = organization(context); const content = context.content;
    const mediaIds = prepared.ids.mediaIds ?? [];
    const postContent = content.format === 'MULTI_IMAGE' ? { multiImage: { images: mediaIds.map(id => ({ id, ...(content.options?.altText ? { altText: content.options.altText } : {}) })) } } : ['IMAGE', 'VIDEO'].includes(content.format) ? { media: { id: mediaIds[0], ...(content.options?.altText ? { altText: content.options.altText } : {}) } } : content.format === 'LINK' ? { article: { source: content.link, title: content.caption.slice(0, 200) || 'Link' } } : undefined;
    const response = await publishOperation(context, () => request('https://api.linkedin.com/rest/posts', { method: 'POST', headers: headers(context.credentials), body: JSON.stringify({ author: owner, commentary: content.caption, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false, ...(postContent ? { content: postContent } : {}) }) }, true));
    await checkpoint(context, { postId: requiredString(response.headers.get('x-restli-id'), 'a LinkedIn post URN') });
    return checkLinkedIn(context, context.ids);
  }, check: checkLinkedIn,
};
