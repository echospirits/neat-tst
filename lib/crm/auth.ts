import { requireUser } from "../auth";
import { requireFeatureForUser } from "../organizations";

export async function requireCrmActor() {
  const user = await requireUser();
  const context = await requireFeatureForUser(user, "CORE_CRM");
  return {
    actor: { userId: user.id, organizationId: context.organizationId },
    user,
    timezone: context.organization.timezone,
  };
}
