'use client';

export default function SupportErrorPage({ reset }: { reset: () => void }) {
  return <section className="card support-form" role="alert"><h1>Support is temporarily unavailable</h1><p>We could not load your tickets. Please try again.</p><button onClick={reset}>Try again</button></section>;
}
