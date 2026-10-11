"use client";
import { useId, useState, useEffect } from "react";
import { CrmForm } from "./CrmForm";
import { CrmAccountPicker } from "./CrmAccountPicker";
import { saveActivityAction } from "../crm/actions";
// Keep Prisma/server services outside the client bundle.
const kinds = [
  ["PHONE_CALL", "Phone call"],
  ["EMAIL", "Email"],
  ["SMS", "Text message"],
  ["VIRTUAL_MEETING", "Virtual meeting"],
  ["INTERNAL_NOTE", "Internal note"],
  ["CUSTOMER_INTERACTION", "Customer interaction"],
  ["SAMPLE_DELIVERY", "Sample delivery"],
  ["TASTING", "Tasting"],
  ["TRAINING", "Training"],
  ["SALES_PRESENTATION", "Sales presentation"],
  ["MENU_PLACEMENT", "Menu placement"],
  ["MERCHANDISING", "Merchandising"],
];
export function CrmActivityForm({
  account,
}: {
  account?: {
    accountType: "AGENCY" | "WHOLESALE";
    accountId: string;
    name: string;
  };
}) {
  const id = useId(),
    [submissionKey, setSubmissionKey] = useState(""),
    [localTime, setLocalTime] = useState("");
  useEffect(() => {
    setSubmissionKey(crypto.randomUUID());
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setLocalTime(now.toISOString().slice(0, 16));
  }, []);
  return (
    <CrmForm
      action={async (data) => {
        const result = await saveActivityAction(data);
        if (result.success) setSubmissionKey(crypto.randomUUID());
        return result;
      }}
      reset
      submitLabel="Save activity"
    >
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <CrmAccountPicker initial={account} />
      <label htmlFor={`${id}-kind`}>Activity</label>
      <select id={`${id}-kind`} name="activityType">
        {kinds.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-summary`}>What happened?</label>
      <input id={`${id}-summary`} name="summary" required maxLength={500} />
      <label htmlFor={`${id}-at`}>When</label>
      <input
        id={`${id}-at`}
        name="occurredAt"
        type="datetime-local"
        defaultValue={localTime}
        required
      />
      <label htmlFor={`${id}-visibility`}>Visible to</label>
      <select id={`${id}-visibility`} name="visibility" defaultValue="TEAM">
        <option value="TEAM">Organization team</option>
        <option value="PRIVATE">Only me</option>
      </select>
      <details>
        <summary>Add outcome and direction</summary>
        <label htmlFor={`${id}-outcome`}>Outcome (optional)</label>
        <textarea id={`${id}-outcome`} name="outcome" maxLength={4000} />
        <label htmlFor={`${id}-direction`}>Direction</label>
        <select id={`${id}-direction`} name="direction">
          <option value="NONE">Not applicable</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
        </select>
        <label className="crm-check">
          <input type="checkbox" name="meaningful" />
          This was a meaningful customer interaction
        </label>
      </details>
      <p className="muted">
        Use Log visit for a physical visit. Saving here does not send a message.
      </p>
    </CrmForm>
  );
}
