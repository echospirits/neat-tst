import { SocialProviderError, type DiscoveredDestination, type ExternalIds, type ProviderContext, type ProviderOutcome, type SocialCredentials, type SocialProviderAdapter } from '../types';
import { checkpoint, jsonRequest, list, object, publishOperation, requiredString, string } from './http';
import { validateContent } from './validation';

function headers(credentials: SocialCredentials) { return { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' }; }
async function pages(url: string, credentials: SocialCredentials, field: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = []; let pageToken = '';
  for (let count = 0; count < 50; count++) {
    const result = await jsonRequest(`${url}${pageToken ? `${url.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers: headers(credentials) });
    items.push(...list(result[field]).map(object));
    pageToken = string(result.nextPageToken);
    if (!pageToken) return items;
  }
  throw new SocialProviderError('The Google discovery list exceeds the pilot page limit. Narrow the authorized account assignment.', 'CONTENT', 'discovery_limit');
}
/** Local Posts event schedules use business-local wall time, not UTC date fields. */
export function googleEventSchedule(event: NonNullable<ProviderContext['content']['event']>, timeZone = 'America/New_York') {
  const parts = (value: string) => {
    const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(value)).map(item => [item.type, item.value]));
    return { date: { year: Number(fields.year), month: Number(fields.month), day: Number(fields.day) }, time: { hours: Number(fields.hour), minutes: Number(fields.minute), seconds: Number(fields.second) } };
  };
  const start = parts(event.startAt); const end = parts(event.endAt);
  return { startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time };
}
async function checkGoogle(context: ProviderContext, ids: ExternalIds): Promise<ProviderOutcome> {
  if (!ids.postId) return { status: 'NEEDS_ATTENTION', ids, detail: 'Google did not return a Local Post name. Inspect the location’s posts before retrying.' };
  if (!ids.postId.startsWith(`${context.destination.externalId}/localPosts/`) || !/^accounts\/[^/]+\/locations\/[^/]+\/localPosts\/[^/]+$/.test(ids.postId)) throw new SocialProviderError('This Local Post ID does not belong to the selected destination.', 'CONTENT', 'post_destination_mismatch');
  const post = await jsonRequest(`https://mybusiness.googleapis.com/v4/${ids.postId.split('/').map(encodeURIComponent).join('/')}`, { headers: headers(context.credentials) });
  return { status: post.state === 'LIVE' ? 'PUBLISHED' : post.state === 'REJECTED' ? 'REJECTED' : 'PROCESSING', ids, postUrl: string(post.searchUrl) || undefined, confirmed: post.state === 'LIVE', detail: post.state === 'REJECTED' ? 'Google rejected the Local Post. Review policy, content and location eligibility before another approval.' : undefined };
}
export const googleBusinessProvider: SocialProviderAdapter = {
  provider: 'GOOGLE_BUSINESS', validate: validateContent,
  async discover(credentials) {
    const accounts = await pages('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20', credentials, 'accounts');
    const destinations: DiscoveredDestination[] = [];
    for (const account of accounts) {
      const accountName = requiredString(account.name, 'a Google account name');
      if (!/^accounts\/[^/]+$/.test(accountName)) throw new SocialProviderError('Google returned an invalid account identifier.', 'CONTENT', 'invalid_account_id');
      const locations = await pages(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName.split('/').map(encodeURIComponent).join('/')}/locations?readMask=name,title,metadata&pageSize=100`, credentials, 'locations');
      for (const location of locations) {
        const name = requiredString(location.name, 'a Google location name');
        if (!/^locations\/[^/]+$/.test(name)) throw new SocialProviderError('Google returned an invalid location identifier.', 'CONTENT', 'invalid_location_id');
        const metadata = object(location.metadata);
        destinations.push({ provider: 'GOOGLE_BUSINESS', externalId: `${accountName}/${name}`, displayName: string(location.title) || name, metadata: { accountName, locationName: name, accountDisplayName: string(account.accountName), mapsUri: string(metadata.mapsUri), apiVersion: 'Local Posts v4', loginRoute: 'GOOGLE_OAUTH', timeZone: 'America/New_York' } });
      }
    }
    return destinations;
  },
  async prepare(context) { return { ids: context.ids, ready: true }; },
  async publish(context) {
    if (context.ids.publicationStarted) return checkGoogle(context, context.ids);
    const content = context.content;
    const media = await Promise.all(content.media.map(async item => ({ mediaFormat: 'PHOTO', sourceUrl: await context.getMediaUrl(item) })));
    const action = content.options?.googleCallToAction ?? (content.link ? 'LEARN_MORE' : undefined);
    const payload = { languageCode: 'en-US', summary: content.caption, topicType: content.format === 'EVENT' ? 'EVENT' : 'STANDARD', ...(media.length ? { media } : {}), ...(action ? { callToAction: { actionType: action, ...(action !== 'CALL' && content.link ? { url: content.link } : {}) } } : {}), ...(content.format === 'EVENT' && content.event ? { event: { title: content.event.title, schedule: googleEventSchedule(content.event, string(context.destination.metadata.timeZone) || 'America/New_York') } } : {}) };
    const result = await publishOperation(context, () => jsonRequest(`https://mybusiness.googleapis.com/v4/${context.destination.externalId.split('/').map(encodeURIComponent).join('/')}/localPosts`, { method: 'POST', headers: headers(context.credentials), body: JSON.stringify(payload) }, true));
    await checkpoint(context, { postId: requiredString(result.name, 'a Google Local Post name') });
    return checkGoogle(context, context.ids);
  }, check: checkGoogle,
};
