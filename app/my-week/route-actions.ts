"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError } from "../../lib/crm/activity";
import { getRouteStops, saveRouteOrder } from "../../lib/crm/routes";
import { GoogleRouteProvider, nearbyOrder } from "../../lib/crm/routeProvider";
export async function suggestRoute(date: string) {
  const { actor } = await requireCrmActor();
  const { stops } = await getRouteStops(prisma, actor, date);
  if (
    process.env.CRM_ROUTES_ENABLED !== "true" ||
    !process.env.GOOGLE_ROUTES_API_KEY
  )
    return nearbyOrder(stops);
  const allowed=await prisma.$transaction(async db=>{
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-routes:${actor.organizationId}:${actor.userId}`},0))`;
    const count=await db.organizationAuditEvent.count({where:{organizationId:actor.organizationId,actorUserId:actor.userId,occurredAt:{gt:new Date(Date.now()-3600000)},metadata:{path:['kind'],equals:'ROUTE_PROVIDER_REQUEST'}}});
    if(count>=10)return false;
    await db.organizationAuditEvent.create({data:{organizationId:actor.organizationId,actorUserId:actor.userId,action:'ORGANIZATION_UPDATED',metadata:{kind:'ROUTE_PROVIDER_REQUEST',date}}});return true;
  });
  if(!allowed)return{...nearbyOrder(stops),note:'Hourly route request limit reached. '+nearbyOrder(stops).note};
  try {
    return await new GoogleRouteProvider(
      process.env.GOOGLE_ROUTES_API_KEY,
    ).plan(stops);
  } catch {
    return {
      ...nearbyOrder(stops),
      note: "Road routing unavailable. " + nearbyOrder(stops).note,
    };
  }
}
export async function saveRouteAction(form: FormData) {
  const { actor } = await requireCrmActor();
  try {
    const ids = form.getAll("stopId"),
      versions = form.getAll("stopVersion");
    await prisma.$transaction((db) =>
      saveRouteOrder(db, actor, {
        date: form.get("date"),
        stops: ids.map((id, i) => ({ id, version: versions[i] })),
      }),
    );
    revalidatePath("/");
    return { success: "Route order saved. Appointment times are unchanged." };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : "Could not save this route. Reload and retry.",
    };
  }
}
