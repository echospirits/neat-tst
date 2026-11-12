import { NextResponse } from 'next/server';
import { requireAdminSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import {
  socialOAuthFamily,
  startSocialOAuth,
} from '../../../../../../lib/socialPublishing/oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await requireAdminSession();
  const user = session.user;
  try {
    if (!user.organizationId) throw new Error('Tenant required.');
    const family = socialOAuthFamily((await params).provider);
    const target = await prisma.$transaction((tx) =>
      startSocialOAuth(
        tx,
        {
          organizationId: user.organizationId!,
          userId: user.id,
          role: user.role,
        },
        session.tokenHash,
        family,
      ),
    );
    return NextResponse.redirect(target);
  } catch {
    return NextResponse.redirect(
      new URL(
        '/social?view=connections&status=configuration-required',
        process.env.APP_BASE_URL!,
      ),
    );
  }
}
