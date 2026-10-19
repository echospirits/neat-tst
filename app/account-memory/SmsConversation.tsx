"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CrmForm } from "../components/CrmForm";
import { RecordPicker } from "../components/RecordPicker";
import {
  saveSmsConsentAction,
  sendSmsAction,
  simulateSmsAction,
} from "../settings/communications/sms-actions";
type Thread = {
  phone: string;
  brand: string;
  connection: { provider: string; sender: string | null } | null;
  consent: string;
  messages: Array<{
    id: string;
    body: string;
    direction: string;
    status: string;
    createdAt: string;
    connection: { provider: string };
  }>;
};
export function SmsConversation({
  contacts,
}: {
  contacts: Array<{ id: string; name: string; phone: string | null }>;
}) {
  const [open, setOpen] = useState(false),
    [id, setId] = useState(""),
    [thread, setThread] = useState<Thread | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [key, setKey] = useState("");
  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (!open || !id) return;
    const controller = new AbortController();
    setThread(null);
    setError("");
    fetch(`/api/crm/sms/contact/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error ?? "Unable to load messages.");
        setThread(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Unable to load messages.",
          );
      });
    return () => controller.abort();
  }, [open, id, revision]);
  const refresh = () => {
    setRevision((value) => value + 1);
    setKey(crypto.randomUUID());
  };
  const choices = contacts.filter((contact) => contact.phone);
  return (
    <details
      className="nested-details"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Business text messages</summary>
      <p className="field-note">
        Messages use your organization's sending number and are visible to your
        team. Personal phone texts can be recorded through Log Visit.
      </p>
      <RecordPicker
        label="Message contact"
        name="smsContactPicker"
        options={choices.map((contact) => ({
          value: contact.id,
          label: `${contact.name} · ${contact.phone}`,
        }))}
        onChange={setId}
        clearLabel="Choose contact"
        placeholder="Choose a contact"
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : id && !thread ? (
        <p role="status">Loading messages…</p>
      ) : null}
      {thread ? (
        <>
          <p>
            {thread.phone} · Consent:{" "}
            {thread.consent.toLowerCase().replaceAll("_", " ")} ·{" "}
            {thread.connection?.provider === "MOCK"
              ? "Demo: no external delivery"
              : (thread.connection?.sender ?? "Sending not configured")}
          </p>
          {!thread.connection ? (
            <Link href="/settings/communications">
              Set up organization messaging
            </Link>
          ) : null}
          <details className="nested-details">
            <summary>Record consent or opt-out</summary>
            <CrmForm
              key={`consent-${id}`}
              action={saveSmsConsentAction}
              submitLabel="Record consent decision"
              onSuccess={refresh}
            >
              <input name="contactId" type="hidden" value={id} />
              <label>
                Decision
                <select name="status" defaultValue="OPTED_OUT">
                  <option value="OPTED_OUT">Opted out — block sending</option>
                  <option value="OPTED_IN">
                    Opted in — documented permission
                  </option>
                </select>
              </label>
              <label>
                Source and date of consent
                <textarea
                  name="evidence"
                  minLength={5}
                  maxLength={2000}
                  required
                  placeholder="Where, when, and for what messages did this person give permission?"
                />
              </label>
            </CrmForm>
          </details>
          {thread.connection && thread.consent === "OPTED_IN" ? (
            <CrmForm
              key={`send-${id}-${key}`}
              action={sendSmsAction}
              submitLabel={
                thread.connection.provider === "MOCK"
                  ? "Send demo message"
                  : "Send reviewed text"
              }
              onSuccess={refresh}
            >
              <input name="contactId" type="hidden" value={id} />
              <input name="submissionKey" type="hidden" value={key} />
              <p className="field-note">
                The message begins “{thread.brand}:” and ends “Reply STOP to opt
                out.”
              </p>
              <label>
                Message
                <textarea name="body" maxLength={1200} required rows={3} />
              </label>
              <label>
                <input name="confirmSend" type="checkbox" required /> I reviewed
                this message and authorize sending it to {thread.phone}.
              </label>
            </CrmForm>
          ) : (
            <p className="field-note">
              Sending requires an enabled connection and recorded opt-in.
            </p>
          )}
          {thread.connection?.provider === "MOCK" ? (
            <details className="nested-details">
              <summary>Simulate a reply</summary>
              <CrmForm
                action={simulateSmsAction}
                submitLabel="Record demo reply"
                onSuccess={refresh}
              >
                <input name="contactId" type="hidden" value={id} />
                <label>
                  Reply
                  <textarea
                    name="body"
                    required
                    maxLength={1600}
                    placeholder="Use STOP to test opt-out blocking."
                  />
                </label>
              </CrmForm>
            </details>
          ) : null}
          <ol className="crm-timeline">
            {thread.messages.map((message) => (
              <li key={message.id} className="card">
                <small>
                  {message.direction.toLowerCase()} ·{" "}
                  {message.status.toLowerCase()} · {message.connection.provider}{" "}
                  · {new Date(message.createdAt).toLocaleString()}
                </small>
                <p className="crm-prewrap">{message.body}</p>
              </li>
            ))}
          </ol>
          {!thread.messages.length ? (
            <p className="muted">No business texts recorded for this phone.</p>
          ) : (
            <p className="field-note">
              Latest 30 messages for this phone. Account history also includes
              matched texts.
            </p>
          )}
        </>
      ) : null}
    </details>
  );
}
