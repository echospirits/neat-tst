import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireSocialActor } from '../../../../../lib/socialPublishing/access';
import { getSocialWorkspace } from '../../../../../lib/socialPublishing/service';
import { socialBlobToken, socialUploadPath } from '../../../../../lib/socialPublishing/media';
import { MAX_SOCIAL_MEDIA_BYTES, SOCIAL_MEDIA_TYPES } from '../../../../../lib/socialPublishing/mediaProbe';
import { isSideEffectEnabled } from '../../../../../lib/appEnvironment';
import { prisma } from '../../../../../lib/prisma';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!isSideEffectEnabled('fileUploads')) return Response.json({ error: 'File uploads are disabled in this environment.' }, { status: 503 });
  if (Number(request.headers.get('content-length') || 0) > 16384) return Response.json({ error: 'Upload authorization request is too large.' }, { status: 413 });
  let body: HandleUploadBody;
  try { body = await request.json() as HandleUploadBody; } catch { return Response.json({ error: 'Invalid upload request.' }, { status: 400 }); }
  const access = body.type === 'blob.generate-client-token' ? await requireSocialActor() : null;
  try {
    const response = await handleUpload({
      body, request, token: socialBlobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!access || !clientPayload) throw new Error('Sign in to upload social media.');
        const payload = JSON.parse(clientPayload) as { groupId?: unknown; uploadId?: unknown; extension?: unknown };
        if (typeof payload.groupId !== 'string' || typeof payload.uploadId !== 'string' || typeof payload.extension !== 'string') throw new Error('Choose a brand group before uploading.');
        const workspace = await getSocialWorkspace(prisma, access.actor);
        if (!workspace.groups.some(group => group.id === payload.groupId)) throw new Error('You cannot upload media for this brand group.');
        const expected = socialUploadPath(access.actor.organizationId, payload.groupId, access.actor.userId, payload.uploadId, payload.extension);
        if (pathname !== expected) throw new Error('The upload pathname does not match its authorized brand group.');
        return { addRandomSuffix: false, allowOverwrite: false, allowedContentTypes: [...SOCIAL_MEDIA_TYPES], maximumSizeInBytes: MAX_SOCIAL_MEDIA_BYTES, validUntil: Date.now() + 15 * 60 * 1000, tokenPayload: JSON.stringify({ organizationId: access.actor.organizationId, groupId: payload.groupId, userId: access.actor.userId }) };
      },
      onUploadCompleted: async () => undefined,
    });
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error && /not configured|cannot upload|pathname|brand group/.test(error.message) ? error.message : 'Could not authorize the upload. Ask an administrator to check private social media storage.' }, { status: 400 });
  }
}
