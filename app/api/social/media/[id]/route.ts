import { get } from '@vercel/blob';
import { prisma } from '../../../../../lib/prisma';
import { requireSocialActor } from '../../../../../lib/socialPublishing/access';
import { getSocialWorkspace } from '../../../../../lib/socialPublishing/service';
import { socialBlobToken, verifyDispatchMediaSignature } from '../../../../../lib/socialPublishing/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const media = await prisma.socialMedia.findUnique({ where: { id } });
  if (!media) return new Response('Media unavailable.', { status: 404 });
  const url = new URL(request.url);
  let authorized = false;
  try { authorized = verifyDispatchMediaSignature(media, url.searchParams.get('expires'), url.searchParams.get('signature')); } catch { /* Ordinary authenticated viewing does not require dispatch signing configuration. */ }
  if (!authorized) {
    if (url.searchParams.has('signature')) return new Response('This media link has expired or is invalid.', { status: 403 });
    const { actor } = await requireSocialActor();
    const workspace = await getSocialWorkspace(prisma, actor);
    if (media.organizationId !== actor.organizationId || !workspace.groups.some(group => group.id === media.groupId)) return new Response('Media unavailable.', { status: 404 });
  }
  const range = request.headers.get('range');
  if (range && (!/^bytes=(\d+-\d*|-\d+)$/.test(range) || range.length > 70)) return new Response('Use a single valid byte range.', { status: 416, headers: { 'Content-Range': `bytes */${media.bytes}` } });
  const blob = await get(media.storageKey, { access: 'private', token: socialBlobToken(), useCache: false, ...(range ? { headers: { Range: range } } : {}) });
  if (!blob || blob.statusCode !== 200) return new Response('This media version is unavailable.', { status: 404 });
  const contentRange = blob.headers.get('content-range');
  const partial = range && contentRange && /^bytes \d+-\d+\/\d+$/.test(contentRange);
  const headers = new Headers({ 'Content-Type': media.mimeType, 'Content-Length': String(partial ? blob.blob.size : media.bytes), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(media.fileName)}` });
  if (partial) headers.set('Content-Range', contentRange);
  return new Response(blob.stream, { headers, status: partial ? 206 : 200 });
}
export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await GET(request, context);
  await response.body?.cancel();
  return new Response(null, { status: response.status, headers: response.headers });
}
