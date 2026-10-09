'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_SUPPORT_SCREENSHOT_BYTES, readSupportTrail, SUPPORT_CATEGORIES, type SupportTrailEntry } from '../../lib/supportShared';
import { RecordPicker } from '../components/RecordPicker';

async function prepareScreenshot(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image under 10 MB.');
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 40_000_000) throw new Error('This image is too large. Choose a smaller screenshot.');
    const scale = Math.min(1, 1440 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare this screenshot.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Canvas exports strip file metadata. Keep one small image behind ticket authorization.
    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_SUPPORT_SCREENSHOT_BYTES) return new File([blob], 'screenshot.jpg', { type: 'image/jpeg' });
    }
    throw new Error('This screenshot is too detailed. Crop it to the problem area and try again.');
  } finally { image.close(); }
}

function browserName() {
  const agent = navigator.userAgent;
  return /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Other';
}

export function SupportReportForm({ scope, screenshotsEnabled, organizations, initialOrganizationId = '' }: { scope: string; screenshotsEnabled: boolean; organizations?: Array<{ id: string; displayName: string }>; initialOrganizationId?: string }) {
  const router = useRouter();
  const requestId = useRef('');
  const [trail, setTrail] = useState<SupportTrailEntry[]>([]);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{ id: string; number: number } | null>(null);
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const reportTrail = organizations && organizationId !== initialOrganizationId ? [] : trail;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
    try { setTrail(readSupportTrail(sessionStorage, scope)); } catch { setTrail([]); }
  }, [scope]);
  useEffect(() => {
    if (!screenshot) { setPreview(''); return; }
    const url = URL.createObjectURL(screenshot); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  async function selectScreenshot(file: File | undefined) {
    setScreenshot(null); setError('');
    if (!file) return;
    setPreparing(true);
    try { setScreenshot(await prepareScreenshot(file)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare this screenshot.'); }
    finally { setPreparing(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || preparing) return;
    const data = new FormData(event.currentTarget);
    if (organizations && !data.get('organizationId')) {
      setFields({ organizationId: 'Choose an organization.' }); setError('Choose the organization this ticket belongs to.');
      formRef.current?.querySelector<HTMLElement>('.record-picker summary')?.focus();
      return;
    }
    data.delete('screenshot');
    data.set('requestId', requestId.current || (requestId.current = crypto.randomUUID()));
    if (screenshot) data.set('screenshot', screenshot);
    if (includeDiagnostics) data.set('diagnostics', JSON.stringify({ trail: reportTrail, browser: browserName(), viewport: { width: window.innerWidth, height: window.innerHeight } }));
    setSaving(true); setError(''); setFields({});
    try {
      const response = await fetch('/api/support', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) {
        setFields(result.fields ?? {}); setError(result.error || 'Could not send your report. Please try again.');
        const field = Object.keys(result.fields ?? {})[0];
        const control = formRef.current?.elements.namedItem(field);
        if (field === 'organizationId') formRef.current?.querySelector<HTMLElement>('.record-picker summary')?.focus();
        else if (control instanceof HTMLElement) control.focus();
        return;
      }
      setSaved(result); router.refresh();
    } catch { setError('Could not connect to Support. Your report is still here; please try again.'); }
    finally { setSaving(false); }
  }

  if (saved) return <section className="card support-form" role="status"><h2>Ticket #{saved.number} sent</h2><p>Platform Admin will review it. Replies will appear here and in a banner when you next use Neat.</p><div className="support-actions"><Link className="btn" href={`/support/${saved.id}`}>View your ticket</Link><Link className="btn secondary" href={reportTrail.at(-1)?.path ?? '/support'}>Return to your work</Link></div></section>;
  return <form ref={formRef} className="card support-form" onSubmit={submit} aria-busy={saving || preparing}>
    {organizations ? <RecordPicker label="Organization" name="organizationId" options={organizations.map(org => ({ value: org.id, label: org.displayName }))} defaultValue={initialOrganizationId} placeholder="Choose an organization" allowEmpty={false} disabled={saving || preparing} error={fields.organizationId} onChange={value => { setOrganizationId(value); setFields(previous => ({ ...previous, organizationId: '' })); }} /> : null}
    <label htmlFor="support-category">What do you need help with?<select id="support-category" name="category" required defaultValue="" aria-invalid={Boolean(fields.category)} aria-describedby={fields.category ? 'support-category-error' : undefined}><option value="" disabled>Choose a category</option>{Object.entries(SUPPORT_CATEGORIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    {fields.category ? <p id="support-category-error" className="support-field-error">{fields.category}</p> : null}
    <label htmlFor="support-title">Short summary<input id="support-title" name="title" required minLength={3} maxLength={160} placeholder="For example: I can't save a visit" aria-invalid={Boolean(fields.title)} aria-describedby={fields.title ? 'support-title-error' : undefined} /></label>
    {fields.title ? <p id="support-title-error" className="support-field-error">{fields.title}</p> : null}
    <label htmlFor="support-description">Tell us what happened<textarea id="support-description" name="description" required minLength={10} maxLength={5000} rows={5} placeholder="What were you trying to do? What happened instead?" aria-invalid={Boolean(fields.description)} aria-describedby={fields.description ? 'support-description-error' : undefined} /></label>
    {fields.description ? <p id="support-description-error" className="support-field-error">{fields.description}</p> : null}
    <section className="support-attachment" aria-label="Screenshot attachment">
      {screenshotsEnabled ? <><label htmlFor="support-screenshot">Screenshot (optional)<input id="support-screenshot" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="support-screenshot-help" disabled={preparing || saving} onChange={event => void selectScreenshot(event.target.files?.[0])} /></label><p id="support-screenshot-help" className="muted">Choose a PNG, JPEG or WebP under 10 MB. Check it for information you do not want to share.</p>{preparing ? <p role="status">Preparing screenshot…</p> : null}{preview ? <><img className="support-screenshot-preview" src={preview} alt="Screenshot to include with your support report" /><button type="button" className="secondary" disabled={saving || preparing} onClick={() => { setScreenshot(null); const input = document.getElementById('support-screenshot') as HTMLInputElement | null; if (input) input.value = ''; }}>Remove screenshot</button></> : null}</>
        : <p>Screenshots are unavailable in this environment. You can still send a report.</p>}
    </section>
    <label className="support-check"><input type="checkbox" checked={includeDiagnostics} onChange={event => setIncludeDiagnostics(event.target.checked)} />Include recent pages and basic browser details</label>
    <details className="support-details"><summary>Review what is included</summary><p className="muted">Up to 10 pages from the last 30 minutes, browser name, and screen size. No typed values, search terms, passwords, or automatic screen recording.</p>{reportTrail.length ? <ol className="support-trail">{reportTrail.map((step, index) => <li key={`${step.at}-${index}`}>{step.path}</li>)}</ol> : <p>{organizations && organizationId !== initialOrganizationId ? 'Recent pages are omitted when reporting for a different organization.' : 'No recent pages are available.'}</p>}</details>
    <p className="muted">Your report is shared with your organization admin and Platform Admin. Do not include passwords or payment details.</p>
    {error ? <p className="support-field-error" role="alert">{error}</p> : null}
    <div className="support-actions"><button type="submit" disabled={saving || preparing}>{saving ? 'Sending ticket…' : 'Send ticket'}</button><Link className="btn secondary" href={reportTrail.at(-1)?.path ?? '/support'}>Cancel</Link></div>
  </form>;
}
