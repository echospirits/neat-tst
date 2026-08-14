import Link from 'next/link';
import { getUserDisplayName } from '../../lib/auth';
import { formatDateOnly, formatEasternDateTime } from '../../lib/dateTime';
import { getVisitOutcomeDisplay } from '../../lib/visitWorkflow';
import { VisitPhotoGallery } from './VisitPhotoGallery';

export type VisitActivity = {
  id: string;
  visitAt: Date;
  locationType: string;
  locationName?: string | null;
  locationHref?: string | null;
  contactId: string | null;
  summary: string | null;
  outcomes: string | null;
  outcomeCodes: string[];
  nextStep: string | null;
  followUpMode: string | null;
  followUpDate: Date | null;
  createdBy: string | null;
  createdByUser: { email: string; name: string | null } | null;
  photos: { id: string; url: string; caption: string | null; type: string }[];
  worklistItems: { id: string; status: string; title: string }[];
};

type VisitActivityTableProps = {
  visits: VisitActivity[];
  contactMap: Record<string, string>;
};

const followUpLabel = (visit: VisitActivity) => {
  if (visit.worklistItems.length > 0) {
    const openCount = visit.worklistItems.filter((item) => item.status === 'OPEN' || item.status === 'IN_PROGRESS').length;
    return openCount > 0 ? `${openCount} open worklist ${openCount === 1 ? 'item' : 'items'}` : 'Worklist item completed';
  }
  if (visit.nextStep) return visit.followUpDate ? `${visit.nextStep} · ${formatDateOnly(visit.followUpDate)}` : visit.nextStep;
  return null;
};

export function VisitActivityTable({ visits, contactMap }: VisitActivityTableProps) {
  if (visits.length === 0) return <p className="muted activity-empty">No visits have been logged yet.</p>;

  return (
    <div className="visit-activity-list">
      {visits.map((visit) => {
        const outcomeLabels = getVisitOutcomeDisplay({
          locationType: visit.locationType,
          outcomeCodes: visit.outcomeCodes,
          legacyOutcomes: visit.outcomes,
        });
        const followUp = followUpLabel(visit);
        const rep = visit.createdByUser ? getUserDisplayName(visit.createdByUser) : visit.createdBy;

        return (
          <article className="visit-activity-card" key={visit.id}>
            <header>
              <div>
                <time dateTime={visit.visitAt.toISOString()}>{formatEasternDateTime(visit.visitAt)}</time>
                {visit.locationName ? (
                  visit.locationHref ? <Link href={visit.locationHref}>{visit.locationName}</Link> : <strong>{visit.locationName}</strong>
                ) : null}
              </div>
              <span>{rep}</span>
            </header>
            {outcomeLabels.length > 0 ? (
              <div aria-label="Visit outcomes" className="visit-outcome-badges">
                {outcomeLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
            ) : null}
            {visit.summary ? <p className="visit-note preserve-lines">{visit.summary}</p> : null}
            <div className="visit-card-meta">
              {contactMap[visit.contactId ?? ''] ? <span>Contact: {contactMap[visit.contactId ?? '']}</span> : null}
              {followUp ? <span className="visit-follow-up-status">Next: {followUp}</span> : null}
              {visit.photos.length > 0 ? <span>{visit.photos.length} {visit.photos.length === 1 ? 'photo' : 'photos'}</span> : null}
              <Link href={`/visits/${visit.id}/edit`}>Edit visit</Link>
            </div>
            {visit.photos.length > 0 ? <VisitPhotoGallery photos={visit.photos} /> : null}
          </article>
        );
      })}
    </div>
  );
}
