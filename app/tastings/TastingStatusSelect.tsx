'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TASTING_STATUS_LABELS } from '../../lib/tastings/model';
import { getTastingStatusActions, type TastingStatusAction, type TastingStatusControlData } from '../../lib/tastings/statusActions';
import { transitionTastingAction } from './actions';
import './tasting-schedule.css';

export function TastingStatusSelect({ tasting, currentUserId, coordinator, label, showStatusLabel = false }: {
  tasting: TastingStatusControlData; currentUserId: string; coordinator: boolean; label: string; showStatusLabel?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const inFlight = useRef(false);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actions = getTastingStatusActions(tasting, { userId: currentUserId, coordinator });
  const choice = actions.find(option => option.status === selected);
  const statusLabel = TASTING_STATUS_LABELS[tasting.status];

  async function save(option: TastingStatusAction) {
    if (inFlight.current) return;
    if (!actions.some(action => action.status === option.status)) { setError('This tasting changed. Choose an available status.'); return; }
    if (option.comment === 'required' && !comment.trim()) { setError(option.commentLabel === 'What needs to change?' ? 'Explain what needs to change.' : 'Add a cancellation reason.'); commentInput.current?.focus(); return; }
    const form = new FormData();
    form.set('id', tasting.id); form.set('version', String(tasting.version)); form.set('action', 'SET_STATUS'); form.set('status', option.status);
    if (option.comment !== 'none') form.set('comment', comment.trim());
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await transitionTastingAction(form);
      if (!result.success) { setError(result.error || 'Could not save this status. Try again.'); if (option.comment === 'none') setSelected(''); return; }
      setSelected(''); setComment('');
      window.dispatchEvent(new CustomEvent('neat-action-success', { detail: `${option.label} saved.` }));
      router.refresh();
    } catch {
      setError('Could not save this status. Your entries are retained. Try again.');
      if (option.comment === 'none') setSelected('');
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (!actions.length) return <span className="pill">{statusLabel}</span>;
  return <div className="tasting-status-control" aria-busy={busy}>
    {showStatusLabel ? <span className="pill">{statusLabel}</span> : null}
    <select aria-label={`Status for ${label}`} value={selected} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : busy ? `${id}-saving` : undefined} onChange={event => {
      const value = event.target.value;
      setSelected(value); setComment(''); setError('');
      const option = actions.find(action => action.status === value);
      if (option?.comment === 'none') void save(option);
    }}>
      <option value="" disabled>{showStatusLabel ? 'Change status…' : statusLabel}</option>
      {actions.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}
    </select>
    {choice && choice.comment !== 'none' ? <form className="tasting-status-comment" onSubmit={event => { event.preventDefault(); void save(choice); }}>
      <label htmlFor={`${id}-comment`}>{choice.commentLabel}</label>
      <textarea ref={commentInput} id={`${id}-comment`} required={choice.comment === 'required'} maxLength={2000} rows={2} value={comment} disabled={busy} onChange={event => setComment(event.target.value)} />
      <div className="tasting-status-buttons"><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save status'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setSelected(''); setComment(''); setError(''); }}>Cancel</button></div>
    </form> : null}
    {busy ? <span className="field-note" id={`${id}-saving`} role="status">Saving status…</span> : null}
    {error ? <p className="field-note danger-text" id={`${id}-error`} role="alert">{error}</p> : null}
  </div>;
}
