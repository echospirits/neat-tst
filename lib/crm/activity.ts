import { AccountActivityType, Prisma } from "@prisma/client";
import { z } from "zod";

export type CrmActor = { organizationId: string; userId: string };
export type CrmDb = Prisma.TransactionClient;
export class CrmError extends Error {}
export const accountInput = z.object({
  accountType: z.enum(["AGENCY", "WHOLESALE"]),
  accountId: z.string().min(1).max(100),
});
export type CrmAccount = z.infer<typeof accountInput>;
export const accountWhere = (account: CrmAccount) =>
  account.accountType === "AGENCY"
    ? { agencyId: account.accountId }
    : { wholesaleAccountId: account.accountId };
export const accountHref = (account: CrmAccount) =>
  `/${account.accountType === "AGENCY" ? "agencies" : "wholesale"}/${encodeURIComponent(account.accountId)}`;
export const accountQuery = (account: CrmAccount) =>
  new URLSearchParams(account).toString();
export const activityLabels: Record<AccountActivityType, string> = {
  EMAIL_INITIATED: "Email initiated",
  CALL_INITIATED: "Call initiated",
  EMAIL: "Email",
  SMS: "Text message",
  PHONE_CALL: "Phone call",
  VIRTUAL_MEETING: "Virtual meeting",
  CALENDAR_MEETING: "Calendar meeting",
  INTERNAL_NOTE: "Internal note",
  CUSTOMER_INTERACTION: "Customer interaction",
  SAMPLE_DELIVERY: "Sample delivery",
  TASTING: "Tasting",
  TRAINING: "Training",
  SALES_PRESENTATION: "Sales presentation",
  MENU_PLACEMENT: "Menu placement",
  MERCHANDISING: "Merchandising",
  SYSTEM_EVENT: "System event",
};
export const manualActivityTypes = [
  "PHONE_CALL",
  "SMS",
  "EMAIL",
  "VIRTUAL_MEETING",
  "INTERNAL_NOTE",
  "CUSTOMER_INTERACTION",
  "SAMPLE_DELIVERY",
  "TASTING",
  "TRAINING",
  "SALES_PRESENTATION",
  "MENU_PLACEMENT",
  "MERCHANDISING",
] as const;
export const manualActivityInput = accountInput.extend({
  activityType: z.enum(manualActivityTypes),
  summary: z.string().trim().min(1).max(500),
  outcome: z.string().trim().max(4000).optional(),
  occurredAt: z.coerce.date(),
  contactId: z.string().max(100).optional(),
  visibility: z.enum(["PRIVATE", "TEAM"]).default("TEAM"),
  meaningful: z.boolean().default(false),
  direction: z.enum(["INBOUND", "OUTBOUND", "NONE"]).default("NONE"),
  submissionKey: z.string().uuid(),
});
export function visibleActivityWhere(
  actor: CrmActor,
): Prisma.AccountActivityWhereInput {
  return {
    organizationId: actor.organizationId,
    OR: [{ visibility: "TEAM" }, { createdByUserId: actor.userId }],
  };
}
export async function assertAccount(db: CrmDb, account: CrmAccount) {
  const row =
    account.accountType === "AGENCY"
      ? await db.agency.findUnique({
          where: { id: account.accountId },
          select: { id: true, name: true },
        })
      : await db.wholesaleAccount.findFirst({
          where: { id: account.accountId, mergedIntoId: null },
          select: { id: true, name: true },
        });
  if (!row) throw new CrmError("Account not found.");
  return row;
}
export async function assertContact(
  db: CrmDb,
  actor: CrmActor,
  account: CrmAccount,
  contactId?: string | null,
) {
  if (!contactId) return;
  if (
    !(await db.locationContact.findFirst({
      where: {
        id: contactId,
        organizationId: actor.organizationId,
        active: true,
        ...accountWhere(account),
      },
      select: { id: true },
    }))
  )
    throw new CrmError("Choose an active contact from this account.");
}
export async function logActivity(
  db: CrmDb,
  actor: CrmActor,
  raw: unknown,
  now = new Date(),
) {
  const input = manualActivityInput.parse(raw);
  if (input.occurredAt.getTime() > now.getTime() + 5 * 60_000)
    throw new CrmError("Log completed activity using a past or current time.");
  await assertAccount(db, input);
  await assertContact(db, actor, input, input.contactId);
  return db.accountActivity.upsert({
    where: {
      organizationId_sourceKey: {
        organizationId: actor.organizationId,
        sourceKey: `manual:${actor.userId}:${input.submissionKey}`,
      },
    },
    update: {},
    create: {
      organizationId: actor.organizationId,
      createdByUserId: actor.userId,
      ...accountWhere(input),
      contactId: input.contactId || null,
      activityType: input.activityType,
      summary: input.summary,
      outcome: input.outcome || null,
      occurredAt: input.occurredAt,
      meaningful: input.activityType !== "INTERNAL_NOTE" && input.meaningful,
      visibility: input.visibility,
      direction: input.direction,
      source: "MANUAL",
      sourceKey: `manual:${actor.userId}:${input.submissionKey}`,
    },
  });
}
export async function correctActivity(
  db: CrmDb,
  actor: CrmActor,
  raw: unknown,
) {
  const input = accountInput
    .extend({
      id: z.string().min(1),
      contactId: z.string().optional(),
      visibility: z.enum(["PRIVATE", "TEAM"]),
    })
    .parse(raw);
  const activity = await db.accountActivity.findFirst({
    where: {
      id: input.id,
      organizationId: actor.organizationId,
      createdByUserId: actor.userId,
    },
  });
  if (!activity) throw new CrmError("Activity not found or not owned by you.");
  await assertAccount(db, input);
  await assertContact(db, actor, input, input.contactId);
  const after = {
    agencyId: input.accountType === "AGENCY" ? input.accountId : null,
    wholesaleAccountId:
      input.accountType === "WHOLESALE" ? input.accountId : null,
    contactId: input.contactId || null,
    visibility: input.visibility,
    matchStatus: "CORRECTED",
  };
  await db.accountActivity.updateMany({
    where: {
      id: activity.id,
      organizationId: actor.organizationId,
      createdByUserId: actor.userId,
    },
    data: after,
  });
  await db.activityAudit.create({
    data: {
      organizationId: actor.organizationId,
      activityId: activity.id,
      actorUserId: actor.userId,
      action: "ASSOCIATION_CORRECTED",
      before: {
        agencyId: activity.agencyId,
        wholesaleAccountId: activity.wholesaleAccountId,
        contactId: activity.contactId,
        visibility: activity.visibility,
      },
      after,
    },
  });
}
export type TimelineEntry = {
  id: string;
  at: Date;
  type: string;
  title: string;
  detail: string | null;
  source: string;
  ownerId: string | null;
  contactId: string | null;
  private: boolean;
  meaningful: boolean;
  href?: string;
};
export function timelineCursorWhere(
  field: string,
  prefix: string,
  before?: Date,
  beforeId?: string,
) {
  if (!before) return {};
  if (!beforeId) return { [field]: { lt: before } };
  // IDs are prefixed for source identity. Keep equal-time rows on the next page.
  const equal = beforeId.startsWith(prefix)
    ? { [field]: before, id: { lt: beforeId.slice(prefix.length) } }
    : prefix < beforeId
      ? { [field]: before }
      : null;
  return { OR: [{ [field]: { lt: before } }, ...(equal ? [equal] : [])] };
}
export async function readTimeline(
  db: CrmDb,
  actor: CrmActor,
  account: CrmAccount,
  filter: {
    type?: string;
    before?: Date;
    beforeId?: string;
    contactId?: string;
    ownerId?: string;
    source?: string;
  } = {},
) {
  const where = accountWhere(account);
  // Each source is limited after authorization/filtering. Merge then paginate globally.
  const activities = await db.accountActivity.findMany({
    where: {
      AND: [
        visibleActivityWhere(actor),
        where,
        timelineCursorWhere(
          "occurredAt",
          "activity:",
          filter.before,
          filter.beforeId,
        ),
      ],
      ...(filter.type
        ? { activityType: filter.type as AccountActivityType }
        : {}),
      ...(filter.contactId ? { contactId: filter.contactId } : {}),
      ...(filter.ownerId ? { createdByUserId: filter.ownerId } : {}),
      ...(filter.source ? { source: filter.source } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 51,
  });
  const includeLegacy = !filter.type && !filter.source && !filter.contactId;
  const [visits, tasks] = includeLegacy
    ? await Promise.all([
        db.loggedVisit.findMany({
          where: {
            organizationId: actor.organizationId,
            ...where,
            AND: [
              timelineCursorWhere(
                "visitAt",
                "visit:",
                filter.before,
                filter.beforeId,
              ),
            ],
            ...(filter.ownerId ? { createdByUserId: filter.ownerId } : {}),
          },
          orderBy: [{ visitAt: "desc" }, { id: "desc" }],
          take: 51,
        }),
        db.worklistItem.findMany({
          where: {
            organizationId: actor.organizationId,
            status: "COMPLETED",
            ...where,
            completedAt: { not: null },
            AND: [
              timelineCursorWhere(
                "completedAt",
                "task:",
                filter.before,
                filter.beforeId,
              ),
            ],
            ...(filter.ownerId ? { completedByUserId: filter.ownerId } : {}),
          },
          orderBy: [{ completedAt: "desc" }, { id: "desc" }],
          take: 51,
        }),
      ])
    : [[], []];
  const entries: TimelineEntry[] = [
    ...activities.map((a) => ({
      id: `activity:${a.id}`,
      at: a.occurredAt,
      type: a.activityType,
      title: a.summary || activityLabels[a.activityType],
      detail: a.outcome,
      source: a.source,
      ownerId: a.createdByUserId,
      contactId: a.contactId,
      private: a.visibility === "PRIVATE",
      meaningful: a.meaningful,
    })),
    ...visits.map((v) => ({
      id: `visit:${v.id}`,
      at: v.visitAt,
      type: "PHYSICAL_VISIT",
      title: "Physical visit",
      detail: v.summary,
      source: "VISIT",
      ownerId: v.createdByUserId,
      contactId: v.contactId,
      private: false,
      meaningful: true,
      href: `/visits/${v.id}/edit`,
    })),
    ...tasks.map((t) => ({
      id: `task:${t.id}`,
      at: t.completedAt!,
      type: "TASK_COMPLETION",
      title: `Completed: ${t.title}`,
      detail: null,
      source: "WORKLIST",
      ownerId: t.completedByUserId,
      contactId: null,
      private: false,
      meaningful: false,
      href: "/alerts?status=COMPLETED",
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id));
  return { entries: entries.slice(0, 50), hasMore: entries.length > 50 };
}
