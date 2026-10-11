import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CrmError, type CrmActor, type CrmDb } from "./activity";
export const contactRelationshipInput = z.object({
  id: z.string().min(1),
  otherId: z.string().min(1),
  operation: z.enum(["LINK", "MERGE"]),
});
export const contactProfileInput = z.object({
  relationshipOwnerId: z.string().max(100).default(""),
  phoneAliases: z.preprocess(
    (v) =>
      String(v ?? "")
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    z
      .array(
        z
          .string()
          .regex(/^\+?[0-9 ()-]{7,25}$/)
          .transform((v) => {
            const n = v.replace(/\D/g, "");
            return n.length === 10 ? `+1${n}` : `+${n}`;
          }),
      )
      .max(10),
  ),
  emailAliases: z.preprocess(
    (v) =>
      String(v ?? "")
        .split(/[,;\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    z.array(z.string().email().max(320)).max(10),
  ),
  preferredChannel: z
    .enum(["", "EMAIL", "PHONE", "SMS", "IN_PERSON"])
    .default(""),
  decisionAuthority: z
    .enum(["", "DECISION_MAKER", "BUYER", "INFLUENCER", "COORDINATOR", "OTHER"])
    .default(""),
  influenceLevel: z.enum(["", "HIGH", "MEDIUM", "LOW"]).default(""),
});
// Linking preserves per-account roles. Merging is only for duplicate records at one account.
export async function relateContacts(db: CrmDb, actor: CrmActor, raw: unknown) {
  const input = contactRelationshipInput.parse(raw);
  if (input.id === input.otherId)
    throw new CrmError("Choose a different contact.");
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`contact-relationships:${actor.organizationId}`}, 0))`;
  const rows = await db.locationContact.findMany({
    where: {
      organizationId: actor.organizationId,
      id: { in: [input.id, input.otherId] },
      active: true,
      mergedIntoContactId: null,
    },
  });
  const target = rows.find((row) => row.id === input.id),
    source = rows.find((row) => row.id === input.otherId);
  if (!target || !source)
    throw new CrmError("Choose two active contacts in your organization.");
  if (
    input.operation === "MERGE" &&
    (source.agencyId !== target.agencyId ||
      source.wholesaleAccountId !== target.wholesaleAccountId)
  )
    throw new CrmError(
      "Contacts at different accounts must be linked, not merged.",
    );
  const personKey = target.personKey ?? source.personKey ?? randomUUID();
  await db.locationContact.updateMany({
    where: {
      organizationId: actor.organizationId,
      OR: [
        { id: { in: [input.id, input.otherId] } },
        {
          personKey: {
            in: [source.personKey, target.personKey].filter(
              (key): key is string => Boolean(key),
            ),
          },
        },
      ],
    },
    data: { personKey },
  });
  if (input.operation === "MERGE") {
    // Keep the source row as an inactive historical record and move active references.
    const aliases = [
      ...new Set(
        [...target.emailAliases, ...source.emailAliases, source.email]
          .filter((email): email is string => Boolean(email))
          .map((email) => email.toLowerCase()),
      ),
    ].filter((email) => email !== target.email?.toLowerCase());
    await db.locationContact.updateMany({
      where: { organizationId: actor.organizationId, id: target.id },
      data: {
        phoneAliases: [
          ...new Set(
            [
              ...target.phoneAliases,
              ...source.phoneAliases,
              source.phone,
            ].filter((v): v is string => Boolean(v)),
          ),
        ].filter((v) => v !== target.phone),
        emailAliases: aliases,
        email: target.email || source.email,
        phone: target.phone || source.phone,
        isPrimary: target.isPrimary || source.isPrimary,
      },
    });
    await db.accountActivity.updateMany({
      where: { organizationId: actor.organizationId, contactId: source.id },
      data: { contactId: target.id },
    });
    const activityRows = await db.accountActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        contactIds: { has: source.id },
      },
      select: { id: true, contactIds: true },
    });
    for (const row of activityRows)
      await db.accountActivity.updateMany({
        where: { organizationId: actor.organizationId, id: row.id },
        data: {
          contactIds: [
            ...new Set(
              row.contactIds.map((id) => (id === source.id ? target.id : id)),
            ),
          ],
        },
      });
    await db.smsMessage.updateMany({
      where: { organizationId: actor.organizationId, contactId: source.id },
      data: { contactId: target.id },
    });
    await db.loggedVisit.updateMany({
      where: { organizationId: actor.organizationId, contactId: source.id },
      data: { contactId: target.id },
    });
    const links = await db.loggedVisitContact.findMany({
      where: { organizationId: actor.organizationId, contactId: source.id },
    });
    await db.loggedVisitContact.createMany({
      data: links.map((link) => ({
        organizationId: actor.organizationId,
        loggedVisitId: link.loggedVisitId,
        contactId: target.id,
      })),
      skipDuplicates: true,
    });
    await db.loggedVisitContact.deleteMany({
      where: { organizationId: actor.organizationId, contactId: source.id },
    });
    await db.locationContact.updateMany({
      where: { organizationId: actor.organizationId, id: source.id },
      data: { active: false, isPrimary: false, mergedIntoContactId: target.id },
    });
  }
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: `CONTACT_${input.operation}`,
        targetId: target.id,
        sourceId: source.id,
        personKey,
        before: JSON.parse(JSON.stringify({ target, source })),
      },
    },
  });
  return personKey;
}
