import { NextRequest, NextResponse } from "next/server";
import { requireCrmActor } from "../../../../../../lib/crm/auth";
import { prisma } from "../../../../../../lib/prisma";
import { normalizeSmsPhone } from "../../../../../../lib/crm/sms/provider";
export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { actor } = await requireCrmActor(true);
  const { id } = await params;
  const contact = await prisma.locationContact.findFirst({
    where: { organizationId: actor.organizationId, id, active: true },
    select: { phone: true },
  });
  if (!contact?.phone)
    return NextResponse.json(
      { error: "Contact phone unavailable." },
      { status: 404 },
    );
  let phone: string;
  try {
    phone = normalizeSmsPhone(contact.phone);
  } catch {
    return NextResponse.json(
      { error: "Add a valid phone number to the contact." },
      { status: 400 },
    );
  }
  const [connection, consent, messages, organization] = await Promise.all([
    prisma.smsConnection.findFirst({
      where: { organizationId: actor.organizationId, enabled: true },
      select: { provider: true, sender: true },
    }),
    prisma.smsConsent.findUnique({
      where: {
        organizationId_phone: { organizationId: actor.organizationId, phone },
      },
      select: { status: true },
    }),
    prisma.smsMessage.findMany({
      where: { organizationId: actor.organizationId, phone },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        body: true,
        direction: true,
        status: true,
        createdAt: true,
        connection: { select: { provider: true } },
      },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { displayName: true },
    }),
  ]);
  return NextResponse.json({
    phone,
    connection,
    consent: consent?.status ?? "UNKNOWN",
    messages,
    brand: organization.displayName,
  });
}
