import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WholesaleAssessmentSummary } from '../app/components/WholesaleAssessmentSummary';
import { assessWholesaleAccount } from '../lib/wholesaleAssessment';
import { sourceCoverage } from '../lib/wholesaleAssessmentCoverage';
import { input, purchase, strongResearch } from './fixtures/wholesaleAssessment';

test('research-based summary separates calculation and research dates without fabricated purchase quantities', () => {
  const result = assessWholesaleAccount(input({ purchases: [], researchSignals: strongResearch(), coverage: sourceCoverage({ asOf: new Date('2026-09-28'), identity: 'UNAVAILABLE', completeDates: new Set(), hasPurchases: false, through: null }) }));
  const html = renderToStaticMarkup(createElement(WholesaleAssessmentSummary, { value: result, pending: true }));
  assert.match(html, /Research-based/); assert.match(html, /Last calculated/); assert.match(html, /Last researched/);
  assert.match(html, /Recalculation pending/); assert.match(html, /qualitative commercial tier/);
  assert.match(html, /<details/); assert.doesNotMatch(html, /compatible non-local|best SKU|confidence|\/ 100 priority/);
});

test('summary renders zero, absent assessment and stale/source-error states separately', () => {
  const empty = renderToStaticMarkup(createElement(WholesaleAssessmentSummary, { value: null, status: 'ERROR' }));
  assert.match(empty, /Unrated/); assert.match(empty, /Calculation failed/); assert.doesNotMatch(empty, /last valid rating/);
  const zero = assessWholesaleAccount(input({ purchases: [purchase(3)], calculatedAt: '2020-01-01' }));
  const html = renderToStaticMarkup(createElement(WholesaleAssessmentSummary, { value: zero }));
  assert.match(html, /0 of 5 stars/); assert.match(html, /Zero stars/); assert.match(html, /Refresh due/); assert.doesNotMatch(html, /Unrated/);
  const valid = assessWholesaleAccount(input({ purchases: [purchase(720)] }));
  const failed = renderToStaticMarkup(createElement(WholesaleAssessmentSummary, { value: valid, status: 'SOURCE_ERROR' }));
  assert.match(failed, /Sales refresh failed/); assert.match(failed, /last valid rating/);
  assert.match(failed, new RegExp(valid.rating + ' of 5 stars')); assert.match(failed, /represented period/);
});

test('details name the actual foundation and do not equate missing context periods with zero purchasing', () => {
  const result = assessWholesaleAccount(input({ purchases: [purchase(720)] }));
  result.coverage.representedFrom = '2026-08-30'; result.coverage.through = '2026-09-28';
  result.coverage.latestSourceDate = '2026-09-28';
  result.coverage.contextPeriods = {
    latest30: { from: '2026-08-30', through: '2026-09-28', coveredDays: 30, bottles: 0 },
    previous30: { from: '2026-07-31', through: '2026-08-29', coveredDays: 0, bottles: 0 },
  };
  const html = renderToStaticMarkup(createElement(WholesaleAssessmentSummary, { value: result }));
  assert.match(html, /2026-08-30 through 2026-09-28/); assert.match(html, /Latest source date 2026-09-28/);
  assert.match(html, /0 bottles on 30 represented days/); assert.match(html, /Source unavailable/);
  assert.match(html, /not directly comparable/); assert.match(html, /Unavailable days are not zero sales/);
});
