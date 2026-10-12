import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, runWithOrganizationStateAccess } from "../../../../lib/prisma";
import { isSideEffectEnabled } from "../../../../lib/appEnvironment";
import { syncMailbox, sweepMailboxRetention } from "../../../../lib/crm/mail/sync";
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
  if (!isSideEffectEnabled("cron"))
    return NextResponse.json({ status: "disabled" });
  const removed = await sweepMailboxRetention();
  if (process.env.CRM_MAIL_ENABLED !== "true") return NextResponse.json({ status: "mail-disabled", removed });
  const connections = await prisma.mailboxConnection.findMany({
    where: {
      enabled: true,
      provider: { in: ["GOOGLE", "MICROSOFT"] },
      user: { isActive: true },
      organization: {
        active: true,
        accountStatus: { notIn: ["SUSPENDED", "CANCELLED"] },
        AND: [
          { features: { some: { featureKey: "CORE_CRM", enabled: true } } },
          { features: { some: { featureKey: "COMMUNICATIONS", enabled: true } } },
        ],
      },
      AND: [{ OR: [{errorCode:null},{errorCode:{not:"RECONNECT"}}] }, { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] }],

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
      await runWithOrganizationStateAccess(c.organizationId, () => syncMailbox(
        { userId: c.userId, organizationId: c.organizationId },
        c.id,
      ));
      processed++;
    } catch {
      failed++;
    }
  }
  // No addresses, subjects, tokens or raw provider failures enter operational output.
  return NextResponse.json(
    { processed, failed, removed },
    { status: failed ? 503 : 200 },
  );
}
