import type { Prisma } from '@prisma/client';

export function normalizeCommercialRating(rating: unknown): number | null {
  return typeof rating === 'number' && Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : null;
}
export function commercialRatingLabel(rating: unknown) {
  const value = normalizeCommercialRating(rating);
  return value === null ? 'Commercial opportunity: Unrated' : `Commercial opportunity: ${value} of 5 stars`;
}
export function commercialFreshnessLabel({ status, pending = false, stale = false }: { status?: string | null; pending?: boolean; stale?: boolean }) {
  if (status === 'SOURCE_ERROR') return 'Sales refresh failed';
  if (status === 'ERROR') return 'Calculation failed';
  if (pending || status === 'PENDING') return 'Recalculation pending';
  if (status === 'INELIGIBLE') return 'Ineligible account';
  return stale ? 'Refresh due' : null;
}
export const commercialAccountKey = (accountId: string) => `commercial:${accountId}`;
export function normalizeCommercialFilter(filter: string | null | undefined, fallback = 'high') {
  return ['all', 'high', 'zero', 'unrated', '0', '1', '2', '3', '4', '5'].includes(filter ?? '') ? filter! : fallback;
}
export function commercialDiscoveryAccountWhere(organizationId: string, suppressedIds: string[]): Prisma.WholesaleAccountWhereInput {
  return { mergedIntoId: null, isActive: true, id: { notIn: suppressedIds }, tags: { none: { organizationId, tag: { OR: ['do not pursue', 'do-not-pursue', 'do_not_pursue'].map(name => ({ name: { contains: name, mode: 'insensitive' as const } })) } } } };
}
export const commercialRatingOrder = (ascending = false): Prisma.WholesaleAccountAssessmentOrderByWithRelationInput[] => [
  { rating: { sort: ascending ? 'asc' : 'desc', nulls: 'last' } }, { wholesaleAccountId: 'asc' },
];
export const actionableCommercialWhere = (now = new Date()): Prisma.WholesaleAccountAssessmentWhereInput => ({
  rating: { gte: 3 }, state: 'READY', assessmentStatus: 'READY', refreshRequestedAt: null, dismissedKey: null,
  OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
});
export function commercialDiscoveryFilter(filter?: string, now = new Date()): Prisma.WholesaleAccountAssessmentWhereInput {
  if (filter === 'all') return {};
  if (filter === 'zero' || filter === '0') return { rating: 0 };
  if (filter === 'unrated') return { rating: null };
  if (/^[1-5]$/.test(filter ?? '')) return { rating: Number(filter) };
  return actionableCommercialWhere(now);
}
/** Machine exports deliberately preserve numeric zero and null as different values. */
export function commercialRatingExport(row: { rating: number | null; assessmentStatus: string; assessmentReason: string | null }) {
  return { commercial_rating: normalizeCommercialRating(row.rating), assessment_status: row.assessmentStatus, assessment_reason: row.assessmentReason };
}
