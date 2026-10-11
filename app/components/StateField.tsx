'use client';

import { useEffect, useId, useRef } from 'react';
import { US_STATES } from '../../lib/usStates';

export function StateField({ name = 'state', defaultValue = 'OH', required = true, allowedStates }: { name?: string; defaultValue?: string; required?: boolean; allowedStates?: string[] }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = defaultValue;
  }, [defaultValue]);
  return <><label>State<input ref={input} name={name} defaultValue={defaultValue} list={id} required={required} autoComplete="address-level1" placeholder={required ? 'State name or abbreviation' : 'All states'} /></label>
    <datalist id={id}>{US_STATES.filter(state => !allowedStates || allowedStates.includes(state.code)).map(({ code, name: label }) => <option key={code} value={code}>{label}</option>)}</datalist>
  </>;
}
