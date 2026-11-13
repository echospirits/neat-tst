import { NextResponse } from 'next/server';
import { requireAdminSession } from '../../../../../../lib/auth';
import { prisma, runWithOrganizationStateAccess } from '../../../../../../lib/prisma';
import { getSocialBaseUrl } from '../../../../../../lib/socialPublishing/config';
import { socialOAuthStartDiagnostic } from '../../../../../../lib/socialPublishing/oauthDiagnostics';
import { socialOAuthFamily } from '../../../../../../lib/socialPublishing/oauth';
import { startScopedSocialOAuth } from '../../../../../../lib/socialPublishing/oauthFlow';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await requireAdminSession();
  const user = session.user;
  let baseUrl: string;
  try { baseUrl = getSocialBaseUrl(); }
  catch { return NextResponse.json({ error: 'Social Publishing base URL is not configured correctly.' }, { status: 503 }); }
  try {
    if (!user.organizationId) throw new Error('Tenant required.');
    const family = socialOAuthFamily((await params).provider);
    const target = await startScopedSocialOAuth(
      { organizationId: user.organizationId, userId: user.id, role: user.role },
      session.tokenHash,
      family,
      { db: prisma, withScope: runWithOrganizationStateAccess },
    );
    return NextResponse.redirect(target);
  } catch (error) {
    console.error(socialOAuthStartDiagnostic(error));
    return NextResponse.redirect(
      new URL(
        '/social?view=connections&status=configuration-required',
        baseUrl,
      ),
    );
  }
}
