import type { Prisma } from "@prisma/client";
import type { CrmActor, CrmDb } from "./activity";
export async function lockAccountContacts(db: CrmDb, organizationId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`contact-relationships:${organizationId}`}, 0))`;
}
// Shared persistence for manual/imported contacts and reviewed communication suggestions.
export async function createAccountContactRecord(
  db: CrmDb,
  actor: CrmActor,
  data: Omit<
    Prisma.LocationContactUncheckedCreateInput,
    "organizationId" | "createdByUserId"
  >,
) {
  await lockAccountContacts(db, actor.organizationId);
  return db.locationContact.create({
    data: {
      ...data,
      organizationId: actor.organizationId,
      createdByUserId: actor.userId,
    },
  });
}
