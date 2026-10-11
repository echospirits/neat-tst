import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isSideEffectEnabled } from "../../../../lib/appEnvironment";
import { syncMailbox } from "../../../../lib/crm/mail/sync";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET,
    provided = request.headers.get("authorization") ?? "";
  if (
    !expected ||
    Buffer.byteLength(provided) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(
      new TextEncoder().encode(provided),
      new TextEncoder().encode(`Bearer ${expected}`),
    )
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isSideEffectEnabled("cron") || process.env.CRM_MAIL_ENABLED !== "true")
    return NextResponse.json({ status: "disabled" });
  const connections = await prisma.mailboxConnection.findMany({
    where: {
      enabled: true,
      provider: { in: ["GOOGLE", "MICROSOFT"] },
      user: { isActive: true },
      organization: {
        active: true,
        accountStatus: { notIn: ["SUSPENDED", "CANCELLED"] },
        features: { some: { featureKey: "CORE_CRM", enabled: true } },
      },
      updatedAt: { lt: new Date(Date.now() - 60000) },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    orderBy: { updatedAt: "asc" },
    take: 2,
    select: { id: true, userId: true, organizationId: true },
  });
  let processed = 0,
    failed = 0;
  for (const c of connections) {
    try {
      await syncMailbox(
        { userId: c.userId, organizationId: c.organizationId },
        c.id,
      );
      processed++;
    } catch {
      failed++;
    }
  }
  // No addresses, subjects, tokens or raw provider failures enter operational output.
  return NextResponse.json(
    { processed, failed },
    { status: failed ? 503 : 200 },
  );
}
