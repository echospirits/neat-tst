"use client";
import { useEffect, useId, useState } from "react";
type AccountOption = { id: string; name: string; city: string | null };
export function CrmAccountPicker({
  initial,
}: {
  initial?: {
    accountType: "AGENCY" | "WHOLESALE";
    accountId: string;
    name: string;
  };
}) {
  const id = useId(),
    [type, setType] = useState(initial?.accountType ?? "WHOLESALE"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(
      initial
        ? ({
            id: initial.accountId,
            name: initial.name,
            city: null,
          } as AccountOption)
        : null,
    ),
    [options, setOptions] = useState<AccountOption[]>([]),
    [state, setState] = useState("");
  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setOptions([]);
      setState("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("Searching…");
      try {
        const response = await fetch(
          `/api/visits/account-search?${new URLSearchParams({ type: type === "AGENCY" ? "agency" : "wholesale", q: query })}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw Error();
        const data = (await response.json()) as { results: AccountOption[] };
        setOptions(data.results);
        setState(
          data.results.length
            ? `${data.results.length} results (up to 20 shown)`
            : "No matching accounts. Try another name or identifier.",
        );
      } catch {
        if (!controller.signal.aborted)
          setState("Search unavailable. Change the search to retry.");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, type, selected]);
  return (
    <div className="crm-picker">
      <input type="hidden" name="accountType" value={type} />
      <input type="hidden" name="accountId" value={selected?.id ?? ""} />
      {selected ? (
        <p>
          <strong>{selected.name}</strong>{" "}
          <button
            type="button"
            className="btn secondary"
            onClick={() => setSelected(null)}
          >
            Change account
          </button>
        </p>
      ) : (
        <>
          <label htmlFor={`${id}-type`}>Account type</label>
          <select
            id={`${id}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="WHOLESALE">Wholesale</option>
            <option value="AGENCY">Agency</option>
          </select>
          <label htmlFor={`${id}-search`}>Find an account</label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, city or identifier"
            autoComplete="off"
          />
          <p className="muted" role="status">
            {state || "Type at least two characters."}
          </p>
          <ul className="crm-picker-results">
            {options.map((option) => (
              <li key={option.id}>
                <button type="button" onClick={() => setSelected(option)}>
                  {option.name}
                  {option.city ? ` · ${option.city}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
