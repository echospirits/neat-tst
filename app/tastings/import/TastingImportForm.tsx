'use client';
import { useState } from 'react';
import { tastingImportAction, type TastingImportResult } from './actions';

export function TastingImportForm() {
  const [csv, setCsv] = useState('');
  const [source, setSource] = useState('echo-tasting-schedule-v1');
  const [reviewed, setReviewed] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TastingImportResult>({});
  const canImport = reviewed === `${source}\n${csv}` && Boolean(result.preview?.length) && !result.preview?.some(row => row.errors.length);
  return <form className="crm-form" aria-busy={busy} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = submitter?.value === 'import' && canImport ? 'import' : 'preview';
    const form = new FormData(); form.set('sourceKey', source); form.set('csv', csv); form.set('mode', mode);
    setBusy(true);
    try { const response = await tastingImportAction(form); setResult(response); if (response.preview && !response.error) setReviewed(`${source}\n${csv}`); }
    catch { setResult({ error: 'Import unavailable. Your CSV is retained; retry the preview.' }); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}>
      <label>Stable source key<input required maxLength={200} value={source} onChange={event => { setSource(event.target.value); setReviewed(''); }} /></label>
      <label>Schedule CSV<textarea rows={12} required spellCheck={false} value={csv} onChange={event => { setCsv(event.target.value); setReviewed(''); }} placeholder={'Date,Start Time,End Time,Agency ID,Assigned taster,Status,Notes for taster,Internal notes\n2026-11-20,17:00,19:00,12345,taster@example.com,DRAFT,,'} /></label>
      <p className="field-note">Dates: YYYY-MM-DD. Times: HH:mm in America/New_York. Agency ID: Neat ID or Agency number. Taster / Coverage: exact Neat user ID or email; unmatched names are flagged.</p>
      <div className="tasting-inline-actions"><button name="mode" value="preview" type="submit">{busy ? 'Working…' : 'Preview import'}</button><button className="secondary" name="mode" value="import" type="submit" disabled={!canImport}>Import reviewed rows</button></div>
    </fieldset>
    {result.error ? <p role="alert">{result.error}</p> : null}
    {result.created != null ? <p role="status">Imported {result.created} · Already present {result.skipped} · Identity review {result.review}</p> : null}
    {result.preview ? <section><h2>Import review</h2><p>{result.preview.length} rows · {result.preview.filter(row => row.errors.length).length} with errors · {result.preview.filter(row => row.needsReview).length} need review</p><ol className="tasting-import-rows">{result.preview.map(row => <li key={row.row}><strong>Row {row.row} · {row.agencyName ?? 'Unresolved Agency'}</strong><span>{row.input?.date} {row.input?.startTime}–{row.input?.endTime} · {row.assignedTasterName ?? `Unmatched: ${row.input?.assignedTaster || '(blank)'}`} · {row.status ?? 'Unknown status'}</span>{row.errors.map(error => <p role="alert" key={error}>{error}</p>)}{row.warnings.map(warning => <p className="field-note" key={warning}>{warning}</p>)}</li>)}</ol></section> : null}
  </form>;
}
