'use client';

import { type FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUPPORT_STATUSES } from '../../lib/supportShared';

export function SupportReplyForm({ ticketId, version, platform, status, date, priority, internal = false }: {
  ticketId: string; version: number; platform: boolean; status: keyof typeof SUPPORT_STATUSES; date: string; priority: string; internal?: boolean;
}) {
  const router = useRouter();
  const requestId = useRef('');
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [fixDate, setFixDate] = useState(date);
  const [selectedPriority, setSelectedPriority] = useState(priority);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget, data = new FormData(form);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const input = { requestId: requestId.current, version, action: internal ? 'note' : 'reply', body: data.get('body'),
      ...(platform && !internal ? { status: data.get('status'), anticipatedFixDate: data.get('anticipatedFixDate'), priority: data.get('priority') } : {}),
    };
    setSaving(true); setError(''); setSuccess(''); setFields({});
    try {
      const response = await fetch(`/api/support/${ticketId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Could not save your reply. Please try again.'); setFields(result.fields ?? {});
        const control = form.elements.namedItem(Object.keys(result.fields ?? {})[0]);
        if (control instanceof HTMLElement) control.focus();
        return;
      }
      requestId.current = '';
      const body = form.elements.namedItem('body');
      if (body instanceof HTMLTextAreaElement) body.value = '';
      setSuccess(internal ? 'Private note saved.' : 'Reply sent.'); router.refresh();
    } catch { setError('Could not connect to Support. Your text is still here; please try again.'); }
    finally { setSaving(false); }
  }
  return <form ref={formRef} className="support-form" onSubmit={submit} aria-busy={saving}>
    <label htmlFor={internal ? 'support-note' : 'support-reply'}>{internal ? 'Private platform note' : platform ? 'Response to the reporter' : 'Add a reply'}<textarea id={internal ? 'support-note' : 'support-reply'} name="body" rows={4} maxLength={5000} required aria-invalid={Boolean(fields.body)} aria-describedby={fields.body ? internal ? 'support-note-error' : 'support-body-error' : undefined} /></label>
    {fields.body ? <p id={internal ? 'support-note-error' : 'support-body-error'} className="support-field-error">{fields.body}</p> : null}
    {platform && !internal ? <><div className="support-form-row"><label htmlFor="support-status">Status<select id="support-status" name="status" value={selectedStatus} onChange={event => setSelectedStatus(event.target.value as keyof typeof SUPPORT_STATUSES)}>{Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option value={value} key={value}>{value === 'WAITING_ON_USER' ? 'Waiting for reporter' : label}</option>)}</select></label><label htmlFor="support-fix-date">Anticipated fix date (optional)<input id="support-fix-date" type="date" name="anticipatedFixDate" value={fixDate} onChange={event => setFixDate(event.target.value)} aria-invalid={Boolean(fields.anticipatedFixDate)} aria-describedby="support-fix-help" /></label></div>
      <p id="support-fix-help" className={fields.anticipatedFixDate ? 'support-field-error' : 'muted'}>{fields.anticipatedFixDate || 'Use Fix planned while a fix is pending. Dates are estimates; Complete means the answer or fix has been delivered.'}</p>
      <details className="support-details"><summary>Priority</summary><label htmlFor="support-priority">Queue priority<select id="support-priority" name="priority" value={selectedPriority} onChange={event => setSelectedPriority(event.target.value)}><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></select></label></details><p className="muted">This response and status will be visible to the reporter and organization admin. The reporter will see a banner until they acknowledge it.</p></>
      : <p className="muted">{internal ? 'Only Platform Admin can see this note. It will not notify the reporter.' : status === 'COMPLETE' ? 'Replying will reopen this ticket so Platform Admin can help again.' : 'Your reply is shared with Platform Admin and your organization admin.'}</p>}
    {error ? <p className="support-field-error" role="alert">{error}</p> : null}
    {success ? <p role="status">{success}</p> : null}
    <div className="support-actions"><button disabled={saving} type="submit">{saving ? 'Saving…' : internal ? 'Save private note' : platform ? 'Send response & update' : status === 'COMPLETE' ? 'Reply & reopen ticket' : 'Send reply'}</button>{error ? <button className="secondary" type="button" onClick={() => router.refresh()}>Reload ticket (keep text)</button> : null}</div>
  </form>;
}
