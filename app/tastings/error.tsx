'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="card" role="alert"><h1>Tastings unavailable</h1><p>Your saved tastings are unchanged. Try loading them again.</p><button onClick={reset}>Try again</button></section>; }
