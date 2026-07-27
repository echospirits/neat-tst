import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorklistCategory } from '@prisma/client';
import {
  getWorklistCategoryForLocationSelection,
  getWorklistLocationFallbackLabel,
  getWorklistLocationReference,
} from '../lib/worklistLocations';

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

  it('uses a historical general task title as its location label', () => {
    assert.equal(
      getWorklistLocationFallbackLabel({
        title: 'Athletic Club',
        category: WorklistCategory.GENERAL,
        agencyId: null,
        wholesaleAccountId: null,
        loggedVisit: null,
      }),
      'Athletic Club',
    );
  });

  it('does not hide a broken stored reference behind the task title', () => {
    assert.equal(
      getWorklistLocationFallbackLabel({
        title: 'Follow up',
        category: WorklistCategory.WHOLESALE,
        agencyId: null,
        wholesaleAccountId: 'missing-account',
        loggedVisit: null,
      }),
      'Location unavailable',
    );
  });

  it('promotes a general task with one selected account to that location category', () => {
    assert.equal(
      getWorklistCategoryForLocationSelection(
        WorklistCategory.GENERAL,
        null,
        'wholesale-1',
      ),
      WorklistCategory.WHOLESALE,
    );
    assert.equal(
      getWorklistCategoryForLocationSelection(
        WorklistCategory.GENERAL,
        'agency-1',
        null,
      ),
      WorklistCategory.AGENCY,
    );
  });

  it('keeps an ambiguous general task general when both location types are selected', () => {
    assert.equal(
      getWorklistCategoryForLocationSelection(
        WorklistCategory.GENERAL,
        'agency-1',
        'wholesale-1',
      ),
      WorklistCategory.GENERAL,
    );
  });
});
