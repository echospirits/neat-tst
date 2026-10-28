import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../prisma";
import { ECHO_ORGANIZATION_ID } from '../../echoAccess';
import { getAppEnvironment } from "../../appEnvironment";
import { decryptCalendarToken } from "../../calendar/crypto";
import { CrmError, type CrmActor, type CrmDb } from "../activity";
import { communicationsPilotEnabled, requireCommunicationsPilot } from '../communicationsPilot';
import {
  MockSmsProvider,
  TwilioSmsProvider,
  normalizeSmsPhone,
  isOptOut,
  advanceDelivery,
  assertLiveSmsEnabled,
  type SmsProvider,
} from "./provider";
const phoneLock = (organizationId: string, phone: string) =>
  `sms:${organizationId}:${phone}`;
export async function recordSmsConsent(
  db: CrmDb,
  actor: CrmActor,
  input: {
    phone: string;
    status: "OPTED_IN" | "OPTED_OUT";
    evidence: string;
    key: string;
  },
) {
  const phone = normalizeSmsPhone(input.phone);
  if (!input.evidence.trim() || input.evidence.length > 2000)
    throw new CrmError(
      "Record the consent source and date (up to 2,000 characters).",
    );
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phoneLock(actor.organizationId, phone)}, 0))`;
  const event = await db.smsConsentEvent.findUnique({
    where: {
      organizationId_eventKey: {
        organizationId: actor.organizationId,
        eventKey: input.key,
      },
    },
  });
  if (event) return;
  await db.smsConsentEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      phone,
      status: input.status,
      evidence: input.evidence.trim(),
      eventKey: input.key,
    },
  });
  await db.smsConsent.upsert({
    where: {
      organizationId_phone: { organizationId: actor.organizationId, phone },
    },
    create: {
      organizationId: actor.organizationId,
      phone,
      status: input.status,
    },
    update: { status: input.status },
  });
}
export async function sendContactSms(
  actor: CrmActor,
  raw: unknown,
  override?: SmsProvider,
) {
  await requireCommunicationsPilot(prisma, actor.organizationId);
  const input = z
    .object({
      contactId: z.string().min(1),
      body: z.string().trim().min(1).max(1200),
      submissionKey: z.string().uuid(),
      confirmSend: z.literal("on"),
    })
    .parse(raw);
  const contact = await prisma.locationContact.findFirst({
    where: {
      id: input.contactId,
      organizationId: actor.organizationId,
      active: true,
      mergedIntoContactId: null,
    },
  });
  if (!contact?.phone || (!contact.agencyId && !contact.wholesaleAccountId))
    throw new CrmError(
      "Choose an active contact with an account and phone number.",
    );
  const phone = normalizeSmsPhone(contact.phone);
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { displayName: true },
  });
  input.body = `${organization.displayName}: ${input.body}\nReply STOP to opt out.`;
  const connection = await prisma.smsConnection.findFirst({
    where: { organizationId: actor.organizationId, enabled: true },
  });
  if (!connection?.enabled)
    throw new CrmError(
      "An administrator must enable the organization SMS connection.",
    );
  if (connection.provider === "MOCK" && getAppEnvironment() === "production")
    throw new CrmError("Mock SMS is disabled in production.");
  if (override && process.env.CRM_REHEARSAL !== "true")
    throw new CrmError("Provider overrides require isolated rehearsal.");
  if (connection.provider === "TWILIO") {
    assertLiveSmsEnabled();
    if (
      !connection.registrationVerified ||
      !connection.accountSid ||
      !connection.sender ||
      !connection.credentialsEncrypted
    )
      throw new CrmError(
        "Sending identity and registration must be verified first.",
      );
  }
  const sourceKey = `outbound:${actor.userId}:${input.submissionKey}`;
  // Persist a claim before calling a non-idempotent provider. A crash leaves SENDING for review, never an automatic resend.
  const claim = await prisma.$transaction(async (tx) => {
    await requireCommunicationsPilot(tx, actor.organizationId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-rate:${actor.organizationId}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phoneLock(actor.organizationId, phone)}, 0))`;
    const prior = await tx.smsMessage.findUnique({
      where: {
        organizationId_sourceKey: {
          organizationId: actor.organizationId,
          sourceKey,
        },
      },
    });
    if (prior) return { message: prior, send: false };
    const consent = await tx.smsConsent.findUnique({
      where: {
        organizationId_phone: { organizationId: actor.organizationId, phone },
      },
    });
    if (consent?.status !== "OPTED_IN")
      throw new CrmError(
        "Recorded opt-in consent is required. Opted-out contacts cannot be messaged.",
      );
    const recent = await tx.smsMessage.count({
      where: {
        organizationId: actor.organizationId,
        direction: "OUTBOUND",
        createdAt: { gt: new Date(Date.now() - 3600000) },
      },
    });
    if (recent >= 100)
      throw new CrmError("Hourly sending limit reached. Try later.");
    const duplicate = await tx.smsMessage.findFirst({
      where: {
        organizationId: actor.organizationId,
        phone,
        direction: "OUTBOUND",
        OR: [
          { status: { in: ["SENDING", "UNKNOWN"] } },
          { body: input.body, createdAt: { gt: new Date(Date.now() - 60000) } },
        ],
      },
      select: { id: true },
    });
    if (duplicate)
      throw new CrmError(
        "A recent or uncertain send already exists for this phone. Review delivery before sending again.",
      );
    const message = await tx.smsMessage.create({
      data: {
        organizationId: actor.organizationId,
        connectionId: connection.id,
        sourceKey,
        phone,
        body: input.body,
        direction: "OUTBOUND",
        status: "SENDING",
        contactId: contact.id,
        agencyId: contact.agencyId,
        wholesaleAccountId: contact.wholesaleAccountId,
        actorUserId: actor.userId,
      },
    });
    return { message, send: true };
  });
  if (!claim.send) return claim.message;
  try {
    // Check opt-out and identity again immediately before dispatch, serializing against consent changes.
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phoneLock(actor.organizationId, phone)}, 0))`;
        const consent = await tx.smsConsent.findUnique({
          where: {
            organizationId_phone: {
              organizationId: actor.organizationId,
              phone,
            },
          },
        });
        const active = await tx.smsConnection.findFirst({
          where: {
            id: connection.id,
            organizationId: actor.organizationId,
            enabled: true,
            updatedAt: connection.updatedAt,
          },
        });
        if (!active || consent?.status !== "OPTED_IN")
          return tx.smsMessage.update({
            where: { id: claim.message.id },
            data: { status: "CANCELLED" },
          });
        const provider =
          override ??
          (connection.provider === "MOCK"
            ? new MockSmsProvider()
            : new TwilioSmsProvider(
                connection.accountSid!,
                decryptCalendarToken(connection.credentialsEncrypted!),
              ));
        let delivered: { id: string; status: string };
        try {
          delivered = await provider.send({
            from: connection.sender ?? "+15005550006",
            to: phone,
            body: input.body,
            requestId: claim.message.id,
            callback: `${process.env.APP_BASE_URL}/api/crm/sms/${connection.id}?messageId=${claim.message.id}`,
          });
        } catch {
          return tx.smsMessage.update({
            where: { id: claim.message.id },
            data: { status: "UNKNOWN" },
          });
        }
        const message = await tx.smsMessage.update({
          where: { id: claim.message.id },
          data: {
            providerId: delivered.id,
            status: advanceDelivery("SENDING", delivered.status),
          },
        });
        await projectSmsActivity(tx, message, connection.provider);
        return message;
      },
      { timeout: 25000 },
    );
  } catch {
    await prisma.smsMessage.updateMany({
      where: {
        id: claim.message.id,
        organizationId: actor.organizationId,
        status: "SENDING",
      },
      data: { status: "UNKNOWN" },
    });
    throw new CrmError(
      "Delivery is uncertain. Check provider delivery records; this request will not be sent again automatically.",
    );
  }
}
export async function projectSmsActivity(
  db: CrmDb,
  message: {
    id: string;
    organizationId: string;
    actorUserId: string;
    contactId: string | null;
    agencyId: string | null;
    wholesaleAccountId: string | null;
    body: string;
    direction: string;
    status: string;
    createdAt: Date;
  },
  provider: string,
) {
  if (!(await communicationsPilotEnabled(db, message.organizationId))) return;
  if (!message.agencyId && !message.wholesaleAccountId) return;
  await db.accountActivity.upsert({
    where: {
      organizationId_sourceKey: {
        organizationId: message.organizationId,
        sourceKey: `sms:${message.id}`,
      },
    },
    update: {
      deliveryStatus: message.status,
      outcome: `Delivery: ${message.status.toLowerCase()}`,
    },
    create: {
      deliveryStatus: message.status,
      outcome: `Delivery: ${message.status.toLowerCase()}`,
      organizationId: message.organizationId,
      createdByUserId: message.actorUserId,
      sourceKey: `sms:${message.id}`,
      source: provider === "MOCK" ? "MOCK_SMS" : "TWILIO",
      activityType: "SMS",
      summary: message.body,
      direction: message.direction,
      contactId: message.contactId,
      agencyId: message.agencyId,
      wholesaleAccountId: message.wholesaleAccountId,
      occurredAt: message.createdAt,
      visibility: "TEAM",
      meaningful: false,
    },
  });
}
export async function receiveSms(
  db: CrmDb,
  connection: {
    id: string;
    organizationId: string;
    createdByUserId: string;
    provider: string;
  },
  fields: {
    MessageSid: string;
    From: string;
    Body: string;
    OptOutType?: string;
  },
) {
  if (connection.organizationId !== ECHO_ORGANIZATION_ID) return null;
  const phone = normalizeSmsPhone(fields.From);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phoneLock(connection.organizationId, phone)}, 0))`;
  // A revoked pilot must still honor signed STOP callbacks for an existing sender.
  if (isOptOut(fields.Body, fields.OptOutType))
    await recordSmsConsent(db, { organizationId: connection.organizationId, userId: connection.createdByUserId }, {
      phone, status: 'OPTED_OUT', evidence: 'Provider-verified inbound opt-out.', key: `stop:${connection.id}:${fields.MessageSid}`,
    });
  if (!(await communicationsPilotEnabled(db, connection.organizationId))) return null;
  const sourceKey = `inbound:${connection.id}:${fields.MessageSid}`;
  const prior = await db.smsMessage.findUnique({
    where: {
      organizationId_sourceKey: {
        organizationId: connection.organizationId,
        sourceKey,
      },
    },
  });
  if (prior) return prior;
  const candidates = await db.locationContact.findMany({
    where: {
      organizationId: connection.organizationId,
      active: true,
      OR: [
        { phone: { contains: phone.slice(-4) } },
        { phoneAliases: { has: phone } },
      ],
    },
    take: 100,
  });
  const matches = candidates.filter((contact) => {
    try {
      return [contact.phone, ...contact.phoneAliases].some((p) => {
        try {
          return normalizeSmsPhone(p ?? "") === phone;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  });
  const accounts = new Set(
    matches.map(
      (contact) =>
        `${contact.agencyId ?? ""}:${contact.wholesaleAccountId ?? ""}`,
    ),
  );
  const matched = accounts.size === 1 ? matches[0] : null;
  const message = await db.smsMessage.create({
    data: {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      sourceKey,
      providerId: fields.MessageSid,
      actorUserId: connection.createdByUserId,
      phone,
      body: fields.Body.slice(0, 1600),
      direction: "INBOUND",
      status: "RECEIVED",
      contactId: matches.length === 1 ? matched?.id : null,
      agencyId: matched?.agencyId,
      wholesaleAccountId: matched?.wholesaleAccountId,
    },
  });
  await projectSmsActivity(db, message, connection.provider);
  return message;
}
export async function simulateSmsReply(
  actor: CrmActor,
  contactId: string,
  body: string,
) {
  await requireCommunicationsPilot(prisma, actor.organizationId);
  if (getAppEnvironment() === "production")
    throw new CrmError("Demo replies are disabled in production.");
  const connection = await prisma.smsConnection.findFirst({
    where: {
      organizationId: actor.organizationId,
      provider: "MOCK",
      enabled: true,
    },
  });
  const contact = await prisma.locationContact.findFirst({
    where: {
      id: contactId,
      organizationId: actor.organizationId,
      active: true,
    },
  });
  if (!connection || !contact?.phone)
    throw new CrmError(
      "An enabled demo connection and contact phone are required.",
    );
  return prisma.$transaction(
    (tx) =>
      receiveSms(tx, connection, {
        MessageSid: `MOCK${randomUUID()}`,
        From: contact.phone!,
        Body: body,
      }),
    { timeout: 15000 },
  );
}
