import { NextResponse } from 'next/server';
import { requireAdminSession } from '../../../../../../lib/auth';
import { prisma, runWithOrganizationStateAccess } from '../../../../../../lib/prisma';
import { getSocialBaseUrl } from '../../../../../../lib/socialPublishing/config';
import { socialOAuthFamily } from '../../../../../../lib/socialPublishing/oauth';
import { completeScopedSocialOAuth } from '../../../../../../lib/socialPublishing/oauthFlow';
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
    const result = await completeScopedSocialOAuth(
      actor,
      session.tokenHash,
      family,
      { state: url.searchParams.get('state') ?? '', code: url.searchParams.get('code'), denied: url.searchParams.has('error') },
      { db: prisma, withScope: runWithOrganizationStateAccess },
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
