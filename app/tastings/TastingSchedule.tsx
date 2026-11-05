import Link from 'next/link';
import { getUserDisplayName } from '../../lib/auth';
import { formatDateOnly, formatDateOnlyInputValue, formatEasternDateInputValue, formatEasternDateTime } from '../../lib/dateTime';
import { getDirectionsHref } from '../../lib/crmActionContext';
import { deriveTastingStatus, TASTING_STATUS_LABELS, tastingExecutionStatus } from '../../lib/tastings/model';
import type { listTastings } from '../../lib/tastings/queries';
import './tasting-schedule.css';

export type TastingScheduleRecord = Awaited<ReturnType<typeof listTastings>>[number];

export function TastingSchedule({ tastings, heading = 'My tastings', currentUserId, returnTo = '/tastings', showOutcome = false, emptyLabel = 'No tastings scheduled.', showAgency = true, showAgencyAction = true }: {
  tastings: TastingScheduleRecord[];
  heading?: string;
  currentUserId: string;
  returnTo?: string;
  showOutcome?: boolean;
  emptyLabel?: string;
  showAgency?: boolean;
  showAgencyAction?: boolean;
}) {
  const today = formatEasternDateInputValue();
  return <section className="tasting-schedule" aria-label={heading}>
    <div className="section-heading"><h2>{heading}</h2><Link href="/tastings">All tastings</Link></div>
    {tastings.length ? <ul className="tasting-summary-list">{tastings.map(tasting => {
      const execution = tastingExecutionStatus(tasting);
      const terminal = ['CANCELLED', 'DENIED'].includes(execution);
      const date = formatDateOnlyInputValue(tasting.scheduledDate);
      const address = [tasting.agency.address, tasting.agency.city, tasting.agency.state, tasting.agency.zip].filter(Boolean).join(', ');
      const directions = getDirectionsHref(address);
      const visitParams = new URLSearchParams({ type: 'agency', agencyId: tasting.agencyId, tastingId: tasting.id, returnTo });
      const canLog = !terminal && execution !== 'COMPLETED' && date === today && tasting.assignedTasterUserId === currentUserId;
      return <li key={tasting.id}>
        <div className="tasting-summary-identity">
          <Link className="tasting-summary-link" href={`/tastings/${tasting.id}?returnTo=${encodeURIComponent(returnTo)}`}>
            {showAgency ? tasting.agency.name : formatDateOnly(tasting.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Link>
          {showAgency ? <span>Agency {tasting.agency.agencyId}</span> : null}
          <span>{showAgency ? `${formatDateOnly(tasting.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' })} · ` : ''}{formatEasternDateTime(tasting.startsAt, { hour: 'numeric', minute: '2-digit' })}–{formatEasternDateTime(tasting.endsAt, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span>
        </div>
        <div className="tasting-summary-state">
          <span>{tasting.assignedTaster ? getUserDisplayName(tasting.assignedTaster) : 'Taster needs mapping'}</span>
          <span className="pill">{TASTING_STATUS_LABELS[deriveTastingStatus(tasting)]}</span>
          {execution === 'VISIT_NOT_LOGGED' ? <strong className="tasting-missing-visit">Visit Not Logged</strong> : null}
          {execution === 'COMPLETED' ? <span>Visit logged with photo</span> : null}
          {showOutcome ? <span className="tasting-summary-outcome">Retail bottles sold on tasting date: <strong>{tasting.retailBottlesSold === null ? 'Not available' : tasting.retailBottlesSold.toLocaleString('en-US')}</strong>{tasting.salesSourceDataThrough ? <small>Data through {formatDateOnly(tasting.salesSourceDataThrough)}</small> : null}</span> : null}
        </div>
        <div className="tasting-summary-actions">
          {canLog ? <Link className="btn" href={`/visits/new?${visitParams}`}>Log Tasting Visit</Link> : null}
          {showAgencyAction ? <Link className="btn secondary" href={`/agencies/${tasting.agencyId}`}>Open Agency</Link> : null}
          {directions ? <a className="btn secondary" href={directions} target="_blank" rel="noreferrer">Directions</a> : null}
        </div>
      </li>;
    })}</ul> : <p className="muted">{emptyLabel}</p>}
  </section>;
}
