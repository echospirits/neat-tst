import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { getSocialProvider, validateContent } from '../lib/socialPublishing/providers';
import { buildOAuthAuthorizationUrl, getOAuthConfiguration } from '../lib/socialPublishing/providers/oauth';
import { googleEventSchedule } from '../lib/socialPublishing/providers/google';
import { discoverMeta } from '../lib/socialPublishing/providers/meta';
import { publishOperation, request } from '../lib/socialPublishing/providers/http';
import { SocialProviderError, type ExternalIds, type MediaVersion, type ProviderContext, type PublishContent, type SocialDestination } from '../lib/socialPublishing/types';

const image: MediaVersion = { id: 'media-immutable-1', fileName: 'venue.jpg', mimeType: 'image/jpeg', bytes: 400_000, width: 1080, height: 1080, sha256: 'a'.repeat(64) };
const video: MediaVersion = { ...image, id: 'video-1', mimeType: 'video/mp4', bytes: 1_000_000, width: 1080, height: 1920, durationSeconds: 20 };
const destination = (provider: SocialDestination['provider']): SocialDestination => ({ provider, externalId: provider === 'GOOGLE_BUSINESS' ? 'accounts/23/locations/45' : provider === 'LINKEDIN' ? 'urn:li:organization:123' : '12345', displayName: 'Fixture venue — no live account', metadata: { accountType: 'BUSINESS' } });
const content = (format: PublishContent['format'], media = [image]): PublishContent => ({ caption: 'Approved fixture copy', format, media });
const response = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
function context(provider: SocialDestination['provider'], post: PublishContent): ProviderContext & { checkpoints: ExternalIds[]; guards: number } {
  const ctx: ProviderContext & { checkpoints: ExternalIds[]; guards: number } = {
    destination: destination(provider), credentials: { accessToken: 'fixture-token-not-live', scopes: [] }, content: post, ids: {}, checkpoints: [], guards: 0,
    async getMediaUrl() { return 'https://neat.example.test/scoped-dispatch-media'; },
    async readMedia(item) { return new Uint8Array(item.bytes); },
    async checkpoint(ids) { ctx.checkpoints.push(structuredClone(ids)); ctx.ids = ids; },
    async assertCanPublish() { ctx.guards++; },
  };
  return ctx;
}

describe('Social provider fixture verification — never live evidence', () => {
  afterEach(() => { mock.restoreAll(); delete process.env.SOCIAL_META_APP_ID; delete process.env.SOCIAL_META_APP_SECRET; });

  it('validates representative implemented organic formats without confusing LinkedIn multi-image with ads carousels', () => {
    const cases: [SocialDestination['provider'], PublishContent][] = [
      ['INSTAGRAM', content('IMAGE')], ['INSTAGRAM', content('CAROUSEL', [image, { ...image, id: 'second' }])], ['INSTAGRAM', content('REEL', [video])], ['INSTAGRAM', { ...content('STORY', [video]), caption: '' }],
      ['FACEBOOK', content('IMAGE')], ['FACEBOOK', content('VIDEO', [video])], ['FACEBOOK', content('REEL', [video])], ['FACEBOOK', content('TEXT', [])], ['FACEBOOK', { ...content('LINK', []), link: 'https://example.test/event' }],
      ['GOOGLE_BUSINESS', { ...content('IMAGE'), options: { googlePolicyAcknowledged: true } }],
      ['GOOGLE_BUSINESS', { ...content('EVENT'), link: 'https://example.test/event', event: { title: 'Venue event', startAt: '2026-11-20T18:00:00-05:00', endAt: '2026-11-20T20:00:00-05:00' }, options: { googlePolicyAcknowledged: true } }],
      ['LINKEDIN', content('TEXT', [])], ['LINKEDIN', content('IMAGE')], ['LINKEDIN', content('MULTI_IMAGE', [image, { ...image, id: 'second' }])], ['LINKEDIN', content('VIDEO', [video])], ['LINKEDIN', { ...content('LINK', []), link: 'https://example.test/event' }],
    ];
    for (const [provider, post] of cases) assert.deepEqual(validateContent(destination(provider), post), [], `${provider}/${post.format}`);
    assert.ok(validateContent(destination('LINKEDIN'), content('CAROUSEL', [image, image])).some(error => error.includes('not supported')));
  });

  it('rejects missing immutable metadata, incompatible type/ratio/count and undocumented extras', () => {
    assert.ok(validateContent(destination('INSTAGRAM'), content('IMAGE', [{ ...image, sha256: '' }])).some(error => error.includes('checksum')));
    assert.ok(validateContent(destination('INSTAGRAM'), content('IMAGE', [{ ...image, mimeType: 'image/png' }])).some(error => error.includes('JPEG')));
    assert.ok(validateContent(destination('INSTAGRAM'), content('IMAGE', [{ ...image, height: 1920 }])).some(error => error.includes('aspect ratio')));
    assert.ok(validateContent(destination('INSTAGRAM'), content('CAROUSEL', [image])).some(error => error.includes('2–10')));
    const unsupported = { ...content('REEL', [video]), options: { musicId: 'not-verified' } } as unknown as PublishContent;
    assert.ok(validateContent(destination('INSTAGRAM'), unsupported).some(error => error.includes('unsupported')));
    assert.ok(validateContent(destination('LINKEDIN'), content('VIDEO', [{ ...video, durationSeconds: undefined }])).length);
  });

  it('does not silently discard requested links, event metadata or unsupported provider options', () => {
    assert.ok(validateContent(destination('INSTAGRAM'), { ...content('IMAGE'), link: 'https://example.test' }).some(error => error.includes('separate link')));
    assert.ok(validateContent(destination('FACEBOOK'), { ...content('IMAGE'), options: { altText: 'Required accessibility text' } }).some(error => error.includes('not implemented')));
    assert.ok(validateContent(destination('FACEBOOK'), { ...content('TEXT', []), options: { shareToFeed: true } }).some(error => error.includes('Reels')));
  });

  it('requires explicit Google policy acknowledgement and complete event details; rejects Local Post videos', () => {
    assert.ok(validateContent(destination('GOOGLE_BUSINESS'), content('IMAGE')).some(error => error.includes('venue-focused')));
    assert.ok(validateContent(destination('GOOGLE_BUSINESS'), { ...content('EVENT'), options: { googlePolicyAcknowledged: true } }).some(error => error.includes('Event end')));
    assert.ok(validateContent(destination('GOOGLE_BUSINESS'), { ...content('IMAGE', [video]), options: { googlePolicyAcknowledged: true } }).some(error => error.includes('videos are not implemented')));
  });

  it('requires discovered Business Story eligibility and prevents personal LinkedIn authors', () => {
    const creator = { ...destination('INSTAGRAM'), metadata: { accountType: 'MEDIA_CREATOR' } };
    assert.ok(validateContent(creator, { ...content('STORY', [video]), caption: '' }).some(error => error.includes('Business account')));
    assert.ok(validateContent({ ...destination('LINKEDIN'), externalId: 'urn:li:person:123' }, content('TEXT', [])).some(error => error.includes('personal profiles')));
  });

  it('allows explicit native Story caption/link instructions without assuming API eligibility, while retaining immutable media checks', () => {
    const unknown = { ...destination('INSTAGRAM'), metadata: { accountType: 'UNKNOWN' } };
    const story = { ...content('STORY', [{ ...image, mimeType: 'image/png', height: 1920 }]), caption: 'Copy this caption in the native app', link: 'https://example.test/venue', options: { manualInstructions: 'Add the approved music, location and link sticker in Instagram, then record the completed post link.' } } satisfies PublishContent;
    assert.deepEqual(validateContent(unknown, story), []);
    assert.ok(validateContent(unknown, { ...story, options: {} }).some(error => error.includes('Business account')));
    assert.ok(validateContent(unknown, { ...story, options: {} }).some(error => error.includes('caption or link')));
    assert.ok(validateContent(unknown, { ...story, media: [{ ...story.media[0], sha256: '' }] }).some(error => error.includes('checksum')));
    assert.ok(validateContent(unknown, { ...story, media: [{ ...story.media[0], bytes: 201 * 1024 * 1024 }] }).some(error => error.includes('preparation limit')));
    assert.ok(validateContent(unknown, { ...story, options: { ...story.options, musicId: 'unverified' } } as unknown as PublishContent).some(error => error.includes('unsupported')));
  });

  it('blocks an automatic public request for an explicitly manual revision even when called directly', async () => {
    const ctx = context('FACEBOOK', { ...content('TEXT', []), options: { manualInstructions: 'Finish this in Facebook and confirm manually.' } });
    let requests = 0;
    mock.method(globalThis, 'fetch', async () => { requests++; return response({ id: 'must-not-send' }); });
    await assert.rejects(getSocialProvider('FACEBOOK').publish(ctx, { ids: {}, ready: true }), (error: unknown) => error instanceof SocialProviderError && error.code === 'manual_completion_required');
    assert.equal(requests, 0); assert.equal(ctx.ids.publicationStarted, undefined);
  });

  it('converts Google event UTC timestamps into America/New_York business-local dates across DST', () => {
    const summer = googleEventSchedule({ title: 'Venue', startAt: '2026-07-01T22:00:00Z', endAt: '2026-07-02T00:00:00Z' });
    const winter = googleEventSchedule({ title: 'Venue', startAt: '2026-12-01T23:00:00Z', endAt: '2026-12-02T01:00:00Z' });
    assert.equal(summer.startTime.hours, 18); assert.equal(winter.startTime.hours, 18);
    assert.equal(summer.endDate.day, 1); assert.equal(winter.endDate.day, 1);
  });

  it('derives shared Meta callback and requests company publishing scopes without member-sharing substitution', () => {
    process.env.SOCIAL_META_APP_ID = 'fixture-app-id'; process.env.SOCIAL_META_APP_SECRET = 'fixture-app-secret';
    const config = getOAuthConfiguration('INSTAGRAM', 'https://neat.example.test');
    assert.equal(config.callbackUrl, 'https://neat.example.test/api/social/oauth/meta/callback');
    const url = new URL(buildOAuthAuthorizationUrl('FACEBOOK', { state: 'opaque-server-state', redirectUri: config.callbackUrl }));
    assert.ok(url.searchParams.get('scope')?.includes('instagram_content_publish'));
    assert.ok(url.searchParams.get('scope')?.includes('pages_manage_posts'));
    assert.equal(url.searchParams.get('client_secret'), null);
  });

  it('discovers independent Instagram/Page identities, preserves linked Page and keeps destination tokens server-side', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL | Request) => String(url).includes('me/accounts') ? response({ data: [{ id: 'page-fixture', name: 'Venue Page', access_token: 'fixture-page-token', instagram_business_account: { id: 'ig-fixture', username: 'venuefixture' } }] }) : response({ account_type: 'BUSINESS' }));
    const found = await discoverMeta({ accessToken: 'fixture-user-token', scopes: ['pages_manage_posts'] });
    assert.equal(found.length, 2); assert.equal(found[0].provider, 'FACEBOOK'); assert.equal(found[1].provider, 'INSTAGRAM');
    assert.equal(found[1].metadata.pageId, 'page-fixture'); assert.equal(found[1].credentials?.accessToken, 'fixture-page-token');
    assert.equal(JSON.stringify(found[1].metadata).includes('fixture-page-token'), false);
  });

  it('can discover Facebook Pages even when Instagram permission/discovery is unavailable', async () => {
    mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      if (String(url).includes('instagram_business_account')) return response({ error: { code: 200 } }, { status: 403 });
      return response({ data: [{ id: 'page-fixture', name: 'Fixture Page', access_token: 'fixture-page-token' }] });
    });
    const credentials = { accessToken: 'fixture-user-token', scopes: ['pages_show_list'] };
    assert.equal((await getSocialProvider('FACEBOOK').discover(credentials))[0].externalId, 'page-fixture');
    await assert.rejects(getSocialProvider('INSTAGRAM').discover(credentials), (error: unknown) => error instanceof SocialProviderError && error.kind === 'AUTHORIZATION');
  });

  it('persists Instagram container before waiting for processing and publishes only after guard recheck', async () => {
    const ctx = context('INSTAGRAM', content('IMAGE')); const calls: string[] = [];
    mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const text = String(url); calls.push(text);
      if (text.endsWith('/media_publish')) { assert.ok(ctx.ids.containerId); assert.equal(ctx.ids.publicationStarted, true); assert.ok(ctx.guards >= 2); return response({ id: 'post-fixture' }); }
      if (init?.method === 'POST') return response({ id: 'container-fixture' });
      if (text.includes('container-fixture')) return response({ status_code: 'FINISHED' });
      return response({ id: 'post-fixture', permalink: 'https://instagram.example.test/p/fixture' });
    });
    const adapter = getSocialProvider('INSTAGRAM');
    const prepared = await adapter.prepare(ctx);
    assert.equal(prepared.ready, true); assert.equal(ctx.checkpoints[0].containerId, 'container-fixture');
    const outcome = await adapter.publish(ctx, prepared);
    assert.equal(outcome.status, 'PUBLISHED'); assert.equal(outcome.confirmed, true);
    assert.equal(calls.filter(url => url.endsWith('/media_publish')).length, 1);
    await adapter.publish(ctx, prepared);
    assert.equal(calls.filter(url => url.endsWith('/media_publish')).length, 1);
  });

  it('never retries an ambiguous Instagram publication; reconciliation uses its existing container', async () => {
    const ctx = context('INSTAGRAM', content('IMAGE')); ctx.ids = { containerId: 'container-fixture' }; let writes = 0;
    mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => { if (init?.method === 'POST') { writes++; throw new Error('socket ended'); } return response({ status_code: 'FINISHED' }); });
    const adapter = getSocialProvider('INSTAGRAM');
    await assert.rejects(adapter.publish(ctx, { ids: ctx.ids, ready: true }), (error: unknown) => error instanceof SocialProviderError && error.kind === 'AMBIGUOUS');
    assert.equal(ctx.ids.publicationStarted, true);
    const check = await adapter.publish(ctx, { ids: ctx.ids, ready: true });
    assert.equal(check.status, 'NEEDS_ATTENTION'); assert.equal(writes, 1);
  });

  it('prevents a canceled/revised job sending after media preparation', async () => {
    const ctx = context('INSTAGRAM', content('IMAGE')); ctx.ids = { containerId: 'container-fixture' }; let writes = 0;
    ctx.assertCanPublish = async () => { throw new Error('approval invalidated'); };
    mock.method(globalThis, 'fetch', async () => { writes++; return response({ id: 'must-not-send' }); });
    await assert.rejects(getSocialProvider('INSTAGRAM').publish(ctx, { ids: ctx.ids, ready: true }), /approval invalidated/);
    assert.equal(writes, 0);
  });

  it('builds Google photo/event payload with CTA and treats moderation as processing until LIVE', async () => {
    const ctx = context('GOOGLE_BUSINESS', { ...content('EVENT'), link: 'https://example.test/venue-event', event: { title: 'Venue gathering', startAt: '2026-12-01T23:00:00Z', endAt: '2026-12-02T01:00:00Z' }, options: { googlePolicyAcknowledged: true } });
    let payload: Record<string, unknown> = {};
    mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') { payload = JSON.parse(String(init.body)); assert.equal(ctx.ids.publicationStarted, true); return response({ name: 'accounts/23/locations/45/localPosts/fixture' }); }
      return response({ state: 'PROCESSING' });
    });
    const adapter = getSocialProvider('GOOGLE_BUSINESS');
    const outcome = await adapter.publish(ctx, await adapter.prepare(ctx));
    assert.equal(outcome.status, 'PROCESSING'); assert.equal(outcome.confirmed, false);
    assert.equal(payload.topicType, 'EVENT'); assert.deepEqual(payload.callToAction, { actionType: 'LEARN_MORE', url: ctx.content.link });
    assert.deepEqual(payload.media, [{ mediaFormat: 'PHOTO', sourceUrl: 'https://neat.example.test/scoped-dispatch-media' }]);
  });

  it('publishes LinkedIn organic multiImage with company author and captures the response-header URN', async () => {
    const ctx = context('LINKEDIN', content('MULTI_IMAGE', [image, { ...image, id: 'second' }])); ctx.ids = { mediaIds: ['urn:li:image:one', 'urn:li:image:two'], uploadComplete: true };
    let payload: Record<string, unknown> = {};
    mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') { payload = JSON.parse(String(init.body)); return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:fixture' } }); }
      return response({ author: 'urn:li:organization:123', lifecycleState: 'PUBLISHED' });
    });
    const outcome = await getSocialProvider('LINKEDIN').publish(ctx, { ids: ctx.ids, ready: true });
    assert.equal(payload.author, 'urn:li:organization:123'); assert.ok((payload.content as { multiImage?: unknown }).multiImage);
    assert.equal(outcome.ids.postId, 'urn:li:share:fixture'); assert.equal(outcome.status, 'PUBLISHED');
    assert.equal(JSON.stringify(payload).includes('carousel'), false);
  });

  it('uploads LinkedIn video parts, finalizes an empty successful response and waits for asset availability', async () => {
    const ctx = context('LINKEDIN', content('VIDEO', [video])); let finalized = false; const steps: string[] = [];
    mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const address = String(url);
      if (address.includes('initializeUpload')) { steps.push('initialize'); return response({ value: { video: 'urn:li:video:fixture', uploadToken: 'fixture-upload', uploadInstructions: [{ firstByte: 0, lastByte: video.bytes - 1, uploadUrl: 'https://www.linkedin.com/dms-uploads/fixture' }] } }); }
      if (init?.method === 'PUT') { steps.push('upload'); assert.equal(ctx.ids.mediaIds?.[0], 'urn:li:video:fixture'); return new Response('', { status: 201, headers: { etag: 'fixture-part' } }); }
      if (address.includes('finalizeUpload')) { steps.push('finalize'); finalized = true; assert.deepEqual(JSON.parse(String(init?.body)).finalizeUploadRequest.uploadedPartIds, ['fixture-part']); return new Response(null, { status: 200 }); }
      assert.equal(finalized, true); return response({ status: 'PROCESSING' });
    });
    const result = await getSocialProvider('LINKEDIN').prepare(ctx);
    assert.deepEqual(steps, ['initialize', 'upload', 'finalize']); assert.equal(result.ready, false); assert.equal(ctx.ids.uploadComplete, true);
    assert.equal(ctx.ids.publicationStarted, undefined);
  });

  it('uploads and finishes a Facebook Reel without treating video readiness or a finish acknowledgement as public evidence', async () => {
    const ctx = context('FACEBOOK', content('REEL', [video])); let phase = 'ready'; let finishes = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const address = String(url);
      if (address.includes('rupload.facebook.com')) { assert.equal(ctx.ids.containerId, 'reel-fixture'); return response({ success: true }); }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.upload_phase === 'start') return response({ video_id: 'reel-fixture', upload_url: 'https://rupload.facebook.com/video-upload/fixture' });
        assert.equal(body.video_state, 'PUBLISHED'); assert.equal(ctx.ids.publicationStarted, true); finishes++; return response({ success: true });
      }
      return response({ id: 'reel-fixture', status: { video_status: 'ready', publishing_phase: phase === 'ready' ? { status: 'in_progress' } : { status: 'complete', publish_status: 'published' } } });
    });
    const adapter = getSocialProvider('FACEBOOK'); const prepared = await adapter.prepare(ctx);
    const accepted = await adapter.publish(ctx, prepared);
    assert.equal(accepted.status, 'PROCESSING'); assert.equal(finishes, 1);
    phase = 'published'; const checked = await adapter.check(ctx, ctx.ids);
    assert.equal(checked.status, 'PUBLISHED'); assert.equal(checked.confirmed, true); assert.equal(finishes, 1);
  });

  it('distinguishes revoked credentials, definite rate limits and uncertain public writes without exposing provider bodies', async () => {
    for (const [status, kind] of [[401, 'AUTHORIZATION'], [429, 'TRANSIENT'], [503, 'AMBIGUOUS']] as const) {
      mock.method(globalThis, 'fetch', async () => response({ error: { message: 'sensitive fixture-token' } }, { status, headers: { 'retry-after': '8' } }));
      await assert.rejects(request('https://provider.example.test', { method: 'POST' }, true), (error: unknown) => error instanceof SocialProviderError && error.kind === kind && !error.message.includes('fixture-token') && (status !== 429 || error.retryAfterSeconds === 8));
      mock.restoreAll();
    }
  });

  it('classifies definite HTTP400 Graph throttle/permission codes without retrying ambiguous upstream writes or unknown subcodes', async () => {
    const cases: [number, number, number | undefined, boolean | undefined, SocialProviderError['kind']][] = [
      ...[4, 17, 32, 341, 613].map(code => [400, code, undefined, undefined, 'TRANSIENT'] as [number, number, undefined, undefined, 'TRANSIENT']),
      ...[10, 190, 200, 299].map(code => [400, code, undefined, undefined, 'AUTHORIZATION'] as [number, number, undefined, undefined, 'AUTHORIZATION']),
      [400, 1, undefined, undefined, 'AMBIGUOUS'], [400, 2, undefined, undefined, 'AMBIGUOUS'], [400, 987, undefined, true, 'AMBIGUOUS'],
      [503, 4, undefined, undefined, 'AMBIGUOUS'], [400, 4, 2207051, undefined, 'CONTENT'], [429, 4, 2207051, undefined, 'CONTENT'],
    ];
    for (const [status, code, subcode, transient, expected] of cases) {
      const ctx = context('FACEBOOK', content('TEXT', []));
      mock.method(globalThis, 'fetch', async () => response({ error: { code, error_subcode: subcode, is_transient: transient, message: 'fixture-secret-must-not-leak' } }, { status, headers: { 'retry-after': '120' } }));
      await assert.rejects(publishOperation(ctx, () => request('https://graph.facebook.com/v26.0/page/feed', { method: 'POST' }, true)), (error: unknown) => error instanceof SocialProviderError && error.kind === expected && !error.message.includes('fixture-secret') && (expected !== 'TRANSIENT' || error.retryAfterSeconds === 120));
      assert.equal(ctx.ids.publicationStarted, expected === 'AMBIGUOUS', `${status}/${code}/${subcode}`);
      mock.restoreAll();
    }
    // A numeric code on a different provider must not acquire Graph semantics.
    mock.method(globalThis, 'fetch', async () => response({ error: { code: 4 } }, { status: 400 }));
    await assert.rejects(request('https://api.linkedin.com/rest/posts', { method: 'POST' }, true), (error: unknown) => error instanceof SocialProviderError && error.kind === 'CONTENT');
  });
});
