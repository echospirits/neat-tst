import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalText, currentArrival, quantityText, safeReturnTo, shortDate, type Arrival } from '../app/production-supplies/display';

const estimate = (source: string, date: string, extra: Partial<Arrival> = {}): Arrival => ({ source, precision: 'DATE', startDate: date, timezone: 'America/Los_Angeles', current: true, observedAt: '2026-11-11T10:00:00Z', sourceEventAt: '2026-11-11T09:00:00Z', ...extra });
test('supply arrival display preserves date-only dates and avoids inventing a time', () => {
  assert.equal(shortDate('2026-11-12'), 'Nov 12, 2026');
  assert.equal(arrivalText(estimate('CARRIER', '2026-11-12')), 'Nov 12, 2026');
  assert.equal(arrivalText(estimate('CARRIER', '2026-11-12', { endDate: '2026-11-14', precision: 'DATE_RANGE' })), 'Nov 12, 2026 – Nov 14, 2026');
  assert.equal(arrivalText(undefined), 'No ETA available');
});
test('carrier updates outrank supplier promises while history and source precision remain intact', () => {
  const original = estimate('SUPPLIER_PROMISE', '2026-11-12');
  const current = estimate('CARRIER', '2026-11-14');
  assert.equal(currentArrival([original, current])?.startDate, '2026-11-14');
  assert.equal(original.startDate, '2026-11-12');
  assert.equal(currentArrival([current, estimate('CARRIER', '2026-11-13', { current: false })])?.startDate, '2026-11-14');
  assert.match(arrivalText(estimate('APPOINTMENT', '2026-11-14', { timeStart: '10:00', timeEnd: '12:00' })), /10:00–12:00 America\/Los_Angeles/);
});
test('unknown quantities stay unknown and supply return context stays within the feature', () => {
  assert.equal(quantityText(null, 'lb'), 'Quantity unknown');
  assert.equal(quantityText(0, 'lb'), '0 lb');
  assert.equal(safeReturnTo('//attacker.example'), '/production-supplies');
  assert.equal(safeReturnTo('/production-supplies?view=review&q=raisins'), '/production-supplies?view=review&q=raisins');
});
