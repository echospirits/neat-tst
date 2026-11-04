import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('wholesale opportunities compare fit and coverage while retaining live search and current assessments', () => {
  const page = readFileSync('app/opportunities/page.tsx', 'utf8');
  const search = readFileSync('app/opportunities/OpportunitySearch.tsx', 'utf8');
  assert.match(page, /className="comparison-table intelligence-comparison-table restaurant-opportunities-table"/);
  assert.match(page, />Compatible \/ 30d<\/th>/);
  assert.match(page, />Source coverage<\/th>/);
  assert.match(page, /opportunity-row/);
  assert.match(page, /WholesaleAssessmentSummary/);
  assert.doesNotMatch(page, /className="card opportunity-card"/);
  assert.match(page, /evidenceModeLabel/);
  assert.match(page, /prisma\.wholesaleAccountAssessment\.findMany/);
  assert.match(search, /LiveFilterForm/);
});
