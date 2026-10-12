"use client";
import { useEffect, useId, useState } from "react";
export type ContactChoice = {
  id: string;
  name: string;
  accountName: string;
  accountType: "AGENCY" | "WHOLESALE";
  accountId: string;
};
export function ContactSearchPicker({
  onChange,
}: {
  onChange: (contact: ContactChoice | null) => void;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<ContactChoice | null>(null),
    [rows, setRows] = useState<ContactChoice[]>([]),
    [status, setStatus] = useState("");
  const id = useId();
  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setRows([]);
      setStatus("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("Searching…");
      try {
        const response = await fetch(
          `/api/contacts?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw Error();
        const data = (await response.json()) as ContactChoice[];
        setRows(data);
        setStatus(
          data.length
            ? `${data.length} results; up to 20 shown.`
            : "No matching contacts. Try their name or email.",
        );
      } catch {
        if (!controller.signal.aborted) {
          setRows([]);
          setStatus("Search unavailable. Change the search to retry.");
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);
  return (
    <div className="crm-picker">
      <input type="hidden" name="contactId" value={selected?.id || ""} />
      {selected ? (
        <p>
          {selected.name} · {selected.accountName}{" "}
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setSelected(null);
              onChange(null);
            }}
          >
            Change contact
          </button>
        </p>
      ) : (
        <>
          <label htmlFor={id}>Find existing contact</label>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
          />
          <p role="status">{status || "Type at least two characters."}</p>
          <ul className="crm-picker-results">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(row);
                    onChange(row);
                  }}
                >
                  {row.name} · {row.accountName}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
