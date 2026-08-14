'use client';

import { useEffect, useMemo, useState } from 'react';
import { addEasternCalendarDays, EASTERN_TIME_ZONE } from '../../lib/dateTime';
import type { VisitLocationType } from '../../lib/visitPickerOptions';
import { getVisitOutcomes, type VisitFollowUpMode } from '../../lib/visitWorkflow';
import { DatePickerField } from '../components/DatePickerField';
import { VoiceVisitNotePanel } from './VoiceVisitNotePanel';
import { VisitSubmitButton } from './VisitSubmitButton';
import { useVisitPhotoFormAction } from './clientPhotoUpload';

const photoSlots = [1, 2, 3] as const;

export type { VisitLocationType };

export type VisitFormAgencyOption = {
  id: string;
  agencyId: string;
  lastVisitAt: string | null;
  name: string;
  city: string | null;
  county: string | null;
  phone: string | null;
};

export type VisitFormWholesaleOption = {
  id: string;
  licenseeId: string;
  lastVisitAt: string | null;
  name: string;
  agencyId: string | null;
  city: string | null;
  county: string | null;
  phone: string | null;
};

export type VisitFormContactOption = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  agencyId: string | null;
  wholesaleAccountId: string | null;
};

export type VisitFormTagOption = {
  id: string;
  name: string;
  color: string | null;
};

type VisitFormInitialValues = {
  locationType?: VisitLocationType;
  locationName?: string | null;
  locationLocked?: boolean;
  agencyId?: string | null;
  wholesaleAccountId?: string | null;
  contactId?: string | null;
  summary?: string | null;
  outcomeCodes?: string[];
  outcomes?: string | null;
  nextStep?: string | null;
  followUpMode?: VisitFollowUpMode;
  followUpDate?: string | null;
  startVoiceNote?: boolean;
};

type LogVisitFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  agencies: VisitFormAgencyOption[];
  wholesaleAccounts: VisitFormWholesaleOption[];
  contacts: VisitFormContactOption[];
  tags?: VisitFormTagOption[];
  actorName: string;
  formOrigin?: 'visits' | 'worklist';
  worklistItemId?: string;
  initialValues?: VisitFormInitialValues;
  mode?: 'create' | 'edit';
  submitLabel?: string;
};

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const searchable = (...values: Array<string | null | undefined>) => normalize(values.filter(Boolean).join(' '));
const includesSearch = (searchText: string, ...values: Array<string | null | undefined>) =>
  !searchText || searchable(...values).includes(searchText);
const withSelected = <T extends { id: string }>(items: T[], selected: T | undefined) =>
  selected && !items.some((item) => item.id === selected.id) ? [selected, ...items] : items;

const getAgencyMeta = (agency: VisitFormAgencyOption) =>
  [agency.agencyId, agency.city, agency.phone].filter(Boolean).join(' / ');
const getWholesaleMeta = (account: VisitFormWholesaleOption) =>
  [account.licenseeId, account.city, account.phone].filter(Boolean).join(' / ');
const getContactMeta = (contact: VisitFormContactOption) =>
  [contact.role, contact.phone, contact.email].filter(Boolean).join(' / ');

const lastVisitFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: EASTERN_TIME_ZONE,
});
const getLastVisitLabel = (lastVisitAt: string | null) =>
  lastVisitAt ? `Visited ${lastVisitFormatter.format(new Date(lastVisitAt))}` : 'Not visited yet';

export function LogVisitForm({
  action,
  agencies,
  wholesaleAccounts,
  contacts,
  tags = [],
  actorName,
  formOrigin = 'visits',
  worklistItemId,
  initialValues,
  mode = 'create',
  submitLabel = 'Save visit',
}: LogVisitFormProps) {
  const [locationType, setLocationType] = useState<VisitLocationType>(initialValues?.locationType ?? 'wholesale');
  const [agencyId, setAgencyId] = useState(initialValues?.agencyId ?? '');
  const [wholesaleAccountId, setWholesaleAccountId] = useState(initialValues?.wholesaleAccountId ?? '');
  const [isChangingLocation, setIsChangingLocation] = useState(!initialValues?.locationLocked);
  const [contactId, setContactId] = useState(initialValues?.contactId ?? '');
  const [locationSearch, setLocationSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [summary, setSummary] = useState(initialValues?.summary ?? '');
  const [selectedOutcomes, setSelectedOutcomes] = useState(initialValues?.outcomeCodes ?? []);
  const [legacyOutcomes, setLegacyOutcomes] = useState(initialValues?.outcomes ?? '');
  const [followUpMode, setFollowUpMode] = useState<VisitFollowUpMode>(initialValues?.followUpMode ?? 'none');
  const [followUpText, setFollowUpText] = useState(initialValues?.nextStep ?? '');
  const [followUpDate, setFollowUpDate] = useState(initialValues?.followUpDate ?? '');
  const [isVoiceNoteOpen, setIsVoiceNoteOpen] = useState(initialValues?.startVoiceNote ?? false);
  const [submissionKey, setSubmissionKey] = useState('');
  const [newWholesaleName, setNewWholesaleName] = useState('');
  const { formAction, photoUploadError } = useVisitPhotoFormAction(action);

  useEffect(() => {
    setSubmissionKey(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  }, []);

  const searchText = normalize(locationSearch);
  const contactSearchText = normalize(contactSearch);
  const selectedAgency =
    agencies.find((agency) => agency.id === agencyId) ??
    (locationType === 'agency' && agencyId && initialValues?.locationName
      ? { id: agencyId, agencyId: '', lastVisitAt: null, name: initialValues.locationName, city: null, county: null, phone: null }
      : undefined);
  const selectedWholesaleAccount =
    wholesaleAccounts.find((account) => account.id === wholesaleAccountId) ??
    (locationType === 'wholesale' && wholesaleAccountId && initialValues?.locationName
      ? { id: wholesaleAccountId, licenseeId: '', lastVisitAt: null, name: initialValues.locationName, agencyId: null, city: null, county: null, phone: null }
      : undefined);
  const selectedLocation = locationType === 'agency' ? selectedAgency : selectedWholesaleAccount;
  const selectedContact = contacts.find((contact) => contact.id === contactId);
  const visibleLocations = useMemo(() => {
    const options = locationType === 'agency' ? agencies : wholesaleAccounts;
    return withSelected(
      options
        .filter((option) =>
          includesSearch(
            searchText,
            option.name,
            'licenseeId' in option ? option.licenseeId : option.agencyId,
            option.city,
            option.county,
            option.phone,
          ),
        )
        .slice(0, searchText ? 8 : 5),
      selectedLocation,
    );
  }, [agencies, locationType, searchText, selectedLocation, wholesaleAccounts]);
  const visibleContacts = useMemo(() => {
    const agencyKeys = new Set([selectedAgency?.id, selectedAgency?.agencyId, agencyId].filter(Boolean));
    const scopedContacts = contacts.filter((contact) =>
      locationType === 'agency'
        ? !!contact.agencyId && agencyKeys.has(contact.agencyId)
        : !!wholesaleAccountId && contact.wholesaleAccountId === wholesaleAccountId,
    );
    return withSelected(
      scopedContacts
        .filter((contact) => includesSearch(contactSearchText, contact.name, contact.role, contact.phone, contact.email))
        .slice(0, 6),
      selectedContact,
    );
  }, [agencyId, contactSearchText, contacts, locationType, selectedAgency, selectedContact, wholesaleAccountId]);

  const outcomeOptions = getVisitOutcomes(locationType);
  const voiceAccountContext = selectedLocation
    ? {
        id: selectedLocation.id,
        name: selectedLocation.name,
        identifier: 'licenseeId' in selectedLocation ? selectedLocation.licenseeId : selectedLocation.agencyId,
        city: selectedLocation.city,
        phone: selectedLocation.phone,
      }
    : null;
  const hasLocation = locationType === 'agency' ? Boolean(agencyId) : Boolean(wholesaleAccountId);
  const canSave = hasLocation || (locationType === 'wholesale' && Boolean(newWholesaleName.trim()));

  const handleLocationTypeChange = (nextType: VisitLocationType) => {
    setLocationType(nextType);
    setAgencyId('');
    setWholesaleAccountId('');
    setContactId('');
    setLocationSearch('');
    setSelectedOutcomes([]);
  };

  const handleFollowUpModeChange = (mode: VisitFollowUpMode) => {
    setFollowUpMode(mode);
    if (mode !== 'none' && !followUpDate) setFollowUpDate(addEasternCalendarDays(7));
    if (mode === 'none') {
      setFollowUpDate('');
      setFollowUpText('');
    }
  };

  return (
    <form action={formAction} className="visit-form field-visit-form">
      <input name="formOrigin" readOnly type="hidden" value={formOrigin} />
      <input name="locationType" readOnly type="hidden" value={locationType} />
      <input name="agencyId" readOnly type="hidden" value={locationType === 'agency' ? agencyId : ''} />
      <input name="wholesaleAccountId" readOnly type="hidden" value={locationType === 'wholesale' ? wholesaleAccountId : ''} />
      <input name="contactId" readOnly type="hidden" value={contactId} />
      <input name="outcomes" readOnly type="hidden" value={legacyOutcomes} />
      <input name="submissionKey" readOnly type="hidden" value={submissionKey} />
      {worklistItemId ? <input name="worklistItemId" readOnly type="hidden" value={worklistItemId} /> : null}
      {photoUploadError ? <p className="toast-notice page-status" role="alert">{photoUploadError}</p> : null}

      <fieldset className="visit-step visit-account-step">
        <legend>Account</legend>
        {!isChangingLocation && selectedLocation ? (
          <div className="selected-location-card">
            <div>
              <span>{locationType === 'agency' ? 'Agency' : 'Wholesale'}</span>
              <strong>{selectedLocation.name}</strong>
            </div>
            <button className="secondary compact-btn" type="button" onClick={() => setIsChangingLocation(true)}>Change</button>
          </div>
        ) : (
          <>
            <div className="segmented-control" role="group" aria-label="Visit type">
              {(['wholesale', 'agency'] as const).map((type) => (
                <button
                  aria-pressed={locationType === type}
                  className={locationType === type ? 'is-active' : ''}
                  key={type}
                  type="button"
                  onClick={() => handleLocationTypeChange(type)}
                >
                  {type === 'wholesale' ? 'Wholesale' : 'Agency'}
                </button>
              ))}
            </div>
            <div className="search-select">
              <label htmlFor="visit-location-search">Find {locationType === 'agency' ? 'agency' : 'wholesale account'}</label>
              <input
                id="visit-location-search"
                placeholder="Search name, ID, city, or phone"
                type="search"
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
              />
              {!searchText ? <p className="field-note">Recently visited first</p> : null}
              <div className="quick-picker-list">
                {visibleLocations.map((location) => (
                  <button
                    className={location.id === selectedLocation?.id ? 'quick-picker is-selected' : 'quick-picker'}
                    key={location.id}
                    type="button"
                    onClick={() => {
                      if (locationType === 'agency') setAgencyId(location.id);
                      else setWholesaleAccountId(location.id);
                      setContactId('');
                      setIsChangingLocation(false);
                    }}
                  >
                    <strong>{location.name}</strong>
                    <span>{'licenseeId' in location ? getWholesaleMeta(location) : getAgencyMeta(location)}</span>
                    <span className="quick-picker-last">{getLastVisitLabel(location.lastVisitAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="visit-step visit-outcome-step">
        <legend>What happened?</legend>
        <div className="visit-outcome-grid">
          {outcomeOptions.map((outcome) => (
            <label className="visit-outcome-chip" key={outcome.code}>
              <input
                checked={selectedOutcomes.includes(outcome.code)}
                name="outcomeCode"
                type="checkbox"
                value={outcome.code}
                onChange={(event) => {
                  setSelectedOutcomes((current) => {
                    if (!event.target.checked) return current.filter((code) => code !== outcome.code);
                    if (outcome.code === 'follow-up-needed') return [...current.filter((code) => code !== 'no-action-needed'), outcome.code];
                    if (outcome.code === 'no-action-needed') return [...current.filter((code) => code !== 'follow-up-needed'), outcome.code];
                    return [...current, outcome.code];
                  });
                  if (outcome.code === 'follow-up-needed' && event.target.checked && followUpMode === 'none') {
                    handleFollowUpModeChange('later');
                  }
                  if (outcome.code === 'no-action-needed' && event.target.checked) handleFollowUpModeChange('none');
                }}
              />
              <span>{outcome.label}</span>
            </label>
          ))}
        </div>
        <label htmlFor="visit-notes">Visit notes <span className="optional-label">Optional</span></label>
        <textarea
          id="visit-notes"
          name="summary"
          rows={3}
          placeholder="Key conversation, product interest, or anything worth remembering"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </fieldset>

      <fieldset className="visit-step visit-follow-up-step">
        <legend>Next step</legend>
        <div className="follow-up-choice-grid">
          {([
            ['none', 'No follow-up'],
            ['later', 'Save next step'],
            ['task', 'Create worklist item'],
          ] as const).map(([mode, label]) => (
            <label className="follow-up-choice" key={mode}>
              <input checked={followUpMode === mode} name="followUpMode" type="radio" value={mode} onChange={() => handleFollowUpModeChange(mode)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {followUpMode !== 'none' ? (
          <div className="follow-up-fields">
            <label htmlFor="follow-up-text">What needs to happen?</label>
            <input
              id="follow-up-text"
              name="nextStep"
              placeholder="Send pricing, check inventory, schedule tasting…"
              value={followUpText}
              onChange={(event) => setFollowUpText(event.target.value)}
            />
            <DatePickerField
              name="followUpDate"
              pickerLabel={followUpMode === 'task' ? 'Task due date' : 'Follow-up date'}
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
            />
            {followUpMode === 'task' ? <p className="task-preview">A worklist item will be assigned to {actorName}.</p> : null}
          </div>
        ) : null}
      </fieldset>

      <details className="visit-details">
        <summary>Add details <span>Contact, voice note, photo, or new account</span></summary>
        <div className="visit-details-content">
          {mode === 'create' ? <details
            className="compact-details nested-details"
            open={isVoiceNoteOpen}
            onToggle={(event) => setIsVoiceNoteOpen(event.currentTarget.open)}
          >
            <summary>Dictate and structure a visit note</summary>
            <VoiceVisitNotePanel
              accountContext={voiceAccountContext}
              nextStep={followUpText}
              outcomes={legacyOutcomes}
              setNextStep={(value) => {
                setFollowUpText(value);
                if (value && followUpMode === 'none') handleFollowUpModeChange('later');
              }}
              setOutcomes={setLegacyOutcomes}
              setSummary={setSummary}
              summary={summary}
              visitType={locationType}
            />
          </details> : null}

          <details className="compact-details nested-details">
            <summary>{selectedContact ? `Contact: ${selectedContact.name}` : 'Add a contact'}</summary>
            <label htmlFor="visit-contact-search">Saved contacts</label>
            <input id="visit-contact-search" placeholder="Search contacts" type="search" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} />
            {visibleContacts.length > 0 ? (
              <div className="quick-picker-list">
                {visibleContacts.map((contact) => (
                  <button className={contact.id === contactId ? 'quick-picker is-selected' : 'quick-picker'} key={contact.id} type="button" onClick={() => setContactId(contact.id)}>
                    <strong>{contact.name}</strong><span>{getContactMeta(contact) || 'Contact'}</span>
                  </button>
                ))}
              </div>
            ) : <p className="field-note">Choose an account to see its contacts.</p>}
            {mode === 'create' ? <div className="form-grid">
              <input aria-label="New contact name" name="newContactName" placeholder="Or enter a new contact name" />
              <input aria-label="New contact phone" name="newContactPhone" placeholder="Phone (optional)" />
            </div> : null}
          </details>

          {mode === 'create' && locationType === 'wholesale' && !wholesaleAccountId ? (
            <details className="compact-details nested-details">
              <summary>Create a wholesale account</summary>
              <div className="form-grid">
                <input name="newWholesaleName" placeholder="Account name" value={newWholesaleName} onChange={(event) => setNewWholesaleName(event.target.value)} />
                <input name="newWholesaleLicenseeId" placeholder="Licensee ID (optional)" />
                <input name="newWholesalePhone" placeholder="Phone (optional)" />
                <input name="newWholesaleCity" placeholder="City (optional)" />
              </div>
              {tags.length > 0 ? (
                <div className="tag-checkbox-grid">
                  {tags.map((tag) => (
                    <label className="tag-checkbox" key={tag.id}>
                      <input name="newWholesaleTagId" type="checkbox" value={tag.id} />
                      <span className="tag-swatch" style={{ backgroundColor: tag.color ?? '#7c9cff' }} />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </details>
          ) : null}

          {mode === 'create' ? <details className="compact-details nested-details">
            <summary>Add photo proof</summary>
            {photoSlots.map((slot) => (
              <div className="photo-entry streamlined-photo-entry" key={slot}>
                <input name="photoType" readOnly type="hidden" value="OTHER" />
                <label htmlFor={`visit-photo-${slot}`}>{slot === 1 ? 'Photo' : `Additional photo ${slot}`}</label>
                <input id={`visit-photo-${slot}`} name="photoFile" type="file" accept="image/*" />
                <input name="photoUrl" readOnly type="hidden" value="" />
                <input aria-label={`Photo ${slot} caption`} name="photoCaption" placeholder="Caption (optional)" />
              </div>
            ))}
          </details> : null}
        </div>
      </details>

      <div className="visit-submit-bar">
        <VisitSubmitButton disabled={!canSave} label={submitLabel} />
        {!canSave ? <p>Select an account to save.</p> : null}
      </div>
    </form>
  );
}
