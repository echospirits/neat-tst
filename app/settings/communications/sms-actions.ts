"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import twilio from "twilio";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import {
  CrmError,
  accountInput,
  assertAccount,
  accountWhere,
} from "../../../lib/crm/activity";
import { encryptCalendarToken } from "../../../lib/calendar/crypto";
import { getAppEnvironment } from "../../../lib/appEnvironment";
import { isAdminRole } from "../../../lib/userAccess";
import {
  normalizeSmsPhone,
  assertLiveSmsEnabled,
} from "../../../lib/crm/sms/provider";
import {
  recordSmsConsent,
  sendContactSms,
  simulateSmsReply,
  projectSmsActivity,
} from "../../../lib/crm/sms/service";
import type { CrmActionResult } from "../../crm/actions";
function refresh() {
  revalidatePath("/settings/communications");
  revalidatePath("/agencies/[id]", "page");
  revalidatePath("/wholesale/[id]", "page");
}
const failure = (error: unknown): CrmActionResult => ({
  error:
    error instanceof CrmError
      ? error.message
      : error instanceof z.ZodError
        ? "Check the required fields and confirm the action."
        : "SMS action failed. Check configuration and retry. No credentials are shown.",
});
export async function configureSmsAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor(true);
  if (!isAdminRole(user.role))
    return { error: "Organization administrator access required." };
  try {
    const provider = z
      .enum(["MOCK", "TWILIO", "DISABLE"])
      .parse(form.get("provider"));
    if (provider === "DISABLE") {
      await prisma.smsConnection.updateMany({
        where: { organizationId: actor.organizationId },
        data: { enabled: false },
      });
      refresh();
      return {
        success:
          "SMS sending disabled. Incoming opt-outs can still be recorded.",
      };
    }
    let accountSid: string | null = null,
      sender: string | null = null,
      credentialsEncrypted: string | null = null;
    if (provider === "MOCK") {
      if (getAppEnvironment() === "production")
        throw new CrmError("Demo mode is disabled in production.");
    } else {
      assertLiveSmsEnabled();
      if (
        form.get("registrationVerified") !== "on" ||
        form.get("authorizeIdentity") !== "on"
      )
        throw new CrmError(
          "Verify registration and authorize this sending identity.",
        );
      accountSid = z
        .string()
        .regex(/^AC[a-fA-F0-9]{32}$/)
        .parse(form.get("accountSid"));
      const token = z.string().min(20).max(200).parse(form.get("authToken"));
      sender = normalizeSmsPhone(String(form.get("sender") ?? ""));
      const numbers = await twilio(accountSid, token, {
        autoRetry: false,
        timeout: 15000,
      }).incomingPhoneNumbers.list({ phoneNumber: sender, limit: 1 });
      if (
        !numbers.some(
          (number) => number.phoneNumber === sender && number.capabilities.sms,
        )
      )
        throw new CrmError(
          "This account does not own an SMS-capable sending number.",
        );
      credentialsEncrypted = encryptCalendarToken(token);
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-config:${actor.organizationId}`}, 0))`;
      const prior = await tx.smsConnection.findUnique({
        where: {
          organizationId_provider: {
            organizationId: actor.organizationId,
            provider,
          },
        },
      });
      // Existing history must not be reinterpreted under another provider or sending identity.
      if (
        prior &&
        (prior.provider !== provider ||
          prior.accountSid !== accountSid ||
          prior.sender !== sender) &&
        (await tx.smsMessage.count({ where: { connectionId: prior.id } }))
      )
        throw new CrmError(
          "This identity has message history. Use an administrator migration to replace it safely.",
        );
      await tx.smsConnection.updateMany({
        where: {
          organizationId: actor.organizationId,
          provider: { not: provider },
        },
        data: { enabled: false },
      });
      await tx.smsConnection.upsert({
        where: {
          organizationId_provider: {
            organizationId: actor.organizationId,
            provider,
          },
        },
        create: {
          organizationId: actor.organizationId,
          createdByUserId: actor.userId,
          provider,
          accountSid,
          sender,
          credentialsEncrypted,
          enabled: true,
          registrationVerified: provider === "TWILIO",
        },
        update: {
          provider,
          accountSid,
          sender,
          credentialsEncrypted,
          enabled: true,
          registrationVerified: provider === "TWILIO",
        },
      });
      await tx.organizationAuditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          metadata: { kind: "SMS_IDENTITY", provider, enabled: true },
        },
      });
    });
    refresh();
    return {
      success:
        provider === "MOCK"
          ? "Demo SMS enabled. No external messages are sent."
          : "Verified sending number saved. Each message still requires opt-in and review.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function saveSmsConsentAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    const input = z
      .object({
        contactId: z.string(),
        status: z.enum(["OPTED_IN", "OPTED_OUT"]),
        evidence: z.string().trim().min(5).max(2000),
      })
      .parse(Object.fromEntries(form));
    const contact = await prisma.locationContact.findFirst({
      where: {
        organizationId: actor.organizationId,
        id: input.contactId,
        active: true,
      },
    });
    if (!contact?.phone)
      throw new CrmError("An active contact phone is required.");
    await prisma.$transaction((tx) =>
      recordSmsConsent(tx, actor, {
        ...input,
        phone: contact.phone!,
        key: `manual:${randomUUID()}`,
      }),
    );
    refresh();
    return {
      success:
        "Consent decision recorded with its source. Preference alone is not consent.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function sendSmsAction(form: FormData): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    const message = await sendContactSms(actor, Object.fromEntries(form));
    refresh();
    return {
      success: ["SENDING", "UNKNOWN"].includes(message.status)
        ? "Delivery is uncertain. Review provider records before another send; this request will not be resent."
        : `Message status: ${message.status.toLowerCase()}.`,
    };
  } catch (e) {
    return failure(e);
  }
}
export async function simulateSmsAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    const input = z
      .object({
        contactId: z.string(),
        body: z.string().trim().min(1).max(1600),
      })
      .parse(Object.fromEntries(form));
    await simulateSmsReply(actor, input.contactId, input.body);
    refresh();
    return {
      success: "Demo reply recorded. STOP also exercises opt-out handling.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function associateSmsAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    const input = accountInput
      .extend({ id: z.string().min(1) })
      .parse(Object.fromEntries(form));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-associate:${actor.organizationId}:${input.id}`}, 0))`;
      const message = await tx.smsMessage.findFirst({
        where: {
          id: input.id,
          organizationId: actor.organizationId,
          direction: "INBOUND",
          agencyId: null,
          wholesaleAccountId: null,
        },
        include: { connection: { select: { provider: true } } },
      });
      if (!message)
        throw new CrmError(
          "This message is unavailable or already associated.",
        );
      await assertAccount(tx, input);
      const matched = await tx.smsMessage.update({
        where: { id: message.id },
        data: { ...accountWhere(input) },
      });
      await projectSmsActivity(tx, matched, message.connection.provider);
      await tx.organizationAuditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          metadata: {
            kind: "SMS_ASSOCIATED",
            messageId: message.id,
            accountType: input.accountType,
            accountId: input.accountId,
          },
        },
      });
    });
    refresh();
    return {
      success:
        "Message associated with the account; original message retained.",
    };
  } catch (e) {
    return failure(e);
  }
}
