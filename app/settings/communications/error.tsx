"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <section className="card crm-panel">
      <h1>Communications could not load</h1>
      <p>Your saved records have not changed.</p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
