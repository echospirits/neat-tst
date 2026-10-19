'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SupportScreenshot({ ticketId, canRemove }: { ticketId: string; canRemove: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedImage, setFailedImage] = useState(false);
  const [retry, setRetry] = useState(0);
  async function remove() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/support/${ticketId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove-screenshot' }) });
      if (!response.ok) throw new Error('Could not remove the screenshot. Please try again.');
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <details className="support-details"><summary>Screenshot</summary>
    {failedImage ? <p role="alert">Could not load the screenshot. <button className="secondary" onClick={() => { setFailedImage(false); setRetry(value => value + 1); }}>Retry image</button></p>
      : <a href={`/api/support/${ticketId}/screenshot`} target="_blank" rel="noreferrer"><img className="support-screenshot-preview" src={`/api/support/${ticketId}/screenshot?retry=${retry}`} alt="Screenshot included with this report; open full size" onError={() => setFailedImage(true)} /></a>}
    {canRemove ? confirming ? <div className="support-actions"><span>Remove this screenshot permanently?</span><button className="secondary" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Remove screenshot'}</button><button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep screenshot</button></div> : <button className="secondary" onClick={() => setConfirming(true)}>Remove screenshot</button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}
