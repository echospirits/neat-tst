import { Suspense } from "react";
import { requireCrmActor } from "../../lib/crm/auth";
import { hasFeature } from "../../lib/organizations";
import type { CrmAccount } from "../../lib/crm/activity";
import { ContactSuggestions } from "./ContactSuggestions";
import { SmsConversation } from "./SmsConversation";

export async function AccountCommunications({
  account,
  contacts,
}: {
  account: CrmAccount;
  contacts: Array<{ id: string; name: string; phone: string | null }>;
}) {
  const { actor, ownCommunications, user } = await requireCrmActor();
  if (
    !ownCommunications ||
    user.role === "TASTER" ||
    !(await hasFeature(actor.organizationId, "COMMUNICATIONS"))
  )
    return null;
  return (
    <>
      <Suspense fallback={<p role="status">Loading contact suggestions…</p>}>
        <ContactSuggestions account={account} />
      </Suspense>
      <SmsConversation contacts={contacts} />
    </>
  );
}
