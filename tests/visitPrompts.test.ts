import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agencyVisitOutcomes,
  getOutcomeLabels,
  getVisitTaskEditPlan,
  getVisitOutcomeDisplay,
  getVisitOutcomes,
  normalizeFollowUpMode,
  sanitizeOutcomeCodes,
  shouldCreateVisitTask,
  wholesaleVisitOutcomes,
} from '../lib/visitWorkflow';

describe('visit outcome configuration', () => {
  it('keeps shared language but supports visit-type-specific outcomes', () => {
    assert.ok(wholesaleVisitOutcomes.some((outcome) => outcome.code === 'menu-opportunity'));
    assert.ok(agencyVisitOutcomes.some((outcome) => outcome.code === 'display-opportunity'));
    assert.equal(wholesaleVisitOutcomes.some((outcome) => outcome.code === 'display-opportunity'), false);
    assert.equal(agencyVisitOutcomes.some((outcome) => outcome.code === 'menu-opportunity'), false);
  });

  it('sanitizes submitted outcome codes against the selected visit type', () => {
    assert.deepEqual(
      sanitizeOutcomeCodes('wholesale', ['met-buyer', 'menu-opportunity', 'menu-opportunity', 'forged-value']),
      ['met-buyer', 'menu-opportunity'],
    );
    assert.deepEqual(getOutcomeLabels('wholesale', ['met-buyer', 'menu-opportunity']), ['Met buyer', 'Menu opportunity']);
  });

  it('preserves readable outcomes for visits created before structured codes', () => {
    assert.deepEqual(
      getVisitOutcomeDisplay({ locationType: 'agency', outcomeCodes: [], legacyOutcomes: 'Quick outcomes: Met buyer, Display checked' }),
      ['Met buyer', 'Display checked'],
    );
    assert.equal(getVisitOutcomes('agency').length > 0, true);
  });
});

describe('visit follow-up behavior', () => {
  it('creates a worklist item only when explicitly selected', () => {
    assert.equal(shouldCreateVisitTask(normalizeFollowUpMode('task')), true);
    assert.equal(shouldCreateVisitTask(normalizeFollowUpMode('later')), false);
    assert.equal(shouldCreateVisitTask(normalizeFollowUpMode('unexpected')), false);
  });

  it('updates the linked follow-up on edit instead of creating a duplicate', () => {
    assert.equal(getVisitTaskEditPlan('task', 'OPEN'), 'update');
    assert.equal(getVisitTaskEditPlan('task', null), 'create');
    assert.equal(getVisitTaskEditPlan('none', 'OPEN'), 'cancel');
    assert.equal(getVisitTaskEditPlan('later', 'COMPLETED'), 'none');
  });
});
