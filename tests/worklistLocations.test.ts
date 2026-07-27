import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorklistCategory } from '@prisma/client';
import { getWorklistLocationReference } from '../lib/worklistLocations';

describe('worklist location resolution', () => {
  it('uses the wholesale account directly attached to a wholesale item', () => {
    assert.deepEqual(
      getWorklistLocationReference({
        category: WorklistCategory.WHOLESALE,
        agencyId: null,
        wholesaleAccountId: 'wholesale-1',
        loggedVisit: null,
      }),
      { id: 'wholesale-1', type: 'wholesale' },
    );
  });

  it('uses the linked visit location for a general item', () => {
    assert.deepEqual(
      getWorklistLocationReference({
        category: WorklistCategory.GENERAL,
        agencyId: null,
        wholesaleAccountId: null,
        loggedVisit: {
          locationType: 'wholesale',
          agencyId: null,
          wholesaleAccountId: 'wholesale-from-visit',
        },
      }),
      { id: 'wholesale-from-visit', type: 'wholesale' },
    );
  });

  it('returns no reference for a genuinely locationless general item', () => {
    assert.equal(
      getWorklistLocationReference({
        category: WorklistCategory.GENERAL,
        agencyId: null,
        wholesaleAccountId: null,
        loggedVisit: null,
      }),
      null,
    );
  });
});
