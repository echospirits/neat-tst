'use client';
import { useState } from 'react';
import { STATE_OPTIONS } from '../../lib/stateOptions';

export function StateAccessPicker({ selected = ['OH'] }: { selected?: string[] }) {
  const [query, setQuery] = useState('');
  const [states, setStates] = useState(selected);
  const visible = STATE_OPTIONS.filter(([code, name]) => states.includes(code) || `${code} ${name}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <fieldset className="state-access-picker">
    <legend>States</legend>
    <p className="muted">Choose the states Echo uses for Retail and Restaurants. Account and sales-data availability varies by state.</p>
    <label>Find a state<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="State name or abbreviation" /></label>
    <p aria-live="polite">{states.length} selected{!visible.length ? ' · No matching states' : ''}</p>
    <div className="state-access-options">{visible.map(([code, name]) => <label className="checkbox-label" key={code}><input type="checkbox" checked={states.includes(code)} onChange={event => setStates(event.target.checked ? [...states, code] : states.filter(value => value !== code))} />{name}</label>)}</div>
    {states.map(code => <input key={code} type="hidden" name="enabledStates" value={code} />)}
    {!states.length ? <p className="notice danger" role="alert">Select at least one state before saving.</p> : null}
  </fieldset>;
}
