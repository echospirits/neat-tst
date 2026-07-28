'use client';

import { useMemo, useState } from 'react';
import type { VisitFormAgencyOption } from './LogVisitForm';
import { VisitSubmitButton } from './VisitSubmitButton';

type TasterVisitFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  agencies: VisitFormAgencyOption[];
};

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const getAgencyMeta = (agency: VisitFormAgencyOption) =>
  [agency.agencyId, agency.city, agency.county].filter(Boolean).join(' / ');

export function TasterVisitForm({ action, agencies }: TasterVisitFormProps) {
  const [agencyId, setAgencyId] = useState('');
  const [agencySearch, setAgencySearch] = useState('');
  const searchText = normalize(agencySearch);
  const selectedAgency = agencies.find((agency) => agency.id === agencyId);
  const visibleAgencies = useMemo(
    () =>
      agencies
        .filter((agency) =>
          normalize([agency.name, agency.agencyId, agency.city, agency.county].filter(Boolean).join(' ')).includes(
            searchText,
          ),
        )
        .slice(0, 10),
    [agencies, searchText],
  );

  return (
    <form action={action} className="visit-form field-visit-form" encType="multipart/form-data">
      <input name="locationType" readOnly type="hidden" value="agency" />
      <input name="agencyId" readOnly type="hidden" value={agencyId} />

      <fieldset className="visit-step">
        <legend>1. Choose the retail liquor agency</legend>
        <div className="search-select">
          <label htmlFor="taster-agency-search">Find agency</label>
          <input
            aria-label="Search agencies"
            id="taster-agency-search"
            placeholder="Search name, agency ID, city, or county"
            type="search"
            value={agencySearch}
            onChange={(event) => setAgencySearch(event.target.value)}
          />
          <div className="quick-picker-list">
            {visibleAgencies.map((agency) => (
              <button
                className={agency.id === agencyId ? 'quick-picker is-selected' : 'quick-picker'}
                key={agency.id}
                type="button"
                onClick={() => setAgencyId(agency.id)}
              >
                <strong>{agency.name}</strong>
                <span>{getAgencyMeta(agency)}</span>
              </button>
            ))}
          </div>
          {selectedAgency ? <p className="selected-note">Selected: {selectedAgency.name}</p> : null}
        </div>
      </fieldset>

      <fieldset className="visit-step">
        <legend>2. Leave comments</legend>
        <label htmlFor="taster-comments">Visit comments</label>
        <textarea
          id="taster-comments"
          name="summary"
          placeholder="What happened during the tasting?"
          rows={5}
          required
        />
      </fieldset>

      <fieldset className="visit-step">
        <legend>3. Add a picture</legend>
        <label htmlFor="taster-photo">Visit picture</label>
        <input id="taster-photo" name="photoFile" type="file" accept="image/*" capture="environment" required />
        <input name="photoType" readOnly type="hidden" value="OTHER" />
        <input name="photoUrl" readOnly type="hidden" value="" />
        <input name="photoCaption" readOnly type="hidden" value="" />
        <p className="field-note">Take a new picture or choose one from your device. Maximum size: 5 MB.</p>
      </fieldset>

      <div className="visit-submit-bar">
        <VisitSubmitButton disabled={!selectedAgency} label="Log agency visit" />
      </div>
    </form>
  );
}
