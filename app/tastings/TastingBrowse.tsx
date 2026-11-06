import Link from 'next/link';
import { getUserDisplayName } from '../../lib/auth';
import { getDirectionsHref } from '../../lib/crmActionContext';
import { formatDateOnly, formatDateOnlyInputValue, formatEasternDateInputValue, formatEasternDateTime } from '../../lib/dateTime';
import { deriveTastingStatus, TASTING_STATUS_LABELS, tastingExecutionStatus, type TastingStatus } from '../../lib/tastings/model';
import { tastingStatusControlData } from '../../lib/tastings/statusActions';
import type { TastingScheduleRecord } from './TastingSchedule';
import { TastingStatusSelect } from './TastingStatusSelect';
import { TastingMenu } from './TastingMenu';

type TastingBrowseProps = {
  tastings: TastingScheduleRecord[];
  heading: string;
  currentUserId: string;
  returnTo: string;
  coordinator: boolean;
  showOutcome?: boolean;
  groupByStatus?: boolean;
};

/** The full tasting browse surface keeps comparison facts aligned and status editing inline. */
export function TastingBrowse({ tastings, heading, currentUserId, returnTo, coordinator, showOutcome = false, groupByStatus = false }: TastingBrowseProps) {
  const today = formatEasternDateInputValue();
  const columnCount = showOutcome ? 6 : 5;
  const groups = new Map<TastingStatus, TastingScheduleRecord[]>();
  if (groupByStatus) {
    for (const tasting of tastings) {
      const status = deriveTastingStatus(tasting);
      const records = groups.get(status);
      if (records) records.push(tasting);
      else groups.set(status, [tasting]);
    }
  }

  function renderRow(tasting: TastingScheduleRecord) {
    const execution = tastingExecutionStatus(tasting);
    const date = formatDateOnlyInputValue(tasting.scheduledDate);
    const dateLabel = formatDateOnly(tasting.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const canLog = !['CANCELLED', 'DENIED', 'COMPLETED'].includes(execution) && date === today && tasting.assignedTasterUserId === currentUserId;
    const address = [tasting.agency.address, tasting.agency.city, tasting.agency.state, tasting.agency.zip].filter(Boolean).join(', ');
    const directions = getDirectionsHref(address);
    const visitParams = new URLSearchParams({ type: 'agency', agencyId: tasting.agencyId, tastingId: tasting.id, returnTo });
    return <tr key={tasting.id} className={`tasting-browse-row${canLog ? ' has-visit' : ''}`}>
      <td className="tasting-browse-when" data-label="When">
        <time dateTime={date}>{dateLabel}</time>
        <span>{formatEasternDateTime(tasting.startsAt, { hour: 'numeric', minute: '2-digit' })}–{formatEasternDateTime(tasting.endsAt, { hour: 'numeric', minute: '2-digit' })}</span>
      </td>
      <td className="tasting-browse-agency" data-label="Agency">
        <Link className="tasting-browse-link" href={`/tastings/${tasting.id}?returnTo=${encodeURIComponent(returnTo)}`}>{tasting.agency.name}</Link>
        <span className="tasting-browse-record-id">Agency {tasting.agency.agencyId}</span>
      </td>
      <td className="tasting-browse-taster" data-label="Taster">{tasting.assignedTaster ? getUserDisplayName(tasting.assignedTaster) : 'Needs identity mapping'}</td>
      <td className="tasting-browse-status" data-label="Status">
        <TastingStatusSelect tasting={tastingStatusControlData(tasting)} currentUserId={currentUserId} coordinator={coordinator} label={`${tasting.agency.name} on ${dateLabel}`} showStatusLabel={!groupByStatus} />
        {execution === 'MANUALLY_COMPLETED' ? <strong className="tasting-missing-visit">Completed manually · Visit not logged</strong> : null}
        {execution === 'VISIT_NOT_LOGGED' ? <strong className="tasting-missing-visit">Visit Not Logged</strong> : null}
        {execution === 'COMPLETED' ? <span className="tasting-visit-evidence">Visit logged with photo</span> : null}
      </td>
      {showOutcome ? <td className="tasting-browse-outcome" data-label="Retail bottles on tasting date">
        <strong>{tasting.retailBottlesSold === null ? 'Not available' : tasting.retailBottlesSold.toLocaleString('en-US')}</strong>
        {tasting.salesSourceDataThrough ? <small>Data through {formatDateOnly(tasting.salesSourceDataThrough)}</small> : null}
      </td> : null}
      <td className="tasting-browse-actions" data-label="Actions">
        {canLog ? <Link className="btn tasting-log-visit" href={`/visits/new?${visitParams}`}>Log Tasting Visit</Link> : null}
        {canLog && directions ? <a className="btn secondary tasting-directions" href={directions} target="_blank" rel="noreferrer">Directions</a> : null}
        <TastingMenu label="More" accessibleLabel={`More actions for ${tasting.agency.name} on ${dateLabel}`}>
            <Link href={`/agencies/${tasting.agencyId}`}>Open Agency</Link>
            {!canLog && directions ? <a href={directions} target="_blank" rel="noreferrer">Directions</a> : null}
        </TastingMenu>
      </td>
    </tr>;
  }

  return <section className="tasting-browse" aria-label={heading}>
    <table className="tasting-browse-table">
      <caption className="sr-only">{heading}</caption>
      <thead><tr>
        <th scope="col">When</th>
        <th scope="col">Agency</th>
        <th scope="col">Taster</th>
        <th scope="col">Status</th>
        {showOutcome ? <th scope="col">Retail bottles <small>on tasting date</small></th> : null}
        <th scope="col"><span className="sr-only">Actions</span></th>
      </tr></thead>
      {groupByStatus && tastings.length ? [...groups].map(([status, records]) => <tbody key={status}>
        <tr className="tasting-browse-group"><th scope="rowgroup" colSpan={columnCount}>{TASTING_STATUS_LABELS[status]} <span className="result-count" aria-label={`${records.length} tastings`}>{records.length}</span></th></tr>
        {records.map(renderRow)}
      </tbody>) : <tbody>{tastings.length ? tastings.map(renderRow) : <tr><td colSpan={columnCount}>No tastings match this scope.</td></tr>}</tbody>}
    </table>
  </section>;
}
