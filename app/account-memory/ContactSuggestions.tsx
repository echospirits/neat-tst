import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { hasFeature } from "../../lib/organizations";
import type { CrmAccount } from "../../lib/crm/activity";
import { loadContactSuggestions } from "../../lib/crm/contactSuggestions";
import { ContactSuggestionList } from "./ContactSuggestionList";
export async function ContactSuggestions({
  account,
}: {
  account?: CrmAccount;
}) {
  const { actor, user, ownCommunications } = await requireCrmActor();
  if (!ownCommunications || user.role === "TASTER")
    return null;
  if (!(await hasFeature(actor.organizationId, "COMMUNICATIONS"))) return null;
  try {
    const result = await loadContactSuggestions(prisma, actor, account);
    if (account && !result.suggestions.length) return null;
    return (
      <details className="nested-details" id="contact-suggestions">
        <summary>Suggested contacts ({result.suggestions.length})</summary>
        <p className="field-note">
          From your email metadata and your organization’s business texts in the
          last 90 days. Two-way and repeated correspondence appears first;
          frequency does not establish customer value. Nothing is added until
          you review it.
        </p>
        {result.limited ? (
          <p role="status">
            Showing up to 200 suggestions from up to 1,000 recent emails, 500
            texts and 10,000 active contacts. Older evidence may be missing;
            duplicates are checked again when saving.
          </p>
        ) : null}
        <ContactSuggestionList
          suggestions={result.suggestions.map((s) => ({
            ...s,
            lastAt: s.lastAt.toISOString(),
            evidence: s.evidence.map((e) => ({ ...e, at: e.at.toISOString() })),
          }))}
        />
      </details>
    );
  } catch {
    return (
      <p role="status">
        Contact suggestions could not load. Refresh to retry; your existing
        contacts remain available.
      </p>
    );
  }
}
