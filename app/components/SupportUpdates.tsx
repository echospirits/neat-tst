'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supportDate, SUPPORT_STATUSES } from '../../lib/supportShared';

type SupportUpdate = { id: string; number: number; title: string; description: string; status: keyof typeof SUPPORT_STATUSES; responseVersion: number; anticipatedFixDate: string | null; messages: { body: string }[] };

export function SupportUpdates({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [updates, setUpdates] = useState<SupportUpdate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const acknowledged = useRef(new Map<string, number>());
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current !== userId) { acknowledged.current.clear(); lastUser.current = userId; }
    let stopped = false, pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const response = await fetch('/api/support/updates', { cache: 'no-store' });
        if (response.ok) {
          const result = await response.json();
          if (!stopped) setUpdates(result.updates.filter((item: SupportUpdate) => item.responseVersion > (acknowledged.current.get(item.id) ?? 0)));
        }
      } catch { /* A background support check must not interrupt field work. */ }
      finally { pending = false; }
    };
    setUpdates([]);
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [userId, pathname]);

  async function acknowledge(update: SupportUpdate) {
    setBusy(update.id); setError('');
    try {
      const response = await fetch(`/api/support/${update.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seen', version: update.responseVersion }) });
      if (!response.ok) throw new Error('Could not acknowledge this update. Please try again.');
      acknowledged.current.set(update.id, update.responseVersion);
      setUpdates(current => current.filter(item => item.id !== update.id || item.responseVersion > update.responseVersion));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(null); }
  }

  if (!updates.length) return null;
  return <section className="support-updates" aria-label="Support responses">
    {updates.slice(0, 1).map(update => <article className="support-update" key={update.id}>
      <div className="support-update-heading"><strong>Support replied to #{update.number}</strong><span className="pill">{SUPPORT_STATUSES[update.status]}</span></div>
      <p><strong>You reported:</strong> {update.title}</p>
      <p className="support-text"><strong>Response:</strong> {update.messages[0]?.body.slice(0, 300)}{(update.messages[0]?.body.length ?? 0) > 300 ? '…' : ''}</p>
      {update.anticipatedFixDate ? <p>Anticipated fix: {supportDate(update.anticipatedFixDate)} <span className="muted">(estimate)</span></p> : null}
      <div className="support-actions"><Link className="btn secondary" href={`/support/${update.id}`}>View ticket &amp; reply</Link><button className="secondary" disabled={busy !== null} onClick={() => void acknowledge(update)}>{busy === update.id ? 'Saving…' : 'Got it'}</button></div>
    </article>)}
    {updates.length > 1 ? <Link href="/support?scope=mine&status=all">More support replies are waiting · View your tickets</Link> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
