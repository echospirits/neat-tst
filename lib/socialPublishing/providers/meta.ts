import { SocialProviderError, type DiscoveredDestination, type ExternalIds, type PreparedMedia, type ProviderContext, type ProviderOutcome, type SocialCredentials, type SocialProviderAdapter } from '../types';
import { checkpoint, jsonRequest, list, object, publishOperation, request, requiredString, string, uploadUrl } from './http';
import { META_GRAPH_VERSION } from './oauth';
import { validateContent } from './validation';

const root = () => {
  if (!/^v\d+\.\d+$/.test(META_GRAPH_VERSION)) throw new SocialProviderError('Configure a supported Meta Graph API version.', 'CONFIGURATION', 'invalid_api_version');
  return `https://graph.facebook.com/${META_GRAPH_VERSION}`;
};
async function graph(credentials: SocialCredentials, path: string, values?: Record<string, unknown>, irreversible = false) {
  return jsonRequest(`${root()}/${path}`, { headers: { authorization: `Bearer ${credentials.accessToken}`, ...(values ? { 'content-type': 'application/json' } : {}) }, ...(values ? { method: 'POST', body: JSON.stringify(values) } : {}) }, irreversible);
}
export async function discoverMeta(credentials: SocialCredentials, selectedProvider?: 'FACEBOOK' | 'INSTAGRAM'): Promise<DiscoveredDestination[]> {
  const destinations: DiscoveredDestination[] = [];
  let after = '';
  for (let page = 0; page < 50; page++) {
    const fields = `id,name,access_token,tasks,picture${selectedProvider === 'FACEBOOK' ? '' : ',instagram_business_account{id,username,name,profile_picture_url}'}`;
    const result = await graph(credentials, `me/accounts?fields=${fields}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    for (const item of list(result.data).map(object)) {
      const id = requiredString(item.id, 'a Page ID');
      const pageCredentials = { ...credentials, accessToken: requiredString(item.access_token, 'a Page access token') };
      if (selectedProvider !== 'INSTAGRAM') destinations.push({ provider: 'FACEBOOK', externalId: id, displayName: string(item.name) || id, profileImageUrl: string(object(object(item.picture).data).url) || undefined, metadata: { pageId: id, tasks: list(item.tasks), loginRoute: 'FACEBOOK_LOGIN', apiVersion: META_GRAPH_VERSION }, credentials: pageCredentials });
      const ig = object(item.instagram_business_account);
      if (selectedProvider !== 'FACEBOOK' && ig.id) {
        // Page linkage is discovered, never inferred from a brand label.
        let accountType = 'UNKNOWN';
        try { accountType = string((await graph(pageCredentials, `${encodeURIComponent(string(ig.id))}?fields=account_type`)).account_type) || 'UNKNOWN'; } catch (error) { if (!(error instanceof SocialProviderError) || error.kind !== 'CONTENT') throw error; }
        destinations.push({ provider: 'INSTAGRAM', externalId: string(ig.id), displayName: string(ig.name) || string(ig.username) || string(ig.id), handle: string(ig.username) || undefined, profileImageUrl: string(ig.profile_picture_url) || undefined, metadata: { pageId: id, accountType, loginRoute: 'FACEBOOK_LOGIN', apiVersion: META_GRAPH_VERSION }, credentials: pageCredentials });
      }
    }
    const paging = object(result.paging);
    if (!paging.next) return destinations;
    after = string(object(paging.cursors).after);
    if (!after) throw new SocialProviderError('The account list is incomplete; retry discovery.', 'TRANSIENT', 'incomplete_discovery');
  }
  throw new SocialProviderError('Too many account pages for the pilot. Narrow the application account assignment.', 'CONTENT', 'discovery_limit');
}
async function containerState(context: ProviderContext, id: string) {
  const state = await graph(context.credentials, `${encodeURIComponent(id)}?fields=status_code,status`);
  return { ready: state.status_code === 'FINISHED', published: state.status_code === 'PUBLISHED', rejected: ['ERROR', 'EXPIRED'].includes(string(state.status_code)) ? 'Instagram rejected or expired this media container. Prepare a new reviewed attempt.' : undefined };
}
async function prepareInstagram(context: ProviderContext): Promise<PreparedMedia> {
  if (context.ids.containerId) return { ids: context.ids, ...await containerState(context, context.ids.containerId) };
  const { content } = context;
  const target = `${encodeURIComponent(context.destination.externalId)}/media`;
  const childIds = [...(context.ids.mediaIds ?? [])];
  if (content.format === 'CAROUSEL') {
    for (let index = childIds.length; index < content.media.length; index++) {
      await context.assertCanPublish();
      const media = content.media[index];
      const url = await context.getMediaUrl(media);
      const video = media.mimeType.startsWith('video/');
      const result = await graph(context.credentials, target, { is_carousel_item: true, ...(video ? { media_type: 'VIDEO', video_url: url } : { image_url: url }) });
      childIds.push(requiredString(result.id, 'an Instagram carousel child ID'));
      await checkpoint(context, { mediaIds: [...childIds] });
    }
    for (const childId of childIds) {
      const state = await containerState(context, childId);
      if (!state.ready) return { ids: context.ids, ready: false, rejected: state.rejected };
    }
    const result = await graph(context.credentials, target, { media_type: 'CAROUSEL', children: childIds, caption: content.caption });
    await checkpoint(context, { containerId: requiredString(result.id, 'an Instagram container ID') });
  } else {
    await context.assertCanPublish();
    const media = content.media[0];
    const url = await context.getMediaUrl(media);
    const video = media.mimeType.startsWith('video/');
    const result = await graph(context.credentials, target, { ...(video ? { video_url: url } : { image_url: url }), ...(content.format === 'STORY' ? { media_type: 'STORIES' } : { caption: content.caption }), ...(content.format === 'REEL' ? { media_type: 'REELS', share_to_feed: content.options?.shareToFeed ?? true } : {}), ...(content.options?.altText ? { alt_text: content.options.altText } : {}) });
    await checkpoint(context, { containerId: requiredString(result.id, 'an Instagram container ID') });
  }
  return { ids: context.ids, ...await containerState(context, context.ids.containerId!) };
}
async function checkInstagram(context: ProviderContext, ids: ExternalIds): Promise<ProviderOutcome> {
  if (ids.postId) {
    const post = await graph(context.credentials, `${encodeURIComponent(ids.postId)}?fields=id,permalink`);
    return { status: 'PUBLISHED', ids, postUrl: string(post.permalink) || undefined, confirmed: Boolean(post.id), detail: 'Instagram media readback succeeded; inspect the actual rendering in the live-test runbook.' };
  }
  if (ids.containerId) {
    const state = await containerState(context, ids.containerId);
    if (state.published) return { status: 'PUBLISHED', ids, confirmed: true, detail: 'Instagram reports the persisted container was published. No second publish request was sent.' };
    if (state.rejected) return { status: 'REJECTED', ids, detail: state.rejected };
    if (ids.publicationStarted) return { status: 'NEEDS_ATTENTION', ids, detail: 'A publish request started without a returned media ID. The container does not confirm publication; inspect Instagram before deciding to retry.' };
    return { status: 'PROCESSING', ids };
  }
  return { status: 'NEEDS_ATTENTION', ids, detail: 'No remote identifier is available to establish the outcome.' };
}
export const instagramProvider: SocialProviderAdapter = {
  provider: 'INSTAGRAM', discover: async credentials => discoverMeta(credentials, 'INSTAGRAM'), validate: validateContent, prepare: prepareInstagram,
  async publish(context, prepared) {
    if (!prepared.ready || !prepared.ids.containerId) return { status: 'PROCESSING', ids: prepared.ids };
    if (context.ids.publicationStarted) return checkInstagram(context, context.ids);
    const result = await publishOperation(context, () => graph(context.credentials, `${encodeURIComponent(context.destination.externalId)}/media_publish`, { creation_id: prepared.ids.containerId }, true));
    await checkpoint(context, { postId: requiredString(result.id, 'a published Instagram media ID') });
    return checkInstagram(context, context.ids);
  },
  check: checkInstagram,
};

async function checkFacebook(context: ProviderContext, ids: ExternalIds): Promise<ProviderOutcome> {
  if (!ids.postId) return { status: 'NEEDS_ATTENTION', ids, detail: 'Facebook did not return a post ID. Inspect the Page before retrying; no duplicate was created.' };
  if (['VIDEO', 'REEL'].includes(context.content.format)) {
    const result = await graph(context.credentials, `${encodeURIComponent(ids.postId)}?fields=id,status,permalink_url`);
    const status = object(result.status);
    const publishing = object(status.publishing_phase);
    if (status.video_status === 'error' || publishing.status === 'error') return { status: 'REJECTED', ids, detail: 'Facebook rejected the video during processing.' };
    if (status.video_status === 'ready' && publishing.status === 'complete' && (!publishing.publish_status || publishing.publish_status === 'published')) return { status: 'PUBLISHED', ids, postUrl: string(result.permalink_url) || undefined, confirmed: true };
    return { status: 'PROCESSING', ids, detail: 'Facebook accepted the video; processing/publication is not yet confirmed.' };
  }
  const result = await graph(context.credentials, `${encodeURIComponent(ids.postId)}?fields=id,permalink_url,is_published`);
  return { status: result.is_published === true ? 'PUBLISHED' : 'ACCEPTED', ids, postUrl: string(result.permalink_url) || undefined, confirmed: result.is_published === true };
}
export const facebookProvider: SocialProviderAdapter = {
  provider: 'FACEBOOK', discover: async credentials => discoverMeta(credentials, 'FACEBOOK'), validate: validateContent,
  async prepare(context) {
    if (context.content.format !== 'REEL') return { ids: context.ids, ready: true };
    if (!context.ids.containerId) {
      await context.assertCanPublish();
      const start = await graph(context.credentials, `${encodeURIComponent(context.destination.externalId)}/video_reels`, { upload_phase: 'start' });
      const videoId = requiredString(start.video_id, 'a Reel video ID');
      await checkpoint(context, { containerId: videoId });
      const mediaUrl = await context.getMediaUrl(context.content.media[0]);
      await request(uploadUrl(start.upload_url), { method: 'POST', headers: { authorization: `OAuth ${context.credentials.accessToken}`, file_url: mediaUrl } });
      await checkpoint(context, { uploadComplete: true });
    }
    if (!context.ids.uploadComplete) return { ids: context.ids, ready: false, rejected: 'A Reel upload was interrupted before completion. Review the existing upload before starting a replacement attempt.' };
    return { ids: context.ids, ready: true };
  },
  async publish(context, prepared) {
    if (context.ids.publicationStarted) return checkFacebook(context, context.ids);
    const content = context.content; const target = encodeURIComponent(context.destination.externalId);
    let result: Record<string, unknown>;
    if (content.format === 'REEL') {
      result = await publishOperation(context, () => graph(context.credentials, `${target}/video_reels`, { upload_phase: 'finish', video_id: prepared.ids.containerId, video_state: 'PUBLISHED', description: content.caption }, true));
      if (result.success !== true) throw new SocialProviderError('Facebook did not confirm Reel submission. Review the existing video ID.', 'AMBIGUOUS', 'reel_submission_uncertain');
      await checkpoint(context, { postId: prepared.ids.containerId });
    } else if (content.format === 'VIDEO') {
      result = await publishOperation(context, async () => graph(context.credentials, `${target}/videos`, { file_url: await context.getMediaUrl(content.media[0]), description: content.caption, published: true }, true));
      await checkpoint(context, { postId: requiredString(result.id, 'a Facebook video ID') });
    } else if (content.format === 'IMAGE') {
      result = await publishOperation(context, async () => graph(context.credentials, `${target}/photos`, { url: await context.getMediaUrl(content.media[0]), caption: content.caption, published: true }, true));
      await checkpoint(context, { postId: requiredString(result.post_id, 'a Facebook photo post ID'), mediaIds: string(result.id) ? [string(result.id)] : [] });
    } else {
      result = await publishOperation(context, () => graph(context.credentials, `${target}/feed`, { message: content.caption, ...(content.link ? { link: content.link } : {}) }, true));
      await checkpoint(context, { postId: requiredString(result.id, 'a Facebook post ID') });
    }
    return checkFacebook(context, context.ids);
  }, check: checkFacebook,
};
