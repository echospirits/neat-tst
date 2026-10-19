import { commercialRatingLabel, commercialFreshnessLabel, normalizeCommercialRating } from '../../lib/commercialOpportunity';

/** A read-only commercial tier, deliberately not a review/rating control. */
export function CommercialOpportunityStars({ rating, status, pending = false, stale = false }: {
  rating: number | null | undefined; status?: string | null; pending?: boolean; stale?: boolean;
}) {
  const value = normalizeCommercialRating(rating);
  const label = commercialRatingLabel(value);
  const freshness = commercialFreshnessLabel({ status, pending, stale });
  return <span className="commercial-opportunity-rating">
    <span className="commercial-opportunity-stars" role="img" aria-label={label} title={label}>
      <span aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className={value !== null && index < value ? 'is-filled' : 'is-empty'}>{value !== null && index < value ? '★' : '☆'}</span>)}</span>
    </span>
    {value === null ? <span className="commercial-opportunity-state">Unrated</span> : value === 0 ? <span className="commercial-opportunity-state">Zero stars</span> : null}
    {freshness ? <small className="commercial-opportunity-state" role="status">{freshness}{value !== null && (status === 'SOURCE_ERROR' || status === 'ERROR') ? ' · last valid rating' : ''}</small> : null}
  </span>;
}
