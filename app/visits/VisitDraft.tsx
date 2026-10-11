"use client";
import { useEffect, useState, useRef } from "react";
export function VisitDraft({
  scope,
  value,
  onRestore,
}: {
  scope: string;
  value: Record<string, unknown>;
  onRestore: (value: Record<string, unknown>) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [saved, setSaved] = useState<Record<string, unknown> | null>(null),
    [message, setMessage] = useState("");
  const key = `neat-visit-draft:${scope}`,
    latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    setEnabled(false);
    setSaved(null);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const row = JSON.parse(raw);
      if (Date.now() - row.at > 86400000) {
        localStorage.removeItem(key);
        return;
      }
      setSaved(row.value);
    } catch {
      setMessage("Draft storage is unavailable on this device.");
    }
  }, [key]);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ at: Date.now(), value: latest.current }),
        );
        setMessage("Draft saved on this device.");
      } catch {
        setMessage(
          "Could not save a local draft. Keep this page open until you reconnect.",
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [enabled, key, serialized]);
  return (
    <details className="nested-details">
      <summary>Draft recovery on this device</summary>
      <p className="field-note">
        Opt in to keep notes and follow-up fields for 24 hours on this device.
        Use only on a trusted device. Photos and guide answers are not retained;
        nothing is sent automatically. Reconnect before saving to Neat.
      </p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Keep a local draft while I work
      </label>
      {saved ? (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onRestore(saved);
            setEnabled(true);
            setMessage("Draft restored. Review before saving.");
            setSaved(null);
          }}
        >
          Restore saved draft
        </button>
      ) : null}
      <button
        type="button"
        className="secondary"
        onClick={() => {
          try {
            localStorage.removeItem(key);
          } catch {}
          setEnabled(false);
          setSaved(null);
          setMessage("Local draft removed.");
        }}
      >
        Remove local draft
      </button>
      <p role="status">{message}</p>
    </details>
  );
}
