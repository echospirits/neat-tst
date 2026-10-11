export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Papa from 'papaparse';
import { readAssessment } from '../../../../lib/wholesaleAssessment';
import { requireUser } from '../../../../lib/auth';
import { requireFeatureForUser } from '../../../../lib/organizations';
import { prisma } from '../../../../lib/prisma';
import { commercialDiscoveryFilter, commercialDiscoveryAccountWhere, commercialRatingExport, commercialRatingOrder, normalizeCommercialFilter } from '../../../../lib/commercialOpportunity';

/** Authenticated, tenant-scoped machine contract and bounded CSV export. */
export async function GET(request: Request) {
  const user = await requireUser();
  const { organizationId } = await requireFeatureForUser(user, 'WHOLESALE_OPPORTUNITIES');
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.get('page') ?? '1', 10) || 1));
  const limit = 500;
  const ratingFilter = normalizeCommercialFilter(query.get('rating'), 'all');
  const suppressed = ratingFilter === 'high' ? await prisma.organizationAccountOverlay.findMany({ where: { organizationId, accountType: 'WHOLESALE', OR: [{ opportunitySuppressed: true }, { active: false }] }, select: { externalAccountId: true } }) : [];
  const rows = await prisma.wholesaleAccountAssessment.findMany({
    where: { organizationId, ...commercialDiscoveryFilter(ratingFilter), wholesaleAccount: ratingFilter === 'high' ? commercialDiscoveryAccountWhere(organizationId, suppressed.map(row => row.externalAccountId)) : { mergedIntoId: null } },
    orderBy: commercialRatingOrder(), skip: (page - 1) * limit, take: limit + 1,
    select: { assessment: true, wholesaleAccountId: true, rating: true, assessmentStatus: true, assessmentReason: true, evidenceMode: true, calculatedAt: true, researchAt: true, asOfDate: true, modelVersion: true, refreshRequestedAt: true, wholesaleAccount: { select: { name: true } } },
  });
  const data = rows.slice(0, limit).map(row => {
    const assessment = readAssessment(row.assessment);
    const coverage = row.evidenceMode === 'RESEARCH_ONLY' ? null : assessment?.coverage;
    return {
    wholesale_account_id: row.wholesaleAccountId, account_name: row.wholesaleAccount.name, ...commercialRatingExport(row),
    evidence_mode: row.evidenceMode, calculated_at: row.calculatedAt.toISOString(), researched_at: row.researchAt?.toISOString() ?? null,
    effective_assessment_date: row.asOfDate.toISOString().slice(0, 10),
    sales_period_from: coverage?.representedFrom ?? null, sales_period_through: coverage?.through ?? null,
    represented_days: coverage?.representedDays ?? null, latest_source_date: coverage?.latestSourceDate ?? null, model_version: row.modelVersion,
    calibration_version: assessment?.calibrationVersion ?? null,
    recalculation_pending: Boolean(row.refreshRequestedAt),
    };
  });
  const nextPage = rows.length > limit ? page + 1 : null;
  if (query.get('format') === 'csv') return new Response(Papa.unparse(data, { escapeFormulae: true }), { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="wholesale-commercial-ratings-page-${page}.csv"`,
    ...(nextPage ? { 'X-Next-Page': String(nextPage) } : {}),
  } });
  return Response.json({ data, page, nextPage }, { headers: { 'Cache-Control': 'private, no-store' } });
}
