import { head } from '@vercel/blob';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { requireSocialActor } from '../../../../../lib/socialPublishing/access';
import { getSocialWorkspace } from '../../../../../lib/socialPublishing/service';
import { readSocialMedia, socialBlobToken, socialUploadPath } from '../../../../../lib/socialPublishing/media';
import { MAX_SOCIAL_MEDIA_BYTES, probeSocialMedia } from '../../../../../lib/socialPublishing/mediaProbe';
import { isSideEffectEnabled } from '../../../../../lib/appEnvironment';

export const runtime = 'nodejs';
export const maxDuration = 300;
const inputSchema = z.object({ groupId: z.string().min(1).max(120), uploadId: z.string().uuid(), extension: z.enum(['jpg', 'png', 'mp4']), fileName: z.string().min(1).max(250) });
export async function POST(request: Request) {
  const { actor } = await requireSocialActor();
  if (!isSideEffectEnabled('fileUploads')) return Response.json({ error: 'File uploads are disabled in this environment.' }, { status: 503 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'Invalid media metadata.' }, { status: 413 });
  try {
    const input = inputSchema.parse(await request.json());
    const workspace = await getSocialWorkspace(prisma, actor);
    if (!workspace.groups.some(group => group.id === input.groupId)) return Response.json({ error: 'You cannot add media for this brand group.' }, { status: 403 });
    const storageKey = socialUploadPath(actor.organizationId, input.groupId, actor.userId, input.uploadId, input.extension);
    const metadata = await head(storageKey, { token: socialBlobToken() });
    if (metadata.pathname !== storageKey || metadata.size > MAX_SOCIAL_MEDIA_BYTES) throw new Error('The uploaded media does not match this upload session.');
    const probe = probeSocialMedia(await readSocialMedia({ storageKey }));
    const media = await prisma.$transaction(async db => {
      const current = await getSocialWorkspace(db, actor);
      if (!current.groups.some(group => group.id === input.groupId)) throw new Error('Your access to this brand group changed.');
      const existing = await db.socialMedia.findFirst({ where: { organizationId: actor.organizationId, storageKey } });
      if (existing) return existing;
      return db.socialMedia.create({ data: { organizationId: actor.organizationId, groupId: input.groupId, createdByUserId: actor.userId, storageKey, fileName: input.fileName.replace(/[\u0000-\u001f/\\]/g, '_'), ...probe } });
    });
    return Response.json({ media });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Invalid media upload information. Upload the file again.' }, { status: 400 });
    return Response.json({ error: error instanceof Error && /JPEG|PNG|MP4|media|H\.264|brand group|not configured/.test(error.message) ? error.message : 'The media upload could not be verified. Upload a new version or ask an administrator to check private storage.' }, { status: 400 });
  }
}
