'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecordPicker } from '../components/RecordPicker';
import { reassignTastingAction } from './actions';

export type TastingAssigneeOption = { value: string; label: string };

// A refreshed assignment can move to another status group and mount a new control.
// This browser-only handoff survives that replacement without retaining request state on the server.
let pendingFocus: { id: string; version: number; userId: string; expires: number } | undefined;

export function TastingAssigneeSelect({ id, version, assignedTasterUserId, currentTasterName, label, canAssign, options, unavailableReason }: {
  id: string; version: number; assignedTasterUserId: string | null; currentTasterName: string;
  label: string; canAssign: boolean; options: TastingAssigneeOption[]; unavailableReason?: string;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const control = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt) control.current?.querySelector('summary')?.focus();
  }, [attempt]);
  useEffect(() => {
    if (!pendingFocus || pendingFocus.id !== id) return;
    if (pendingFocus.expires < Date.now()) { pendingFocus = undefined; return; }
    if (version <= pendingFocus.version || assignedTasterUserId !== pendingFocus.userId) return;
    pendingFocus = undefined;
    const element = control.current;
    const active = element?.ownerDocument?.activeElement;
    // Preserve a deliberate move to another control while the save was pending.
    if (!active || active === element?.ownerDocument?.body || element?.contains(active)) element?.querySelector('summary')?.focus();
  }, [id, version, assignedTasterUserId]);

  async function save(value: string) {
    if (inFlight.current || value === assignedTasterUserId) return;
    if (!canAssign || unavailableReason || !options.some(option => option.value === value)) return;
    const form = new FormData();
    form.set('id', id); form.set('version', String(version)); form.set('assignedTasterUserId', value);
    pendingFocus = { id, version, userId: value, expires: Date.now() + 10000 };
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await reassignTastingAction(form);
      if (!result.success) {
        if (pendingFocus?.id === id && pendingFocus.version === version) pendingFocus = undefined;
        setError(result.error || 'Could not change the taster. Try again.');
        setAttempt(previous => previous + 1);
        return;
      }
      window.dispatchEvent(new CustomEvent('neat-action-success', { detail: 'Assigned taster updated. Taster response reset for review.' }));
      router.refresh();
    } catch {
      if (pendingFocus?.id === id && pendingFocus.version === version) pendingFocus = undefined;
      setError('Could not confirm the taster change. Refresh to check the saved assignment.');
      setAttempt(previous => previous + 1);
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (!canAssign || unavailableReason) return <><span>{currentTasterName}</span>{canAssign && unavailableReason ? <small className="tasting-assignee-unavailable">{unavailableReason}</small> : null}</>;
  return <div ref={control} className="tasting-assignee-control" aria-busy={busy}>
    <RecordPicker key={`${id}:${version}:${attempt}`} label={`Assigned taster for ${label}`} name="assignedTasterUserId" options={options} defaultValue={assignedTasterUserId ?? ''} placeholder={currentTasterName} allowEmpty={false} disabled={busy || !options.length} error={error} onChange={value => { void save(value); }} />
    {busy ? <span className="field-note" role="status">Saving taster…</span> : !options.length ? <span className="field-note">No active tasters available.</span> : null}
  </div>;
}
