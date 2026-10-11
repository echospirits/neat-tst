import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { encryptCalendarToken } from "../lib/calendar/crypto";
import {
  recordSmsConsent,
  sendContactSms,
  receiveSms,
} from "../lib/crm/sms/service";
import { POST } from "../app/api/crm/sms/[id]/route";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal required.");
async function main() {
  const fixture = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8"));
  const actor = { organizationId: fixture.orgA, userId: fixture.userA };
  const contact = await prisma.locationContact.findFirstOrThrow({
    where: { organizationId: actor.organizationId, active: true },
  });
  await prisma.locationContact.update({
    where: { id: contact.id },
    data: { phone: "+15005550007" },
  });
  const connection = await prisma.smsConnection.upsert({
    where: {
      organizationId_provider: {
        organizationId: actor.organizationId,
        provider: "MOCK",
      },
    },
    create: {
      organizationId: actor.organizationId,
      provider: "MOCK",
      enabled: true,
      createdByUserId: actor.userId,
    },
    update: { enabled: true },
  });
  await prisma.$transaction((tx) =>
    recordSmsConsent(tx, actor, {
      phone: "+15005550007",
      status: "OPTED_IN",
      evidence: "Synthetic fixture only.",
      key: randomUUID(),
    }),
  );
  const input = {
    contactId: contact.id,
    body: "Fixture delivery",
    confirmSend: "on",
    submissionKey: randomUUID(),
  };
  await assert.rejects(() =>
    sendContactSms(
      { organizationId: fixture.orgB, userId: fixture.userB },
      input,
    ),
  );
  const sent = await sendContactSms(actor, input),
    replay = await sendContactSms(actor, input);
  assert.equal(sent.id, replay.id);
  assert.equal(sent.status, "DELIVERED");
  assert.equal(
    await prisma.smsMessage.count({
      where: {
        organizationId: actor.organizationId,
        sourceKey: sent.sourceKey,
      },
    }),
    1,
  );
  const incoming = {
    MessageSid: `MOCK${randomUUID()}`,
    From: "+15005550007",
    Body: "Thanks for following up.",
  };
  const reply = await prisma.$transaction((tx) =>
    receiveSms(tx, connection, incoming),
  );
  assert.equal(
    (await prisma.$transaction((tx) => receiveSms(tx, connection, incoming)))
      .id,
    reply.id,
  );
  assert.equal(reply.contactId, contact.id);
  // Exercise the actual signed webhook handler without live credentials or network traffic.
  process.env.APP_BASE_URL = "https://crm.example.invalid";
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
  const token = randomBytes(24).toString("hex");
  const twilio = await prisma.smsConnection.create({
    data: {
      organizationId: actor.organizationId,
      provider: "TWILIO",
      accountSid: `AC${randomBytes(16).toString("hex")}`,
      sender: `+1${String(Date.now()).slice(-10)}`,
      credentialsEncrypted: encryptCalendarToken(token),
      createdByUserId: actor.userId,
      enabled: false,
    },
  });
  const fields = {
    AccountSid: twilio.accountSid!,
    MessageSid: `SM${randomBytes(16).toString("hex")}`,
    From: "+15005550007",
    To: twilio.sender!,
    Body: "STOP",
  };
  const url = `https://crm.example.invalid/api/crm/sms/${twilio.id}`;
  const signed = (values: Record<string, string>, target = url) =>
    createHmac("sha1", token)
      .update(
        target +
          Object.keys(values)
            .sort()
            .map((key) => key + values[key])
            .join(""),
      )
      .digest("base64");
  const request = (signature: string, values = fields, target = url) =>
    new NextRequest(target, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature,
      },
      body: new URLSearchParams(values),
    });
  const context = { params: Promise.resolve({ id: twilio.id }) };
  assert.equal((await POST(request("invalid"), context)).status, 401);
  assert.equal((await POST(request(signed(fields)), context)).status, 200);
  assert.equal((await POST(request(signed(fields)), context)).status, 200);
  assert.equal(
    (
      await prisma.smsConsent.findUniqueOrThrow({
        where: {
          organizationId_phone: {
            organizationId: actor.organizationId,
            phone: "+15005550007",
          },
        },
      })
    ).status,
    "OPTED_OUT",
  );
  assert.equal(
    await prisma.smsConsentEvent.count({
      where: {
        organizationId: actor.organizationId,
        eventKey: `stop:${twilio.id}:${fields.MessageSid}`,
      },
    }),
    1,
  );
  await assert.rejects(() =>
    sendContactSms(actor, {
      ...input,
      submissionKey: randomUUID(),
      body: "Must be blocked",
    }),
  );
  await prisma.$transaction((tx) =>
    recordSmsConsent(tx, actor, {
      phone: "+15005550007",
      status: "OPTED_IN",
      evidence: "New explicit synthetic consent for uncertainty test.",
      key: randomUUID(),
    }),
  );
  let attempts = 0;
  const uncertain = {
    ...input,
    submissionKey: randomUUID(),
    body: "Uncertain fixture",
  };
  const provider = {
    send: async () => {
      attempts++;
      throw Error("Synthetic transport failure");
    },
  };
  const unknown = await sendContactSms(actor, uncertain, provider);
  assert.equal(unknown.status, "UNKNOWN");
  await sendContactSms(actor, uncertain, provider);
  assert.equal(attempts, 1);
  await assert.rejects(() =>
    sendContactSms(
      actor,
      { ...uncertain, submissionKey: randomUUID() },
      provider,
    ),
  );
  // Only fixture cleanup: release the synthetic uncertainty before UI acceptance.
  await prisma.smsMessage.update({
    where: { id: unknown.id },
    data: { status: "FAILED" },
  });
  fixture.smsContactId = contact.id;
  writeFileSync("output/crm-rehearsal.json", JSON.stringify(fixture));
  console.log(
    "PASS: SMS consent, tenant isolation, mock two-way delivery, replay, signed webhook denial/acceptance, STOP and uncertain-send suppression. No live SMS sent.",
  );
}
main()
  .catch((error) => {
    console.error(
      "SMS rehearsal failed:",
      error instanceof Error
        ? error.stack
            ?.split("\n")
            .filter((line) => /^\s+at /.test(line))
            .slice(0, 4)
            .join("\n")
        : "unknown",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
