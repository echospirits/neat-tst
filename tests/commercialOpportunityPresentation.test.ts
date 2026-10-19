import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import Papa from 'papaparse';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommercialOpportunityStars } from '../app/components/CommercialOpportunityStars';
import { commercialDiscoveryFilter, commercialRatingOrder, commercialRatingExport } from '../lib/commercialOpportunity';

test('all commercial tiers expose five read-only positions and precise accessible labels', () => {
  for (let rating = 0; rating <= 5; rating++) {
    const html = renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating }));
    assert.match(html, new RegExp(`Commercial opportunity: ${rating} of 5 stars`));
    assert.equal((html.match(/class="is-filled"/g) ?? []).length, rating);
    assert.equal((html.match(/class="is-empty"/g) ?? []).length, 5 - rating);
    assert.doesNotMatch(html, /<button|<input|role="slider"|\/100|priority/);
  }
});

test('zero and unrated remain distinct; pending, stale and failed source retain their state', () => {
  const zero = renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: 0 }));
  const unrated = renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: null }));
  assert.doesNotMatch(zero, /Unrated/); assert.match(unrated, /Unrated/);
  assert.match(renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: 4, pending: true })), /Recalculation pending/);
  assert.match(renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: 4, stale: true })), /Refresh due/);
  assert.match(renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: 4, status: 'SOURCE_ERROR' })), /Sales refresh failed/);
  assert.match(renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: null, status: 'ERROR' })), /Calculation failed/);
  assert.match(renderToStaticMarkup(createElement(CommercialOpportunityStars, { rating: 4.5 })), /Unrated/);
});

test('discovery defaults to actionable high stars with explicit zero/unrated filters and no evidence-mode ordering', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.deepEqual(commercialDiscoveryFilter(undefined, now), { rating: { gte: 3 }, state: 'READY', assessmentStatus: 'READY', refreshRequestedAt: null, dismissedKey: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] });
  assert.deepEqual(commercialDiscoveryFilter('zero'), { rating: 0 });
  assert.deepEqual(commercialDiscoveryFilter('unrated'), { rating: null });
  assert.deepEqual(commercialDiscoveryFilter('all'), {});
  assert.deepEqual(commercialRatingOrder(), [{ rating: { sort: 'desc', nulls: 'last' } }, { wholesaleAccountId: 'asc' }]);
  assert.deepEqual(commercialRatingOrder(true)[0], { rating: { sort: 'asc', nulls: 'last' } });
});

test('machine export preserves integer zero versus null with assessment status and reason', () => {
  const zero = commercialRatingExport({ rating: 0, assessmentStatus: 'READY', assessmentReason: 'Little compatible volume' });
  const unrated = commercialRatingExport({ rating: null, assessmentStatus: 'UNRATED', assessmentReason: 'Missing price evidence' });
  assert.equal(JSON.parse(JSON.stringify(zero)).commercial_rating, 0);
  assert.equal(JSON.parse(JSON.stringify(unrated)).commercial_rating, null);
  assert.equal(unrated.assessment_status, 'UNRATED');
  const csv = Papa.parse(Papa.unparse([zero, unrated]), { header: true }).data as Array<Record<string, string>>;
  assert.equal(csv[0].commercial_rating, '0'); assert.equal(csv[1].commercial_rating, '');
});
