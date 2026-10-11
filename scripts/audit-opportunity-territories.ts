import { prisma } from '../lib/prisma';
import { ASSESSMENT_VERSION } from '../lib/wholesaleAssessment';
import { commercialRatingOrder } from '../lib/commercialOpportunity';
import { enabledAssessmentTenants } from '../lib/wholesaleAssessmentService';
import { OPPORTUNITY_TERRITORIES, opportunityTerritoryForCounty } from '../lib/opportunityTerritories';

/** Current commercial reporting only. Historical pursuit scores belong in the
 * snapshot comparison command and never determine territory ordering here. */
async function main() {
  const organizations = await prisma.organization.findMany({ where: enabledAssessmentTenants, select: { id: true } });
  const output = [];
  for (const organization of organizations) {
    const assessments = await prisma.wholesaleAccountAssessment.findMany({
      where: { organizationId: organization.id, wholesaleAccount: { mergedIntoId: null } },
      orderBy: commercialRatingOrder(),
      select: { rating: true, assessmentStatus: true, modelVersion: true, evidenceMode: true,
        wholesaleAccount: { select: { county: true, targetPublicResearch: { select: { lastRefreshedAt: true } } } } },
    });
    const topPositive = assessments.filter(row => row.rating !== null && row.rating > 0).slice(0, 250);
    const starCounts = (rows: typeof assessments) => Object.fromEntries([
      ...Array.from({ length: 6 }, (_, rating) => [String(rating), rows.filter(row => row.rating === rating).length]),
      ['Unrated', rows.filter(row => row.rating === null).length],
    ]);
    const territories = OPPORTUNITY_TERRITORIES.map(territory => {
      const rows = assessments.filter(row => opportunityTerritoryForCounty(row.wholesaleAccount.county) === territory.slug);
      const rated = rows.filter(row => row.rating !== null);
      return { territory: territory.label, assessed: rows.length, stars: starCounts(rows),
        strongOrExceptional: rows.filter(row => row.rating !== null && row.rating >= 4).length,
        zeroShareOfRated: rated.length ? rows.filter(row => row.rating === 0).length / rated.length : null,
        researchCoveragePercent: Number((rows.filter(row => row.wholesaleAccount.targetPublicResearch?.lastRefreshedAt).length / Math.max(1, rows.length) * 100).toFixed(1)),
        top250PositiveCount: topPositive.filter(row => opportunityTerritoryForCounty(row.wholesaleAccount.county) === territory.slug).length };
    });
    const counts = (key: 'modelVersion' | 'evidenceMode' | 'assessmentStatus') => assessments.reduce<Record<string, number>>((totals,row) => {
      totals[row[key]] = (totals[row[key]] ?? 0) + 1; return totals;
    }, {});
    output.push({ organizationId: organization.id, totalAssessed: assessments.length, stars: starCounts(assessments),
      currentModelCount: assessments.filter(row => row.modelVersion === ASSESSMENT_VERSION).length,
      modelVersions: counts('modelVersion'), evidenceModes: counts('evidenceMode'), assessmentStatuses: counts('assessmentStatus'), territories });
  }
  console.log(JSON.stringify({ expectedVersion: ASSESSMENT_VERSION,
    population: 'Current assessments for every non-merged wholesale account in each enabled active tenant, independent of salesperson or pursuit state.',
    ordering: 'Whole commercial stars descending, Unrated last, stable account identity tie-break. Top 250 includes only positive ratings; this is commercial ranking, not an actionable task list.',
    organizations: output }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
