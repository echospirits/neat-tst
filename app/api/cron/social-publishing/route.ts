import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../../../../lib/prisma';
import { runSocialPublishingJobs } from '../../../../lib/socialPublishing/worker';
import { recoverSocialDispatches } from '../../../../lib/socialPublishing/dispatch';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get('authorization') ?? '';
  const value = `Bearer ${expected}`;
  if (
    !expected ||
    Buffer.byteLength(actual) !== Buffer.byteLength(value) ||
    !timingSafeEqual(
      new TextEncoder().encode(actual),
      new TextEncoder().encode(value),
    )
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const recovery = await recoverSocialDispatches();
  return NextResponse.json({
    recovery,
    ...(await runSocialPublishingJobs(prisma)),
  });
}
