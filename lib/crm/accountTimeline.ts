import { prisma } from "../prisma";
import { accountWorklistWhere } from "../accountWorklist";
import { getUserDisplayName } from "../auth";
import type { SupplementalActivity } from "../../app/visits/VisitActivityTable";
export async function accountWorkAndEvents(
  input: Parameters<typeof accountWorklistWhere>[0],
): Promise<SupplementalActivity[]> {
  const [tasks, events, stages] = await Promise.all([
    prisma.worklistItem.findMany({
      where: {
        ...accountWorklistWhere(input),
        status: "COMPLETED",
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 100,
      include: { completedByUser: { select: { name: true, email: true } } },
    }),
    prisma.eventShift.findMany({
      where: {
        organizationId: input.organizationId,
        accountType: input.accountType,
        externalAccountId: input.accountId,
      },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
    prisma.organizationAuditEvent.findMany({
      where: {
        organizationId: input.organizationId,
        AND: [
          { metadata: { path: ["kind"], equals: "ACCOUNT_SALES_PLAN" } },
          { metadata: { path: ["accountType"], equals: input.accountType } },
          { metadata: { path: ["accountId"], equals: input.accountId } },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);
  return [
    ...stages
      .filter((s) => {
        const m = s.metadata as {
          before?: { stageKey?: string };
          after?: { stageKey?: string };
        };
        return m.before?.stageKey !== m.after?.stageKey;
      })
      .map((s) => {
        const m = s.metadata as { after?: { stageKey?: string } };
        return {
          id: `stage:${s.id}`,
          at: s.occurredAt,
          actor: "",
          title: "Detailed Pipeline stage updated",
          detail: m.after?.stageKey || "Detailed stage cleared",
          type: "Pipeline stage",
          source: "Pipeline",
        };
      }),
    ...tasks.map((t) => ({
      id: `task:${t.id}`,
      at: t.completedAt!,
      actor: t.completedByUser
        ? getUserDisplayName(t.completedByUser)
        : "Team member",
      title: "Follow-up completed",
      detail: t.title,
      type: "Completed task",
      source: "Worklist",
      opportunity: t.salesOpportunityId ?? t.agencyProductIntelligenceId ?? "",
      href: "/alerts",
      linkLabel: "Open Worklist",
    })),
    ...events.map((e) => ({
      id: `event:${e.id}`,
      at: e.startsAt,
      actor: "",
      title: `${e.eventType.toLowerCase()} · ${e.status}`,
      detail: e.title,
      type: "Event",
      source: e.source,
      href: `/events/${e.id}`,
      linkLabel: "View event",
    })),
  ];
}
