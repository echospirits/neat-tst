import { requireUser } from "../auth";
import { requireFeatureForUser } from "../organizations";
import { CrmError } from "./activity";
export async function requireCrmActor(mailbox = false) {
  const user = await requireUser();
  const context = await requireFeatureForUser(user, "CORE_CRM");
  if (
    mailbox &&
    (user.organizationId !== context.organizationId ||
      user.role === "PLATFORM_ADMIN")
  )
    throw new CrmError(
      "Mailbox access requires your own organization membership.",
    );
  return {
    actor: { userId: user.id, organizationId: context.organizationId },
    user,
    timezone: context.organization.timezone,
  };
}
