import type { CrmDb } from "./activity";
import { pipelineForecast } from "./pipeline";
import { readAccountConfiguration } from "./accountConfiguration";
import { csvCell } from "../analytics/csv";
export async function operationsReport(
  db: CrmDb,
  organizationId: string,
  start: string,
  end: string,
) {
  const from = new Date(`${start}T00:00:00Z`),
    until = new Date(Date.parse(`${end}T00:00:00Z`) + 86400000);
  const [plans, visits, communications, tasks, org, users] = await Promise.all([
    db.organizationAccountOverlay.findMany({
      where: { organizationId, salesStatus: { not: null } },
      select: { salesStatus: true, salesPlan: true, crmDetails: true },
      take: 5001,
    }),
    db.loggedVisit.groupBy({
      by: ["createdByUserId"],
      where: { organizationId, visitAt: { gte: from, lt: until } },
      _count: { _all: true },
    }),
    db.accountActivity.groupBy({
      by: ["createdByUserId"],
      where: {
        organizationId,
        visibility: "TEAM",
        occurredAt: { gte: from, lt: until },
        activityType: { not: "INTERNAL_NOTE" },
        OR: [
          { source: { notIn: ["TWILIO", "MOCK_SMS"] } },
          { deliveryStatus: { in: ["DELIVERED", "RECEIVED"] } },
        ],
      },
      _count: { _all: true },
    }),
    db.worklistItem.groupBy({
      by: ["completedByUserId"],
      where: {
        organizationId,
        status: "COMPLETED",
        completedAt: { gte: from, lt: until },
      },
      _count: { _all: true },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { crmPreferences: true },
    }),
    db.user.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);
  const config = readAccountConfiguration(org.crmPreferences),
    rows = plans.slice(0, 5000),
    forecast = pipelineForecast(rows),
    truncated = plans.length > 5000;
  const staff = [
    ...new Set([
      ...visits.map((r) => r.createdByUserId),
      ...communications.map((r) => r.createdByUserId),
      ...tasks.map((r) => r.completedByUserId),
    ]),
  ].map((id) => ({
    name: users.find((u) => u.id === id)?.name ?? "Former or unassigned member",
    visits: visits.find((r) => r.createdByUserId === id)?._count._all ?? 0,
    communications:
      communications.find((r) => r.createdByUserId === id)?._count._all ?? 0,
    completed: tasks.find((r) => r.completedByUserId === id)?._count._all ?? 0,
  }));
  const territories = [
    ...config.territories.map((t) => ({ id: t.id, name: t.name })),
    { id: "", name: "Unassigned" },
  ].map((t) => ({
    name: t.name,
    ...pipelineForecast(
      rows.filter(
        (r) =>
          String(
            (r.crmDetails as { territoryId?: string })?.territoryId ?? "",
          ) === t.id,
      ),
    ),
  }));
  return {
    organizationId,
    start,
    end,
    forecast,
    truncated,
    staff,
    territories,
  };
}
export type OperationsReport = Awaited<ReturnType<typeof operationsReport>>;
export function operationsCsv(r: OperationsReport) {
  const rows: unknown[][] = [
    [
      "Organization",
      "Start UTC",
      "End UTC",
      "Report",
      "Name",
      "Visits",
      "Team interactions",
      "Completed Worklist",
      "Open Pipeline accounts now",
      "Estimated USD now",
      "Weighted USD now",
      "Valued accounts",
      "Missing probabilities",
      "Scope",
    ],
    ...r.staff.map((s) => [
      r.organizationId,
      r.start,
      r.end,
      "Staff",
      s.name,
      s.visits,
      s.communications,
      s.completed,
      "",
      "",
      "",
      "",
      "",
      "All organization accounts; private communications excluded",
    ]),
    ...r.territories.map((t) => [
      r.organizationId,
      r.start,
      r.end,
      "Territory",
      t.name,
      "",
      "",
      "",
      t.accounts,
      t.unweighted,
      t.weighted,
      t.valued,
      t.missingProbability,
      r.truncated
        ? "Partial: first 5000 status-bearing accounts"
        : "Current Pipeline, all products",
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
