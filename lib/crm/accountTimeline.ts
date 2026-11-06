import { prisma } from "../prisma";
import { accountWorklistWhere } from "../accountWorklist";
import { getUserDisplayName } from "../auth";
import { formatEasternDateTime } from "../dateTime";
import type { SupplementalActivity } from "../../app/visits/VisitActivityTable";

const tastingHistoryLabels: Record<string, string> = {
  WORKFLOW_STATUS_CHANGED: 'Tasting workflow status changed', WORKFLOW_STATUS_RESET: 'Tasting status reset for revised proposal',
  DRAFT_CREATED: 'Tasting proposed', TASTER_APPROVED: 'Taster approved', TASTER_NEEDS_EDIT: 'Taster requested changes',
  AGENCY_APPROVAL_REQUESTED: 'Agency approval requested', AGENCY_APPROVED: 'Agency approved', AGENCY_DENIED: 'Agency denied',
  SUBMITTED_TO_STATE: 'Tasting submitted to state', STATE_APPROVED: 'State approved', STATE_DENIED: 'State denied',
  CANCELLED: 'Tasting cancelled', DATE_TIME_CHANGED: 'Tasting rescheduled', TASTER_REASSIGNED: 'Taster reassigned',
  AGENCY_CHANGED: 'Tasting Agency changed', APPROVALS_RESET: 'Tasting approvals reset', DETAILS_UPDATED: 'Tasting details updated',
  SPACING_OVERRIDE: 'Tasting spacing override', TASTING_COMPLETED: 'Tasting completed through Log Visit',
  FEEDBACK_UPDATED: 'Tasting feedback recorded', SALES_OUTCOME_UPDATED: 'Tasting date retail sales refreshed',
  SPREADSHEET_IMPORTED: 'Tasting schedule imported',
};
export async function accountWorkAndEvents(
  input: Parameters<typeof accountWorklistWhere>[0],
): Promise<SupplementalActivity[]> {
  const [tasks, events, stages, tastings] = await Promise.all([
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
    input.accountType === 'AGENCY' && input.enabledFeatures.has('TASTING_MANAGEMENT')
      ? prisma.tastingWorkflowEvent.findMany({
          where: { organizationId: input.organizationId, tasting: { organizationId: input.organizationId, agencyId: input.accountId } },
          select: { id: true, type: true, actorUserId: true, createdAt: true, tastingEventId: true, tasting: { select: { startsAt: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        })
      : [],
  ]);
  const tastingActorIds = [...new Set(tastings.flatMap(event => event.actorUserId ? [event.actorUserId] : []))];
  const tastingActors = tastingActorIds.length ? await prisma.user.findMany({ where: { organizationId: input.organizationId, id: { in: tastingActorIds } }, select: { id: true, name: true, firstName: true, lastName: true, email: true } }) : [];
  const tastingActorNames = new Map(tastingActors.map(user => [user.id, getUserDisplayName(user)]));
  return [
    ...tastings.map(event => ({
      id: `tasting:${event.id}`,
      at: event.createdAt,
      actor: event.actorUserId ? tastingActorNames.get(event.actorUserId) ?? 'Former team member' : 'Neat',
      title: tastingHistoryLabels[event.type] ?? 'Tasting updated',
      detail: `Current schedule: ${formatEasternDateTime(event.tasting.startsAt)}`,
      type: 'Tasting',
      source: 'Tastings',
      href: `/tastings/${event.tastingEventId}`,
      linkLabel: 'Open Tasting',
    })),
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
