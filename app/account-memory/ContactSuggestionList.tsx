"use client";
import { useState } from "react";
import type { ContactSuggestion } from "../../lib/crm/contactSuggestions";
import { CrmForm } from "../components/CrmForm";
import { CrmAccountPicker } from "../components/CrmAccountPicker";
import {
  ContactSearchPicker,
  type ContactChoice,
} from "../components/ContactSearchPicker";
import { reviewContactSuggestionAction } from "./contact-suggestion-actions";
type Suggestion = Omit<ContactSuggestion, "lastAt" | "evidence"> & {
  lastAt: string;
  evidence: Array<
    Omit<ContactSuggestion["evidence"][number], "at"> & { at: string }
  >;
};
function Review({
  suggestion: s,
  onDone,
}: {
  suggestion: Suggestion;
  onDone: () => void;
}) {
  const [mode, setMode] = useState("CREATE"),
    [target, setTarget] = useState<ContactChoice | null>(null);
  return (
    <article
      className="contact-card contact-suggestion"
      aria-label={`Suggested contact ${s.value}`}
    >
      <div className="contact-card-heading">
        <strong>{s.name || s.value}</strong>
      </div>
      <div className="contact-card-body">
        <p>
          {s.name ? s.value : null} ·{" "}
          {s.channel === "EMAIL" ? "Email" : "Business SMS"}
        </p>
        <p>
          {s.incoming} inbound · {s.outgoing} outbound · Latest{" "}
          {s.lastAt.slice(0, 10)}
        </p>
        <p>
          {s.accounts.length === 1
            ? `Suggested account: ${s.accounts[0].name} — already associated with supporting activity.`
            : s.accounts.length > 1
              ? "Activity involves multiple accounts. Confirm the correct location."
              : "Account not established. Choose the correct restaurant or retail location."}
        </p>
        {s.existing.length ? (
          <p className="field-note">
            This address or number is already recorded at{" "}
            {s.existing.map((c) => `${c.accountLabel} (${c.name})`).join(", ")}.
            Review before adding another account contact.
          </p>
        ) : null}
        <details>
          <summary>Why this suggestion?</summary>
          <p className="field-note">
            Email subjects and display names are metadata, not verified roles or
            promises. Your mailbox evidence is visible only to you; accepted
            contact details are shared with your tenant.
          </p>
          {s.evidence.map((e) => (
            <p key={e.id}>
              {e.at.slice(0, 10)} · {e.source}
              <br />
              {e.summary}
              {e.url ? (
                <>
                  <br />
                  <a href={e.url} target="_blank" rel="noopener noreferrer">
                    Open original email
                  </a>
                </>
              ) : null}
            </p>
          ))}
        </details>
        <details>
          <summary>Review contact</summary>
          <label>
            Save as
            <select
              aria-label="Save as"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="CREATE">Add contact</option>
              <option value="LINK">Link to existing contact</option>
            </select>
          </label>
          <CrmForm
            action={reviewContactSuggestionAction}
            submitLabel={
              mode === "CREATE"
                ? "Add reviewed contact"
                : "Link reviewed contact"
            }
            onSuccess={onDone}
          >
            <input type="hidden" name="key" value={s.key} />
            <input type="hidden" name="operation" value={mode} />
            {mode === "CREATE" ? (
              <>
                <label>
                  Contact name
                  <input
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={s.name}
                    autoComplete="off"
                  />
                </label>
                <CrmAccountPicker
                  initial={s.accounts.length === 1 ? s.accounts[0] : undefined}
                />
              </>
            ) : (
              <>
                <ContactSearchPicker onChange={setTarget} />
                <input
                  type="hidden"
                  name="accountType"
                  value={target?.accountType || ""}
                />
                <input
                  type="hidden"
                  name="accountId"
                  value={target?.accountId || ""}
                />
                <p className="field-note">
                  Adds this{" "}
                  {s.channel === "EMAIL" ? "email address" : "phone number"} to
                  the selected contact without replacing existing details.
                </p>
              </>
            )}
            <label className="crm-check">
              <input type="checkbox" name="confirmed" value="true" required /> I
              confirm this person and account. Save the contact details for my
              organization and associate the displayed evidence where
              unassigned.
            </label>
          </CrmForm>
        </details>
        <CrmForm
          action={reviewContactSuggestionAction}
          submitLabel="Dismiss for me"
          onSuccess={onDone}
        >
          <input type="hidden" name="key" value={s.key} />
          <input type="hidden" name="operation" value="DISMISS" />
        </CrmForm>
      </div>
    </article>
  );
}
export function ContactSuggestionList({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(10),
    [done, setDone] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const remaining = suggestions.filter((s) => !done.includes(s.key)),
    matches = remaining.filter((s) =>
      `${s.name} ${s.value} ${s.accounts.map((a) => a.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  return (
    <div>
      {message ? <p role="status">{message}</p> : null}
      {remaining.length ? (
        <>
          <label>
            Find a suggestion
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(10);
              }}
            />
          </label>
          <p className="field-note">
            {matches.length} matches · Showing {Math.min(limit, matches.length)}
          </p>
          {matches.slice(0, limit).map((s) => (
            <Review
              key={s.key}
              suggestion={s}
              onDone={() => {
                setDone((d) => [...d, s.key]);
                setMessage(
                  "Review saved. Existing contacts are available in the account’s Contacts section.",
                );
              }}
            />
          ))}
          {!matches.length ? <p>No suggestions match your search.</p> : null}
          {matches.length > limit ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => setLimit((n) => n + 10)}
            >
              Show more suggestions
            </button>
          ) : null}
        </>
      ) : (
        <p>
          No new contacts to review. Suggestions appear as connected mailboxes
          or business texts capture people not yet recorded. You can also add
          contacts normally.
        </p>
      )}
    </div>
  );
}
