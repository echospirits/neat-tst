import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('wholesale opportunities use the compact intelligence row and live search pattern', () => {
  const page = readFileSync('app/opportunities/page.tsx', 'utf8');
  const search = readFileSync('app/opportunities/OpportunitySearch.tsx', 'utf8');
  assert.match(page, /className="opportunity-results"/);
  assert.match(page, /opportunity-row/);
  assert.match(page, /WholesaleAssessmentSummary/);
  assert.doesNotMatch(page, /className="card opportunity-card"/);
  assert.match(page, /evidenceModeLabel/);
  assert.match(page, /prisma\.wholesaleAccountAssessment\.findMany/);
  assert.match(search, /LiveFilterForm/);
});
