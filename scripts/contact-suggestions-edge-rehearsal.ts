import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma, runWithOrganizationStateAccess } from "../lib/prisma";
import { ingestMailChanges } from "../lib/crm/mail/sync";
import { reviewContactSuggestion } from "../lib/crm/contactSuggestions";
import { suggestionKey } from "../lib/crm/contactSuggestionRules";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated only");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    fixture = JSON.parse(
      readFileSync("output/contact-suggestions-fixture.json", "utf8"),
    ),
    actor = { organizationId: f.orgA, userId: f.userA };
  await runWithOrganizationStateAccess(f.orgA, async () => {
    const connection = await prisma.mailboxConnection.findUniqueOrThrow({
        where: { id: fixture.connectionId },
      }),
      email = `edge-${randomUUID()}@restaurant.invalid`,
      target = {
        accountType: "WHOLESALE" as const,
        accountId: fixture.account.id,
      },
      key = suggestionKey("EMAIL", email);
    await prisma.$transaction((tx) =>
      ingestMailChanges(tx, actor, connection, [
        {
          id: email,
          kind: "EMAIL",
          at: new Date().toISOString(),
          subject: "Private edge fixture",
          participants: [email, connection.email],
          direction: "INBOUND",
        },
      ]),
    );
    const inactive = await prisma.locationContact.create({
      data: {
        organizationId: f.orgA,
        wholesaleAccountId: fixture.account.id,
        name: "Inactive duplicate fixture",
        email,
        active: false,
      },
    });
    await assert.rejects(
      () =>
        prisma.$transaction(
          (tx) =>
            reviewContactSuggestion(tx, actor, {
              key,
              operation: "CREATE",
              ...target,
              name: "Duplicate",
              confirmed: "true",
            }),
          { timeout: 30000 },
        ),
      /inactive contact/,
    );
    assert.equal(
      await prisma.locationContact.count({
        where: { organizationId: f.orgA, email },
      }),
      1,
    );
    await prisma.locationContact.update({
      where: { id: inactive.id },
      data: { email: `old-${email}` },
    });
    await assert.rejects(
      () =>
        prisma.$transaction(
          (tx) =>
            reviewContactSuggestion(tx, actor, {
              key,
              operation: "CREATE",
              accountType: "WHOLESALE",
              accountId: "missing-fixture-account",
              name: "Invalid",
              confirmed: "true",
            }),
          { timeout: 30000 },
        ),
      /Account not found/,
    );
    const foreign = await prisma.locationContact.create({
      data: {
        organizationId: f.orgB,
        wholesaleAccountId: fixture.account.id,
        name: "Foreign fixture",
      },
    });
    await assert.rejects(
      () =>
        prisma.$transaction(
          (tx) =>
            reviewContactSuggestion(tx, actor, {
              key,
              operation: "LINK",
              ...target,
              contactId: foreign.id,
              confirmed: "true",
            }),
          { timeout: 30000 },
        ),
      /active contact/,
    );
    console.log(
      "PASS: inactive identity blocks duplicates, nonexistent account rejected, foreign-tenant contact link rejected.",
    );
  });
}
main().finally(() => prisma.$disconnect());
