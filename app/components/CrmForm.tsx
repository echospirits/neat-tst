"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { CrmActionResult } from "../crm/actions";
export function CrmForm({
  action,
  children,
  submitLabel,
  confirm,
  reset = false,
}: {
  action: (data: FormData) => Promise<CrmActionResult>;
  children?: ReactNode;
  submitLabel: string;
  confirm?: string;
  reset?: boolean;
}) {
  const router = useRouter(),
    inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<CrmActionResult>({});
  return (
    <form
      className="crm-form"
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current || (confirm && !window.confirm(confirm))) return;
        const form = event.currentTarget,
          data = new FormData(form);
        // Send a UTC instant while displaying the user's local datetime input.
        const local = data.get("occurredAt");
        if (typeof local === "string" && local)
          data.set("occurredAt", new Date(local).toISOString());
        inFlight.current = true;
        setBusy(true);
        setResult({});
        try {
          const response = await action(data);
          setResult(response);
          if (response.success) {
            if (reset) form.reset();
            if (response.href) router.push(response.href);
            else router.refresh();
          }
        } catch {
          setResult({
            error:
              "Could not save. Your entries are retained. Check your connection and retry.",
          });
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className="btn" type="submit">
          {busy ? "Saving…" : submitLabel}
        </button>
      </fieldset>
      {result.error ? (
        <p className="crm-feedback" role="alert">
          {result.error}
        </p>
      ) : null}
      {result.success ? (
        <p className="crm-feedback" role="status">
          {result.success}
        </p>
      ) : null}
    </form>
  );
}
