import assert from 'node:assert/strict';
import test from 'node:test';
import { getVisitContinueTarget } from '../lib/visitConfirmation';

test('agency and wholesale confirmations continue to the logged account', () => {
  assert.deepEqual(
    getVisitContinueTarget({
      formOrigin: 'visits',
      isTaster: false,
      visit: { agencyId: 'agency-1', locationType: 'agency', wholesaleAccountId: null },
    }),
    { href: '/agencies/agency-1', label: 'Continue to agency' },
  );
  assert.deepEqual(
    getVisitContinueTarget({
      formOrigin: 'visits',
      isTaster: false,
      visit: { agencyId: null, locationType: 'wholesale', wholesaleAccountId: 'wholesale-1' },
    }),
    { href: '/wholesale/wholesale-1', label: 'Continue to wholesale account' },
  );
});

test('worklist confirmations return to the worklist', () => {
  assert.deepEqual(
    getVisitContinueTarget({
      formOrigin: 'worklist',
      isTaster: false,
      visit: { agencyId: 'agency-1', locationType: 'agency', wholesaleAccountId: null },
    }),
    { href: '/alerts', label: 'Return to worklist' },
  );
});

test('Taster confirmations offer another restricted agency visit', () => {
  assert.deepEqual(
    getVisitContinueTarget({
      formOrigin: 'visits',
      isTaster: true,
      visit: { agencyId: 'agency-1', locationType: 'agency', wholesaleAccountId: null },
    }),
    { href: '/visits/new', label: 'Log another agency visit' },
  );
});
