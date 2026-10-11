import {
  accountWhere,
  visibleActivityWhere,
  type CrmActor,
  type CrmAccount,
  type CrmDb,
} from "./activity";
export function relationshipIndicators(input: {
  now: Date;
  lastMeaningful: Date | null;
  lastVisit: Date | null;
  overdue: number;
  contacts: number;
  contactDays?: number;
}) {
  const threshold = input.contactDays ?? 30;
  const days = input.lastMeaningful
    ? Math.max(
        0,
        Math.floor(
          (input.now.getTime() - input.lastMeaningful.getTime()) / 86400000,
        ),
      )
    : null;
  const reasons: string[] = [];
  if (input.overdue)
    reasons.push(
      `${input.overdue} overdue commitment${input.overdue === 1 ? "" : "s"}.`,
    );
  if (!input.contacts) reasons.push("No active contact recorded.");
  if (days !== null && days > threshold)
    reasons.push(
      `Last recorded meaningful interaction was ${days} days ago (threshold ${threshold}).`,
    );
  return {
    status: reasons.length
      ? "Needs attention"
      : days === null
        ? "Insufficient relationship evidence"
        : "No current relationship alerts",
    reasons,
    nextAction: input.overdue
      ? "Review overdue Worklist commitments"
      : !input.contacts
        ? "Identify a buyer or decision-maker"
        : days === null
          ? "Record a meaningful interaction"
          : days > threshold
            ? "Contact the account and confirm its next need"
            : "Review open deals and upcoming work",
    days,
  };
}
export async function getAccountBriefing(
  db: CrmDb,
  actor: CrmActor,
  account: CrmAccount,
  now = new Date(),
) {
  const where = {
    organizationId: actor.organizationId,
    ...accountWhere(account),
  };
  const [contact, meaningful, visit, tasks, completed, contacts, deals] =
    await Promise.all([
      db.accountActivity.findFirst({
        where: {
          AND: [visibleActivityWhere(actor), accountWhere(account)],
          activityType: {
            in: [
              "EMAIL",
              "SMS",
              "PHONE_CALL",
              "CUSTOMER_INTERACTION",
              "VIRTUAL_MEETING",
            ],
          },
          occurredAt: { lte: now },
        },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      db.accountActivity.findFirst({
        where: {
          AND: [visibleActivityWhere(actor), accountWhere(account)],
          meaningful: true,
          occurredAt: { lte: now },
        },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      db.loggedVisit.findFirst({
        where: { ...where, visitAt: { lte: now } },
        orderBy: { visitAt: "desc" },
        select: { visitAt: true },
      }),
      db.worklistItem.findMany({
        where: { ...where, status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { dueDate: "asc" },
        take: 50,
        select: { id: true, title: true, dueDate: true },
      }),
      db.worklistItem.findFirst({
        where: { ...where, status: "COMPLETED", completedAt: { lte: now } },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
      db.locationContact.count({ where: { ...where, active: true } }),
      db.deal.findMany({
        where: { ...where, status: "OPEN" },
        take: 20,
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, nextAction: true },
      }),
    ]);
  const lastMeaningful =
    [meaningful?.occurredAt, visit?.visitAt]
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    lastContact:
      [contact?.occurredAt, visit?.visitAt]
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    lastMeaningful,
    lastVisit: visit?.visitAt ?? null,
    lastFollowUp: completed?.completedAt ?? null,
    tasks,
    deals,
    indicators: relationshipIndicators({
      now,
      lastMeaningful,
      lastVisit: visit?.visitAt ?? null,
      overdue: tasks.filter((t) => t.dueDate && t.dueDate < now).length,
      contacts,
    }),
  };
}
