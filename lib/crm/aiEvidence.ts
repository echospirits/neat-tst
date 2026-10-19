import {
  accountWhere,
  assertAccount,
  type CrmActor,
  type CrmAccount,
  type CrmDb,
} from "./activity";
import { accountWorklistWhere } from "../accountWorklist";
import type { AssistantEvidence } from "./ai";
import { accountHref } from "./activity";
export async function loadAssistantEvidence(
  db: CrmDb,
  actor: CrmActor,
  account: CrmAccount,
  includePrivate = false,
) {
  const features = await db.organizationFeature.findMany({
    where: { organizationId: actor.organizationId, enabled: true },
    select: { featureKey: true },
  });
  const record = await assertAccount(db, account),
    href = accountHref(account);
  const [activities, visits, tasks, plan] = await Promise.all([
    db.accountActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        ...accountWhere(account),
        OR: [
          { visibility: "TEAM" },
          ...(includePrivate ? [{ createdByUserId: actor.userId }] : []),
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
      select: {
        id: true,
        activityType: true,
        summary: true,
        outcome: true,
        occurredAt: true,
        threadId: true,
      },
    }),
    db.loggedVisit.findMany({
      where: { organizationId: actor.organizationId, ...accountWhere(account) },
      orderBy: { visitAt: "desc" },
      take: 10,
      select: { id: true, summary: true, outcomes: true, visitAt: true },
    }),
    db.worklistItem.findMany({
      where: accountWorklistWhere({
        ...account,
        organizationId: actor.organizationId,
        enabledFeatures: new Set(features.map((f) => f.featureKey)),
      }),
      orderBy: { dueDate: "asc" },
      take: 10,
      select: { id: true, title: true, dueDate: true, updatedAt: true },
    }),
    db.organizationAccountOverlay.findUnique({
      where: {
        organizationId_accountType_externalAccountId: {
          organizationId: actor.organizationId,
          accountType: account.accountType,
          externalAccountId: account.accountId,
        },
      },
      select: {
        salesPlan: true,
        salesStatus: true,
        salesStatusUpdatedAt: true,
      },
    }),
  ]);
  const evidence: AssistantEvidence[] = [
    ...activities.map((a) => ({
      id: `activity:${a.id}`,
      kind: a.activityType,
      text: [a.summary, a.outcome, a.threadId ? `Thread: ${a.threadId}` : null]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 1000),
      at: a.occurredAt.toISOString(),
      href: `${href}#activity`,
    })),
    ...visits.map((v) => ({
      id: `visit:${v.id}`,
      kind: "PHYSICAL_VISIT",
      text: [v.summary, v.outcomes].filter(Boolean).join(" · ").slice(0, 1000),
      at: v.visitAt.toISOString(),
      href: `/visits/${v.id}/edit`,
    })),
    ...tasks.map((t) => ({
      id: `task:${t.id}`,
      kind: "OPEN_WORKLIST",
      text: `${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ""}`.slice(
        0,
        1000,
      ),
      at: t.updatedAt.toISOString(),
      href: `${href}#account-worklist`,
    })),
  ];
  if (plan)
    evidence.push({
      id: "account-plan",
      kind: "PLANNING_ASSUMPTIONS",
      text: JSON.stringify({
        status: plan.salesStatus,
        plan: plan.salesPlan,
      }).slice(0, 1500),
      at: plan.salesStatusUpdatedAt?.toISOString() ?? "",
      href,
    });
  return { accountName: record.name, evidence };
}
