'use client';
export default function SocialError({ reset }: { reset: () => void }) { return <section className="social-page"><h1>Social Publishing is unavailable</h1><p role="alert">Your posts have not changed. Try again, or ask an administrator to check the pilot configuration.</p><button type="button" onClick={reset}>Try again</button></section>; }
