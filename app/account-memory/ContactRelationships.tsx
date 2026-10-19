"use client";
import { useEffect, useState } from "react";
import { CrmForm } from "../components/CrmForm";
import { relateContactsAction } from "./relationship-actions";
type Match = {
  id: string;
  name: string;
  email: string | null;
  accountName: string;
};
export function ContactRelationships({
  id,
  email,
  personKey,
}: {
  id: string;
  email: string | null;
  personKey?: string | null;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(email ?? ""),
    [matches, setMatches] = useState<Match[]>([]),
    [selected, setSelected] = useState<Match | null>(null),
    [status, setStatus] = useState("");
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("Searching…");
      try {
        const response = await fetch(
          `/api/contacts?q=${encodeURIComponent(query)}&exclude=${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw Error();
        const rows = (await response.json()) as Match[];
        setMatches(rows);
        setStatus(rows.length ? "" : "No matching contacts.");
      } catch {
        if (!controller.signal.aborted)
          setStatus("Search unavailable. Please try again.");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, id]);
  return (
    <details
      className="nested-details"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Relationships &amp; duplicates{personKey ? " · Linked person" : ""}
      </summary>
      <p className="field-note">
        Link the same person across accounts, or merge a duplicate at this
        account. Email matches need your review.
      </p>
      <label>
        Find an existing contact
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
          placeholder="Name or email"
        />
      </label>
      <p role="status">{status}</p>
      <div className="quick-picker-list">
        {matches.map((match) => (
          <button
            key={match.id}
            type="button"
            className="quick-picker"
            aria-pressed={selected?.id === match.id}
            onClick={() => setSelected(match)}
          >
            <strong>{match.name}</strong>
            <span>
              {match.accountName} · {match.email ?? "No email"}
            </span>
          </button>
        ))}
      </div>
      {selected ? (
        <CrmForm
          action={relateContactsAction}
          submitLabel="Apply relationship"
          confirm={`Confirm this is the same person: ${selected.name}? Merging archives the duplicate and moves its history.`}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="otherId" value={selected.id} />
          <label>
            Action
            <select name="operation" defaultValue="LINK">
              <option value="LINK">Link as the same person</option>
              <option value="MERGE">Merge duplicate into this contact</option>
            </select>
          </label>
        </CrmForm>
      ) : null}
    </details>
  );
}
