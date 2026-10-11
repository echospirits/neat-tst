"use client";
import { useState } from "react";
export function AccountDocuments({
  initial,
}: {
  initial: Array<{ name: string; url: string }>;
}) {
  const [documents, setDocuments] = useState(initial);
  return (
    <details>
      <summary>Documents ({documents.length})</summary>
      <p className="field-note">
        Links to your existing document library. The document provider controls
        access; only use links intended for your organization.
      </p>
      <input type="hidden" name="documents" value={JSON.stringify(documents)} />
      {documents.map((d, i) => (
        <fieldset key={i}>
          <legend>Document {i + 1}</legend>
          <label>
            Name
            <input
              value={d.name}
              maxLength={120}
              onChange={(e) =>
                setDocuments(
                  documents.map((v, j) =>
                    i === j ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            HTTPS link
            <input
              type="url"
              value={d.url}
              maxLength={2000}
              onChange={(e) =>
                setDocuments(
                  documents.map((v, j) =>
                    i === j ? { ...v, url: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          {/^https:\/\//i.test(d.url) ? (
            <a href={d.url} target="_blank" rel="noopener noreferrer">
              Open {d.name || "document"}
            </a>
          ) : null}
          <button
            type="button"
            className="secondary"
            onClick={() => setDocuments(documents.filter((_, j) => i !== j))}
          >
            Remove document
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={documents.length >= 20}
        onClick={() => setDocuments([...documents, { name: "", url: "" }])}
      >
        Add document link
      </button>
    </details>
  );
}
