"use client";
import { useState } from "react";
import { generateAccountAssistant } from "./assistant-actions";
import type { AssistantResult, AssistantEvidence } from "../../lib/crm/ai";
import type { CrmAccount } from "../../lib/crm/activity";
export function AccountAssistant({
  account,
  live,
}: {
  account: CrmAccount;
  live: boolean;
}) {
  const [purpose, setPurpose] = useState<"BRIEFING" | "FOLLOW_UP" | "RESPONSE">(
      "BRIEFING",
    ),
    [privateRecords, setPrivate] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<AssistantResult | null>(null),
    [evidence, setEvidence] = useState<AssistantEvidence[]>([]),
    [draft, setDraft] = useState("");
  return (
    <details>
      <summary>
        Reviewed communication assistant ·{" "}
        {live ? "AI enabled" : "Local preview"}
      </summary>
      <p className="field-note">
        {live
          ? "Uses the configured AI provider."
          : "Live AI is not configured; preview uses local record excerpts."}{" "}
        Includes up to 20 interactions, 10 visits, 10 open tasks and the current
        account plan. Mail contains subjects and participants, not full message
        bodies.
      </p>
      <label>
        Review
        <select
          aria-label="Review purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as typeof purpose)}
        >
          <option value="BRIEFING">Account and thread briefing</option>
          <option value="FOLLOW_UP">Commitments and next steps</option>
          <option value="RESPONSE">Draft a response</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={privateRecords}
          onChange={(e) => setPrivate(e.target.checked)}
        />
        Include my private communications
      </label>
      <label>
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        I will review sources and any draft before using them
        {live
          ? " and authorize sending these selected account records to the configured AI provider"
          : ""}
        .
      </label>
      <button
        type="button"
        disabled={!reviewed || pending}
        onClick={async () => {
          setPending(true);
          setError("");
          setResult(null);
          try {
            const r = await generateAccountAssistant({
              ...account,
              purpose,
              includePrivate: privateRecords,
              reviewed: true,
            });
            if (r.error) setError(r.error);
            else if (r.result) {
              setResult(r.result);
              setEvidence(r.evidence ?? []);
              setDraft(r.result.draft);
            }
          } catch {
            setError("Review unavailable. Please retry.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Reviewing…" : "Generate reviewed brief"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <section aria-live="polite">
          <p>
            <strong>{result.notice}</strong>
          </p>
          {(["summary", "commitments", "suggestions"] as const).map((key) => (
            <div key={key}>
              <h4>
                {key === "summary"
                  ? "Summary"
                  : key === "commitments"
                    ? "Recorded commitments to verify"
                    : "Suggested next steps"}
              </h4>
              {result[key].length ? (
                <ul>
                  {result[key].map((p, i) => (
                    <li key={i}>
                      {p.text}{" "}
                      <span>
                        {p.sourceIds.map((id, j) => (
                          <a
                            key={id}
                            href={evidence.find((e) => e.id === id)?.href}
                          >
                            Source {j + 1}{" "}
                          </a>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No supported items in the supplied records.</p>
              )}
            </div>
          ))}
          {draft ? (
            <label>
              Draft for your review
              <textarea
                rows={6}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
          ) : null}
          <p>
            Nothing is sent or added to Worklist. Use the account’s existing
            follow-up action after reviewing the suggestion.
          </p>
        </section>
      ) : null}
    </details>
  );
}
