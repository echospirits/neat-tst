'use client';

import { useEffect, useState } from 'react';
import { CrmForm } from '../components/CrmForm';
import { CrmAccountPicker } from '../components/CrmAccountPicker';
import { RecordPicker } from '../components/RecordPicker';
import { saveTastingAction } from './actions';

export type TastingEditorValue = { id: string; version: number; agencyId: string; agencyName: string; assignedTasterUserId: string | null; date: string; startTime: string; endTime: string; contactId: string | null; tasterNotes: string | null; internalNotes: string | null };
export function TastingEditor({ event, users, initialAgency }: { event?: TastingEditorValue; users: Array<{ value: string; label: string }>; initialAgency?: { id: string; name: string } }) {
  const [key, setKey] = useState('');
  const [agency, setAgency] = useState(event?.agencyId ?? initialAgency?.id ?? '');
  const [contacts, setContacts] = useState<Array<{ value: string; label: string }>>([]);
  const [contactMessage, setContactMessage] = useState('');
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    setContacts([]);
    if (!agency) return;
    const controller = new AbortController();
    setContactMessage('Loading contacts…');
    fetch(`/api/tastings/contacts?agencyId=${encodeURIComponent(agency)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const data = await response.json() as { contacts: Array<{ value: string; label: string }> };
      setContacts(data.contacts); setContactMessage(data.contacts.length ? '' : 'No saved contacts at this Agency.');
    }).catch(() => { if (!controller.signal.aborted) setContactMessage('Contacts unavailable. You can save without a contact and add one later.'); });
    return () => controller.abort();
  }, [agency]);
  const selectedAgency = event ? { id: event.agencyId, name: event.agencyName } : initialAgency;
  return <CrmForm action={saveTastingAction} submitLabel={event ? 'Save changes' : 'Create draft'}>
    <input type="hidden" name="id" value={event?.id ?? ''} />
    <input type="hidden" name="version" value={event?.version ?? 0} />
    <input type="hidden" name="submissionKey" value={key} />
    <CrmAccountPicker agencyOnly onAccountChange={setAgency} initial={selectedAgency ? { accountType: 'AGENCY', accountId: selectedAgency.id, name: selectedAgency.name } : undefined} />
    <div className="tasting-form-grid">
      <label>Date <input name="date" type="date" required defaultValue={event?.date} /></label>
      <label>Start time <input name="startTime" type="time" required defaultValue={event?.startTime ?? '17:00'} /></label>
      <label>End time <input name="endTime" type="time" required defaultValue={event?.endTime ?? '19:00'} /></label>
    </div>
    <p className="field-note">America/New_York · changing the store, date or time requires approval review.</p>
    <RecordPicker label="Assigned taster" name="assignedTasterUserId" options={users} defaultValue={event?.assignedTasterUserId ?? ''} allowEmpty={false} placeholder="Choose a taster" />
    <RecordPicker key={agency} label="Store contact / approver" name="contactId" options={contacts} defaultValue={agency === event?.agencyId ? event.contactId ?? '' : ''} placeholder="Choose a contact (optional)" clearLabel="No contact" />
    {contactMessage ? <p className="field-note" role="status">{contactMessage}</p> : null}
    <label>Notes for taster <textarea name="tasterNotes" maxLength={5000} rows={3} defaultValue={event?.tasterNotes ?? ''} /></label>
    <details className="tasting-support"><summary>Internal notes and spacing override</summary>
      <label>Internal notes <textarea name="internalNotes" maxLength={5000} rows={3} defaultValue={event?.internalNotes ?? ''} /></label>
      <label>Spacing override reason <textarea name="spacingOverrideReason" maxLength={2000} rows={2} /></label>
      <p className="field-note">Only needed for an approved exception to the same-store spacing rule. Overlapping taster assignments are blocked.</p>
    </details>
  </CrmForm>;
}
