import { z } from "zod";
import { type CrmActor, type CrmDb, CrmError } from "./activity";
import { isValidSchedulerDate } from "../myDayWeekScheduler";
import { getWorklistLocationReference } from "../worklistLocations";
import { isValidCoordinates } from "../location/distance";
import type { RouteStop } from "./routeProvider";
export function routeDateRange(date: string) {
  if (!isValidSchedulerDate(date))
    throw new CrmError("Choose a valid schedule date.");
  const start = new Date(`${date}T00:00:00Z`),
    end = new Date(start.getTime() + 86400000);
  return { gte: start, lt: end };
}
export async function getRouteStops(db: CrmDb, actor: CrmActor, date: string) {
  const where = {
    organizationId: actor.organizationId,
    assignedToUserId: actor.userId,
    status: { in: ["OPEN", "IN_PROGRESS"] as ("OPEN" | "IN_PROGRESS")[] },
    dueDate: routeDateRange(date),
  };
  const [items, total] = await Promise.all([
    db.worklistItem.findMany({
      where,
      include: {
        loggedVisit: {
          select: {
            locationType: true,
            agencyId: true,
            wholesaleAccountId: true,
          },
        },
      },
      orderBy: [
        { routeOrder: "asc" },
        { dueTimeMinutes: "asc" },
        { id: "asc" },
      ],
      take: 100,
    }),
    db.worklistItem.count({ where }),
  ]);
  const references = items.map((item) => ({
    item,
    ref: getWorklistLocationReference(item),
  }));
  const select = {
    id: true,
    name: true,
    address: true,
    city: true,
    state: true,
    zip: true,
    latitude: true,
    longitude: true,
  } as const;
  const [agencies, wholesale] = await Promise.all([
    db.agency.findMany({
      where: {
        id: {
          in: references
            .filter((r) => r.ref?.type === "agency")
            .map((r) => r.ref!.id),
        },
      },
      select,
    }),
    db.wholesaleAccount.findMany({
      where: {
        id: {
          in: references
            .filter((r) => r.ref?.type === "wholesale")
            .map((r) => r.ref!.id),
        },
        mergedIntoId: null,
      },
      select,
    }),
  ]);
  const agencyMap = new Map(agencies.map((a) => [a.id, a])),
    wholesaleMap = new Map(wholesale.map((a) => [a.id, a]));
  const stops: RouteStop[] = [];
  let missing = 0;
  for (const { item, ref } of references) {
    if (!ref) continue;
    const account =
      ref.type === "agency" ? agencyMap.get(ref.id) : wholesaleMap.get(ref.id);
    if (!account) {
      missing++;
      continue;
    }
    const address = [account.address, account.city, account.state, account.zip]
        .filter(Boolean)
        .join(", "),
      coordinates =
        account.latitude !== null && account.longitude !== null
          ? { latitude: account.latitude, longitude: account.longitude }
          : null;
    if (!address && !coordinates) {
      missing++;
      continue;
    }
    stops.push({
      id: item.id,
      name: account.name,
      address,
      coordinates:
        coordinates && isValidCoordinates(coordinates) ? coordinates : null,
      time: item.dueTimeMinutes,
      version: item.updatedAt.toISOString(),
    });
  }
  return {
    stops: stops.slice(0, 27),
    omitted:
      Math.max(0, total - items.length) +
      Math.max(0, stops.length - 27) +
      missing,
  };
}
export async function saveRouteOrder(db: CrmDb, actor: CrmActor, raw: unknown) {
  const input = z
    .object({
      date: z.string(),
      stops: z
        .array(
          z.object({
            id: z.string().min(1).max(100),
            version: z.string().datetime(),
          }),
        )
        .min(1)
        .max(27),
    })
    .parse(raw);
  if (new Set(input.stops.map((s) => s.id)).size !== input.stops.length)
    throw new CrmError("A route cannot repeat the same task.");
  const dueDate = routeDateRange(input.date);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`route:${actor.organizationId}:${actor.userId}:${input.date}`},0))`;
  for (const [index, stop] of input.stops.entries()) {
    const updated = await db.worklistItem.updateMany({
      where: {
        id: stop.id,
        organizationId: actor.organizationId,
        assignedToUserId: actor.userId,
        dueDate,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        updatedAt: new Date(stop.version),
      },
      data: { routeOrder: index },
    });
    if (!updated.count)
      throw new CrmError(
        "A task changed. Reload the schedule before saving the route.",
      );
  }
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "ROUTE_ORDER_SAVED",
        date: input.date,
        taskIds: input.stops.map((s) => s.id),
      },
    },
  });
}
