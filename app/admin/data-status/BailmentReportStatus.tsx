import type { getOhlqBailmentReportStatus } from '../../../lib/ohlqBailmentReportStorage';
import { SectionHeading } from '../../components/PageChrome';

type Status = Awaited<ReturnType<typeof getOhlqBailmentReportStatus>>;
type Props = { status: Status | null; unavailable?: boolean };

function displayTime(value: string | null | undefined, timezone: string) {
  if (!value) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: timezone,
  }).format(new Date(value));
}

const failureMessages: Record<string, string> = {
  credentials: 'OHLQ credentials are unavailable.',
  configuration: 'The OHLQ report source needs configuration.',
  download: 'The native report could not be downloaded.',
  provenance: 'The downloaded report could not be matched to the requested source.',
  'invalid-csv': 'The downloaded report failed CSV validation.',
  'empty-export': 'The downloaded report was unexpectedly empty.',
  'schema-change': 'The report columns changed and need review.',
  'incomplete-export': 'The report may be incomplete and was not saved.',
  'scope-mismatch': 'The requested report range or source scope changed and needs review.',
  persistence: 'The report could not be saved. Retry the forecasting source refresh.',
};

export function BailmentReportStatus({ status, unavailable = false }: Props) {
  const current = status?.current;
  const attempt = status?.latestAttempt;
  const failed = attempt?.status === 'FAILED';

  return (
    <section className="workspace-section bailment-report-status" aria-labelledby="bailment-report-heading">
      <SectionHeading
        title={<span id="bailment-report-heading">Bailment PO and Invoice</span>}
        actions={current && !unavailable
          ? <a className="btn secondary" href="/api/admin/ohlq-bailment-report">Download saved CSV</a>
          : undefined}
      />
      {unavailable ? <p role="status">Saved report status could not be loaded. Refresh this page to try again.</p> : <>
        {current ? <>
          <dl className="bailment-report-facts">
            <div><dt>Last successful retrieval</dt><dd>{displayTime(current.acquiredAt, current.timezone)} <span className="muted">({current.timezone})</span></dd></div>
            <div><dt>Requested range</dt><dd>{current.requestedFrom} to {current.requestedTo}</dd></div>
            <div><dt>Source rows</dt><dd>{current.rowCount === null ? 'Unavailable' : current.rowCount.toLocaleString('en-US')}</dd></div>
          </dl>
          <p className="muted bailment-report-note">Snapshot at retrieval time; the requested end date may still be in progress.</p>
        </> : <p>No saved report yet. The next authorized forecasting source refresh will attempt to save it.</p>}
        <p className={failed ? 'bailment-report-attempt data-error-text' : 'bailment-report-attempt'} role="status">
          <strong>Latest capture attempt: </strong>
          {attempt ? <>{failed ? 'Failed' : 'Saved'} · {displayTime(attempt.completedAt, attempt.timezone)} ({attempt.timezone})
            {failed && current ? '. Previous saved report remains available.' : null}
            {failed && attempt.reason ? <span className="bailment-report-reason">{failureMessages[attempt.reason] ?? 'The report could not be saved.'}</span> : null}
          </> : 'Not run yet'}
        </p>
      </>}
    </section>
  );
}

