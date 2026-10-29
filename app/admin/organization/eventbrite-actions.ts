"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import { getAppEnvironment } from "../../../lib/appEnvironment";
import {
  encryptCalendarToken,
  decryptCalendarToken,
} from "../../../lib/calendar/crypto";
import {
  EventbriteProvider,
  MockEventProvider,
} from "../../../lib/crm/eventbrite";
import type { CrmActionResult } from "../../../lib/crm/actionResult";
export async function configureEventbrite(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (user.role !== "ADMIN")
    return {
      error: "An organization administrator must configure Eventbrite.",
    };
  const mock = form.get("mock") === "on";
  if (mock && getAppEnvironment() === "production")
    return { error: "Demo imports are unavailable in production." };
  const externalOrganizationId = mock
      ? "MOCK"
      : String(form.get("externalOrganizationId") ?? "").trim(),
    token = String(form.get("token") ?? "").trim();
  if (
    !mock &&
    (!/^\d+$/.test(externalOrganizationId) ||
      token.length < 10 ||
      token.length > 500)
  )
    return { error: "Enter the Eventbrite organization ID and private token." };
  if (!mock) {
    try {
      await new EventbriteProvider(token, externalOrganizationId).page(null);
    } catch {
      return {
        error: "Could not verify access to that Eventbrite organization.",
      };
    }
  }
  await prisma.$transaction(async (db) => {
    await db.eventbriteConnection.upsert({
      where: { organizationId: actor.organizationId },
      create: {
        organizationId: actor.organizationId,
        externalOrganizationId,
        mock,
        tokenEncrypted: mock ? null : encryptCalendarToken(token),
      },
      update: {
        externalOrganizationId,
        mock,
        tokenEncrypted: mock ? null : encryptCalendarToken(token),
        enabled: true,
        cursor: null,
      },
    });
    await db.organizationAuditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "ORGANIZATION_UPDATED",
        metadata: {
          kind: "EVENTBRITE_CONFIGURED",
          mock,
          externalOrganizationId,
        },
      },
    });
  });
  revalidatePath("/admin/organization");
  return {
    success: mock
      ? "Demo event connection configured."
      : "Eventbrite connection verified and saved.",
  };
}
export async function disconnectEventbrite(): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (user.role !== "ADMIN")
    return {
      error: "An organization administrator must disconnect Eventbrite.",
    };
  await prisma.eventbriteConnection.updateMany({
    where: { organizationId: actor.organizationId },
    data: { enabled: false, tokenEncrypted: null, cursor: null },
  });
  revalidatePath("/admin/organization");
  return { success: "Eventbrite disconnected. Imported records are retained." };
}
export async function syncEventbrite(): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (user.role !== "ADMIN")
    return { error: "An organization administrator must import events." };
  const connection = await prisma.eventbriteConnection.findUnique({
    where: { organizationId: actor.organizationId },
  });
  if (!connection?.enabled) return { error: "Configure Eventbrite first." };
  if (connection.mock && getAppEnvironment() === "production")
    return { error: "Demo imports are unavailable in production." };
  let page;
  try {
    page = await (
      connection.mock
        ? new MockEventProvider()
        : new EventbriteProvider(
            decryptCalendarToken(connection.tokenEncrypted!),
            connection.externalOrganizationId,
          )
    ).page(connection.cursor);
  } catch {
    return {
      error:
        "Eventbrite sync failed. The saved cursor was retained; verify the connection and retry.",
    };
  }
  const applied = await prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`events:${actor.organizationId}`},0))`;
      const current = await db.eventbriteConnection.findUnique({
        where: { id: connection.id },
      });
      if (
        !current?.enabled ||
        current.updatedAt.getTime() !== connection.updatedAt.getTime()
      )
        return false;
      for (const event of page.events) {
        const key = {
          organizationId: actor.organizationId,
          source: "EVENTBRITE" as const,
          externalId: `${connection.externalOrganizationId}:${event.id}`,
        };
        const old = await db.eventShift.findUnique({
          where: { organizationId_source_externalId: key },
        });
        if (old) {
          await db.eventShift.update({
            where: { id: old.id },
            data: {
              details: {
                ...(old.details as Record<string, never>),
                providerSnapshot: { ...event, mock: connection.mock },
              },
              version: { increment: 1 },
            },
          });
        } else {
          await db.eventShift.create({
            data: {
              ...key,
              title: event.title.slice(0, 200),
              startsAt: new Date(event.startsAt),
              endsAt: new Date(event.endsAt),
              location: event.location.slice(0, 500),
              status: event.status,
              details: {
                providerSnapshot: { ...event, mock: connection.mock },
              },
            },
          });
        }
      }
      await db.eventbriteConnection.update({
        where: { id: connection.id },
        data: { cursor: page.cursor, lastSyncAt: new Date() },
      });
      await db.organizationAuditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          metadata: {
            kind: "EVENTBRITE_IMPORTED",
            count: page.events.length,
            more: Boolean(page.cursor),
          },
        },
      });
      return true;
    },
    { timeout: 25000 },
  );
  revalidatePath("/");
  revalidatePath("/admin/organization");
  return applied
    ? {
        success: `${page.events.length} event records reviewed. ${page.cursor ? "More pages remain; import the next page." : "Import complete."} Existing local schedules and outcomes were kept.`,
      }
    : {
        error:
          "Connection changed during import. Retry with the current connection.",
      };
}
