import { ACCOUNT_RESEARCH_CITY_RETRY_PREFIX } from './accountResearchFailures';
import { ohioWholesaleCityRules } from './ohioWholesaleCities';

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

// One atomic repair. Failed attempts keep their status, original input, errors,
// result, provider response and spend; a review-note prefix requests a new run.
// In-flight jobs and completed research are never restarted or erased.
export function wholesaleCityRepairSql(apply = false) {
  const rules = ohioWholesaleCityRules().map(([alias, city]) => `(${literal(alias)}, ${literal(city)})`).join(',\n');
  const retryPrefix = literal(ACCOUNT_RESEARCH_CITY_RETRY_PREFIX);
  const cityChanged = "btrim(regexp_replace(upper(w.city), '[^A-Z0-9]+', ' ', 'g')) IS DISTINCT FROM btrim(regexp_replace(upper(m.replacement_city), '[^A-Z0-9]+', ' ', 'g'))";
  return `WITH rules(alias, city) AS (VALUES ${rules}),
    matched AS MATERIALIZED (
      SELECT w.*, r.city AS replacement_city
      FROM "WholesaleAccount" w JOIN rules r
        ON btrim(regexp_replace(upper(w.city), '[^A-Z0-9]+', ' ', 'g')) = r.alias
      WHERE w."mergedIntoId" IS NULL
        AND coalesce(upper(btrim(w.state)), '') IN ('', 'OH', 'OHIO')
      ${apply ? 'FOR UPDATE OF w' : ''}
    ), retry_jobs AS MATERIALIZED (
      SELECT j.* FROM "AccountResearchJob" j JOIN matched m ON m.id = j."wholesaleAccountId"
      LEFT JOIN "TargetPublicResearch" p ON p."wholesaleAccountId" = m.id
      WHERE m."isActive" AND j.status IN ('REJECTED', 'FAILED', 'BLOCKED_BUDGET')
        AND NOT starts_with(coalesce(j."reviewNote", ''), ${retryPrefix})
        AND (p."lastRefreshedAt" IS NULL OR p."lastRefreshedAt" <= coalesce(j."reviewedAt", j."completedAt", j."updatedAt"))
      ${apply ? 'FOR UPDATE OF j' : ''}
    ), account_changes AS (
      ${apply ? `UPDATE "WholesaleAccount" w SET
        city = m.replacement_city, "cityImportProtected" = true,
        latitude = CASE WHEN ${cityChanged} THEN NULL ELSE w.latitude END,
        longitude = CASE WHEN ${cityChanged} THEN NULL ELSE w.longitude END,
        "geocodedAt" = CASE WHEN ${cityChanged} THEN NULL ELSE w."geocodedAt" END,
        "geocodeStatus" = CASE WHEN ${cityChanged} THEN 'PENDING'::"GeocodeStatus" ELSE w."geocodeStatus" END,
        "normalizedGeocodeAddress" = CASE WHEN ${cityChanged} THEN NULL ELSE w."normalizedGeocodeAddress" END,
        "geocodeError" = CASE WHEN ${cityChanged} THEN NULL ELSE w."geocodeError" END,
        "updatedAt" = CURRENT_TIMESTAMP
      FROM matched m WHERE w.id = m.id AND (w.city IS DISTINCT FROM m.replacement_city OR NOT w."cityImportProtected")
      RETURNING m.id, m.city AS old_city, m.replacement_city AS new_city, m."cityImportProtected" AS old_protection,
        m.latitude, m.longitude, m."geocodedAt", m."geocodeStatus", m."normalizedGeocodeAddress", m."geocodeError", m."updatedAt" AS old_updated_at`
        : `SELECT id, city AS old_city, replacement_city AS new_city, "cityImportProtected" AS old_protection,
          latitude, longitude, "geocodedAt", "geocodeStatus", "normalizedGeocodeAddress", "geocodeError", "updatedAt" AS old_updated_at
          FROM matched WHERE city IS DISTINCT FROM replacement_city OR NOT "cityImportProtected"`}
    ), job_changes AS (
      ${apply ? `UPDATE "AccountResearchJob" j SET
        "reviewNote" = ${retryPrefix} || E'\\nPrevious review: ' || coalesce(r."reviewNote", ''),
        "updatedAt" = CURRENT_TIMESTAMP
      FROM retry_jobs r WHERE j.id = r.id
      RETURNING r.id, r."wholesaleAccountId", r.status, r."reviewNote" AS old_review_note, r."updatedAt" AS old_updated_at`
        : `SELECT id, "wholesaleAccountId", status, "reviewNote" AS old_review_note, "updatedAt" AS old_updated_at FROM retry_jobs`}
    ) SELECT jsonb_build_object(
      'accounts', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM account_changes a), '[]'::jsonb),
      'jobs', coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM job_changes j), '[]'::jsonb),
      'retryAccounts', (SELECT count(DISTINCT "wholesaleAccountId") FROM job_changes)
    ) AS repair;`;
}
