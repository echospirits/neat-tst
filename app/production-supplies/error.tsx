'use client';
import Link from 'next/link';
export default function Error({ reset }: { reset: () => void }) { return <section><h1>Production Supplies unavailable</h1><p role="alert">We could not load the latest records. Try again to check their current state.</p><button onClick={reset}>Try again</button><p><Link href="/production-supplies/settings">Check supply connections</Link></p></section>; }
