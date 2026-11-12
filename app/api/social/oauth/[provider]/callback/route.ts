import { NextResponse } from 'next/server';
import { requireAdminSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { getSocialBaseUrl } from '../../../../../../lib/socialPublishing/config';
import {
  completeSocialOAuth,
  consumeSocialOAuthState,
  socialOAuthFamily,
} from '../../../../../../lib/socialPublishing/oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await requireAdminSession();
  const user = session.user;
  let baseUrl: string;
  try { baseUrl = getSocialBaseUrl(); }
  catch { return NextResponse.json({ error: 'Social Publishing base URL is not configured correctly.' }, { status: 503 }); }
  const url = new URL(request.url);
  let status = 'authorization-failed';
  try {
    if (!user.organizationId) throw new Error('Tenant required.');
    const family = socialOAuthFamily((await params).provider);
    const actor = {
      organizationId: user.organizationId,
      userId: user.id,
      role: user.role,
    };
    const state = await prisma.$transaction((tx) =>
      consumeSocialOAuthState(
        tx,
        actor,
        session.tokenHash,
        family,
        url.searchParams.get('state') ?? '',
      ),
    );
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code)
      throw new Error('Authorization not granted.');
    const result = await completeSocialOAuth(
      actor,
      family,
      code,
      state,
      prisma,
    );
    status = result.discovered
      ? result.discoveryFailures
        ? 'partially-connected'
        : 'connected'
      : 'access-review-required';
  } catch {
    /* OAuth responses and credentials are deliberately excluded from logs and redirects. */
  }
  return NextResponse.redirect(
    new URL(
      `/social?view=connections&status=${status}`,
      baseUrl,
    ),
  );
}
