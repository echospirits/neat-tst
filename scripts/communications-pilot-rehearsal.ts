import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { prisma } from "../lib/prisma";
import { syncMailbox, ingestMailChanges } from "../lib/crm/mail/sync";
import { beginMailboxOAuth } from "../lib/crm/mail/oauth";
import { sendContactSms, receiveSms } from "../lib/crm/sms/service";
import { loadContactSuggestions } from "../lib/crm/contactSuggestions";

if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated fixtures only.");
const migration = "20261012170000_communications_pilot";
async function snapshot() {
  return {
    contacts: await prisma.locationContact.count(),
    activities: await prisma.accountActivity.count(),
    mail: await prisma.mailboxConnection.count(),
    sms: await prisma.smsMessage.count(),
    features: await prisma.organizationFeature.findMany({
      where: { featureKey: { not: "COMMUNICATIONS" } },
      orderBy: { id: "asc" },
    }),
  };
}
async function main() {
  const before = await snapshot();
  for (let n = 0; n < 2; n++) {
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "db",
        "execute",
        "--file",
        `prisma/migrations/${migration}/migration.sql`,
        "--schema",
        "prisma/schema.prisma",
      ],
      { stdio: "inherit" },
    );
    assert.deepEqual(await snapshot(), before);
  }
  const enabled = await prisma.organizationFeature.findMany({
    where: { featureKey: "COMMUNICATIONS", enabled: true },
    select: { organizationId: true },
  });
  assert.deepEqual(enabled, [{ organizationId: "org_echo_spirits" }]);
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8"));
  const actor = { organizationId: f.orgA, userId: f.userA };
  await prisma.organizationFeature.update({
    where: {
      organizationId_featureKey: {
        organizationId: f.orgA,
        featureKey: "COMMUNICATIONS",
      },
    },
    data: { enabled: false },
  });
  await assert.rejects(loadContactSuggestions(prisma, actor), /pilot access/);
  await assert.rejects(syncMailbox(actor, "not-a-connection"), /pilot access/);
  await assert.rejects(beginMailboxOAuth(actor, "GOOGLE"), /pilot access/);
  await assert.rejects(sendContactSms(actor, {}), /pilot access/);
  await assert.rejects(
    ingestMailChanges(
      prisma,
      actor,
      {
        id: "invalid",
        email: "owner@brand.invalid",
        provider: "MOCK",
        excludeInternal: true,
        retentionDays: 90,
      },
      [],
    ),
    /pilot access/,
  );
  const connection = await prisma.smsConnection.findFirstOrThrow({
    where: { organizationId: f.orgA },
  });
  const smsBefore = await prisma.smsMessage.count();
  await prisma.$transaction(async (tx) => {
    assert.equal(
      await receiveSms(tx, connection, {
        MessageSid: "disabled-pilot-fixture",
        From: "+15005550007",
        Body: "not captured",
      }),
      null,
    );
    assert.equal(
      await receiveSms(tx, connection, {
        MessageSid: "disabled-pilot-stop-fixture",
        From: "+15005550007",
        Body: "STOP",
      }),
      null,
    );
  });
  assert.equal(await prisma.smsMessage.count(), smsBefore);
  assert.equal(
    (
      await prisma.smsConsent.findUniqueOrThrow({
        where: {
          organizationId_phone: {
            organizationId: f.orgA,
            phone: "+15005550007",
          },
        },
      })
    ).status,
    "OPTED_OUT",
  );
  console.log(
    "PASS: Echo-only migration and idempotent replay, all other feature rows and contacts/history preserved; disabled tenant rejects sync/OAuth/send/ingestion/suggestions before work; signed inbound opt-out still persists without SMS capture.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
