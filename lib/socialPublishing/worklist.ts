// Worklist and its calendar exports are team-visible. Keep protected Social
// content inside the authorized post route instead of copying it into a task.
const prefix = 'Reviewed social post: ';

export function socialWorklistDetail(postId: string): string {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(postId)) throw new Error('Invalid social post identity.');
  return `${prefix}/social/${postId}`;
}

export function socialWorklistPostHref(detail: string | null): string | null {
  if (!detail?.startsWith(prefix)) return null;
  const href = detail.slice(prefix.length);
  return /^\/social\/[A-Za-z0-9_-]{1,100}$/.test(href) ? href : null;
}
