import { StateAccessPicker } from '../../components/StateAccessPicker';
import { SubmitButton } from '../../components/SubmitButton';
import { stateName } from '../../../lib/stateOptions';

export function EchoDataSettings({ enabledStates, vendors, saveStates, addVendor }: {
  enabledStates: string[];
  vendors: { id: string; vendorId: string; label: string | null }[];
  saveStates: (form: FormData) => Promise<void>;
  addVendor: (form: FormData) => Promise<void>;
}) {
  return <section className="platform-grid" aria-label="Echo data settings">
    <article className="card"><h2>Account states</h2><p>{enabledStates.map(stateName).join(', ')}</p><details><summary>Change account states</summary><form action={saveStates}><StateAccessPicker selected={enabledStates} /><SubmitButton>Save account states</SubmitButton></form></details></article>
    <article className="card"><h2>Ohio Vendor IDs</h2><p className="muted">These identifiers determine which Echo products can be discovered.</p>
      {vendors.length ? <ul>{vendors.map(v => <li key={v.id}><strong>{v.vendorId}</strong>{v.label ? ` · ${v.label}` : ''}</li>)}</ul> : <p className="muted">No Vendor IDs configured.</p>}
      <details><summary>Add a Vendor ID</summary><form action={addVendor}><label>Ohio Vendor ID<input name="vendorId" required maxLength={32} autoCapitalize="characters" /></label><label>Label (optional)<input name="label" maxLength={160} /></label><SubmitButton>Add Vendor ID</SubmitButton></form></details>
    </article>
  </section>;
}
