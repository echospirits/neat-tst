import { requireUser } from "../auth";
import { requireFeatureForUser } from "../organizations";
import { CrmError } from "./activity";
import { canAccessOwnCommunications } from "./communicationsAccess";
export async function requireCrmActor(mailbox = false) {
  const user = await requireUser();
  const context = await requireFeatureForUser(user, "CORE_CRM");
  const ownCommunications = canAccessOwnCommunications(user, context);
  if (mailbox && !ownCommunications)
    throw new CrmError(
      "Mailbox access requires your own organization membership outside Support View.",
    );
  return {
    actor: { userId: user.id, organizationId: context.organizationId },
    user,
    ownCommunications,
    timezone: context.organization.timezone,
  };
}
