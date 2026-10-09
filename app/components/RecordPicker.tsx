'use client';

import { useId, useRef, useState } from 'react';

/** Search the complete supplied list; only the visible suggestions are limited. */
export function RecordPicker({ label, name, options, defaultValue = '', placeholder = 'Choose an account (optional)', clearLabel = 'No account', allowEmpty = true, disabled = false, error, onChange }: { label: string; name: string; options: Array<{ value: string; label: string }>; defaultValue?: string; placeholder?: string; clearLabel?: string; allowEmpty?: boolean; disabled?: boolean; error?: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState('');
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const matches = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (next: string) => {
    setValue(next);
    onChange?.(next);
    setQuery('');
    if (details.current) {
      details.current.open = false;
      details.current.querySelector('summary')?.focus();
    }
  };
  return <div className="record-picker">
    <span id={id}>{label}</span>
    <input name={name} type="hidden" value={value} />
    <details ref={details} onToggle={(event) => { if (event.currentTarget.open) { if (disabled) event.currentTarget.open = false; else search.current?.focus(); } }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); if (details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); } } }}>
      <summary aria-labelledby={id + ' ' + id + '-selection'} aria-disabled={disabled || undefined} aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined} onClick={event => { if (disabled) event.preventDefault(); }}><span id={id + '-selection'}>{options.find((option) => option.value === value)?.label ?? placeholder}</span></summary>
      <div className="record-picker-results">
        <input aria-label={`Search ${label.toLowerCase()}`} ref={search} type="search" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} />
        {allowEmpty ? <button className="secondary" type="button" disabled={disabled} onClick={() => choose('')}>{clearLabel}</button> : null}
        <p className="field-note" aria-live="polite">{matches.length} matches{matches.length > 30 ? ' · Showing 30; keep typing to narrow' : ''}</p>
        {matches.slice(0, 30).map((option) => <button aria-pressed={value === option.value} className="secondary" key={option.value} type="button" disabled={disabled} onClick={() => choose(option.value)}>{option.label}</button>)}
      </div>
    </details>
    {error ? <p id={id + '-error'} className="support-field-error">{error}</p> : null}
  </div>;
}
