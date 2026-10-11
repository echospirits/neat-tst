import { retainedDays } from "../analytics/ohio";
import { formatDateInputValue } from "../dateTime";
import { z } from "zod";
import {
  accountInput,
  assertAccount,
  CrmError,
  type CrmActor,
  type CrmDb,
} from "./activity";
const numberOrNull = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
  z.number().finite().nonnegative().max(1000000).nullable(),
);
export const eventDetailsInput = z.object({
  products: z.string().trim().max(3000).default(""),
  samples: numberOrNull,
  cost: numberOrNull,
  outcomes: z.string().trim().max(6000).default(""),
  photoLinks: z
    .string()
    .trim()
    .max(3000)
    .default("")
    .refine(
      (s) =>
        s
          .split("\n")
          .filter(Boolean)
          .every((v) => {
            try {
              return new URL(v).protocol === "https:";
            } catch {
              return false;
            }
          }),
      "Photo links must use HTTPS.",
    ),
  windowDays: z.coerce.number().int().min(7).max(90).default(30),
  comparison: z
    .enum(["PREVIOUS_PERIOD", "PREVIOUS_YEAR"])
    .default("PREVIOUS_PERIOD"),
});
export const eventInput = z
  .object({
    id: z.string().max(100).optional(),
    version: z.coerce.number().int().min(0),
    submissionKey: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    location: z.string().trim().max(500),
    accountType: z.enum(["AGENCY", "WHOLESALE"]).optional(),
    accountId: z.string().max(100).optional(),
    staffUserIds: z.array(z.string().min(1).max(100)).max(30),
    eventType: z.enum([
      "TASTING",
      "TRAINING",
      "CONSUMER",
      "ACCOUNT",
      "TOUR",
      "SAMPLING",
      "PROMOTION",
    ]),
    status: z.enum(["open", "confirmed", "completed", "cancelled"]),
    attendance: numberOrNull,
    details: eventDetailsInput,
  })
  .refine(
    (v) =>
      v.endsAt > v.startsAt &&
      v.endsAt.getTime() - v.startsAt.getTime() <= 7 * 86400000,
    "End must follow start within seven days.",
  );
export async function saveEvent(db: CrmDb, actor: CrmActor, raw: unknown) {
  const input = eventInput.parse(raw);
  if (input.accountId) await assertAccount(db, accountInput.parse(input));
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`events:${actor.organizationId}`},0))`;
  const old = input.id
    ? await db.eventShift.findFirst({
        where: { id: input.id, organizationId: actor.organizationId },
      })
    : await db.eventShift.findUnique({
        where: {
          organizationId_submissionKey: {
            organizationId: actor.organizationId,
            submissionKey: input.submissionKey,
          },
        },
      });
  if (!input.id && old) return old;
  if (input.id && (!old || old.version !== input.version))
    throw new CrmError("This event changed. Reload before saving.");
  const staff = [...new Set(input.staffUserIds)];
  const valid = await db.user.count({
    where: {
      id: { in: staff },
      organizationId: actor.organizationId,
      isActive: true,
      role: { not: "PLATFORM_ADMIN" },
    },
  });
  if (valid !== staff.length)
    throw new CrmError("Choose active staff in this organization.");
  if (staff.length && !["completed", "cancelled"].includes(input.status)) {
    const conflict = await db.eventShift.findFirst({
      where: {
        organizationId: actor.organizationId,
        id: { not: input.id },
        status: { in: ["open", "confirmed"] },
        staffUserIds: { hasSome: staff },
        startsAt: { lt: input.endsAt },
        OR: [
          { endsAt: { gt: input.startsAt } },
          { endsAt: null, startsAt: { gte: input.startsAt } },
        ],
      },
    });
    if (conflict)
      throw new CrmError(
        "A selected staff member already has an overlapping event. Adjust the staff or time.",
      );
  }
  const data = {
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location,
    accountType: input.accountId ? input.accountType : null,
    externalAccountId: input.accountId || null,
    staffUserIds: staff,
    assignedUserId: staff[0] ?? null,
    eventType: input.eventType,
    status: input.status,
    attendance: input.attendance === null ? null : Math.floor(input.attendance),
    details: {
      ...((old?.details as Record<string, never>) ?? {}),
      ...input.details,
    },
  };
  const event = old
    ? await db.eventShift.update({
        where: { id: old.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await db.eventShift.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          submissionKey: input.submissionKey,
        },
      });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "EVENT_SAVED",
        eventId: event.id,
        version: event.version,
        status: event.status,
      },
    },
  });
  return event;
}
export function eventWindows(
  date: Date,
  days: number,
  comparison: "PREVIOUS_PERIOD" | "PREVIOUS_YEAR",
) {
  const afterStart = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
      ),
    ),
    afterEnd = new Date(afterStart.getTime() + days * 86400000);
  const beforeEnd =
    comparison === "PREVIOUS_PERIOD"
      ? new Date(afterStart.getTime() - 86400000)
      : new Date(
          Date.UTC(
            afterStart.getUTCFullYear() - 1,
            afterStart.getUTCMonth(),
            afterStart.getUTCDate() + days,
          ),
        );
  const beforeStart = new Date(beforeEnd.getTime() - days * 86400000);
  return { beforeStart, beforeEnd, afterStart, afterEnd };
}
export async function eventSalesComparison(
  db: CrmDb,
  organizationId: string,
  event: {
    startsAt: Date;
    accountType: string | null;
    externalAccountId: string | null;
    details: unknown;
  },
) {
  if (
    !["WHOLESALE", "AGENCY"].includes(event.accountType ?? "") ||
    !event.externalAccountId
  )
    return {
      available: false,
      reason: "Link an account to compare observed sales.",
    };
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  const eventDay = new Date(formatDateInputValue(event.startsAt, org.timezone));
  const details = eventDetailsInput.safeParse(event.details);
  const d = details.success
    ? details.data
    : { windowDays: 30, comparison: "PREVIOUS_PERIOD" as const };
  const windows = eventWindows(eventDay, d.windowDays, d.comparison);
  if (event.accountType === "AGENCY") {
    const [agency, products] = await Promise.all([
      db.agency.findUnique({
        where: { id: event.externalAccountId },
        select: { agencyId: true, state: true },
      }),
      db.organizationProduct.findMany({
        where: {
          organizationId,
          market: "OH",
          status: { in: ["OWNED", "REPRESENTED"] },
        },
        select: { externalItemCode: true },
      }),
    ]);
    if (agency?.state !== "OH" || !products.length)
      return {
        available: false,
        reason:
          "Ohio agency sales and configured tenant products are required.",
      };
    const totals = await Promise.all(
      ["before", "after"].map(async (side) => {
        const start =
            side === "before" ? windows.beforeStart : windows.afterStart,
          end = side === "before" ? windows.beforeEnd : windows.afterEnd;
        const days = await retainedDays(
          db,
          "retail",
          start.toISOString().slice(0, 10),
          new Date(end.getTime() - 86400000).toISOString().slice(0, 10),
        );
        const sales = await db.ohlqAnnualSalesRow.aggregate({
          where: {
            agencyId: agency.agencyId,
            brand: { in: products.map((p) => p.externalItemCode) },
            reportDate: { in: days.map((d) => new Date(d)) },
          },
          _sum: { retailBottlesSold: true },
        });
        return {
          coveredDays: days.length,
          bottles:
            days.length === d.windowDays
              ? (sales._sum.retailBottlesSold ?? 0)
              : null,
        };
      }),
    );
    return {
      available: true,
      days: d.windowDays,
      comparison: d.comparison,
      before: totals[0],
      after: totals[1],
      windows,
    };
  }
  const totals = await Promise.all(
    ["before", "after"].map(async (side) => {
      const start =
          side === "before" ? windows.beforeStart : windows.afterStart,
        end = side === "before" ? windows.beforeEnd : windows.afterEnd;
      const [days, sales] = await Promise.all([
        db.wholesaleSalesLedgerDay.count({
          where: { organizationId, reportDate: { gte: start, lt: end } },
        }),
        db.accountSalesEvent.aggregate({
          where: {
            organizationId,
            wholesaleAccountId: event.externalAccountId!,
            isTenantProduct: true,
            sourceKey: { startsWith: "DAILY_V3:" },
            reportDate: { gte: start, lt: end },
          },
          _sum: { bottles: true },
        }),
      ]);
      return {
        coveredDays: days,
        bottles: days === d.windowDays ? (sales._sum.bottles ?? 0) : null,
      };
    }),
  );
  return {
    available: true,
    days: d.windowDays,
    comparison: d.comparison,
    before: totals[0],
    after: totals[1],
    windows,
  };
}
