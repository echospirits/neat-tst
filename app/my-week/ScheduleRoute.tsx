import { prisma } from "../../lib/prisma";
import { getRouteStops } from "../../lib/crm/routes";
import { RoutePlanner } from "./RoutePlanner";
export async function ScheduleRoute({
  organizationId,
  userId,
  date,
}: {
  organizationId: string;
  userId: string;
  date: string;
}) {
  const result = await getRouteStops(prisma, { organizationId, userId }, date);
  return (
    <RoutePlanner
      key={`${date}:${result.stops.map((s) => s.version).join(":")}`}
      date={date}
      {...result}
    />
  );
}
