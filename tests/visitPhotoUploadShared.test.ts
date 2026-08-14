import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AGENCY_VISIT_PHOTO_LONG_SIDE,
  fitImageWithinLongSide,
  fitWholesaleVisitPhoto,
  getVisitPhotoUploadPrefix,
  isValidVisitPhotoUploadSessionId,
  isVisitPhotoPathForSession,
  MAX_AGENCY_VISIT_PHOTO_BYTES,
  MAX_VISIT_PHOTO_BYTES,
  WHOLESALE_VISIT_PHOTO_SHORT_SIDE,
} from '../lib/visitPhotoUploadShared';

describe('visit photo client upload boundaries', () => {
  const sessionId = '123e4567-e89b-42d3-a456-426614174000';

  it('keeps the documented five-megabyte application limit', () => {
    assert.equal(MAX_VISIT_PHOTO_BYTES, 5 * 1024 * 1024);
    assert.equal(MAX_AGENCY_VISIT_PHOTO_BYTES, 200 * 1024);
  });

  it('caps the wholesale photo short side at 1000 pixels without upscaling', () => {
    assert.equal(WHOLESALE_VISIT_PHOTO_SHORT_SIDE, 1000);
    assert.deepEqual(fitWholesaleVisitPhoto(4032, 3024), { width: 1333, height: 1000 });
    assert.deepEqual(fitWholesaleVisitPhoto(800, 600), { width: 800, height: 600 });
  });

  it('starts agency compression with a 1600-pixel long-side cap', () => {
    assert.equal(AGENCY_VISIT_PHOTO_LONG_SIDE, 1600);
    assert.deepEqual(fitImageWithinLongSide(4032, 3024, AGENCY_VISIT_PHOTO_LONG_SIDE), {
      width: 1600,
      height: 1200,
    });
    assert.deepEqual(fitImageWithinLongSide(1200, 900, AGENCY_VISIT_PHOTO_LONG_SIDE), {
      width: 1200,
      height: 900,
    });
  });

  it('accepts UUID upload sessions and builds a session-scoped Blob prefix', () => {
    assert.equal(isValidVisitPhotoUploadSessionId(sessionId), true);
    assert.equal(getVisitPhotoUploadPrefix(sessionId), `visit-photos/pending/${sessionId}/`);
  });

  it('accepts only Blob paths scoped to the submitted upload session', () => {
    assert.equal(
      isVisitPhotoPathForSession(`visit-photos/pending/${sessionId}/0-photo.jpg`, sessionId),
      true,
    );
    assert.equal(
      isVisitPhotoPathForSession('visit-photos/pending/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/0-photo.jpg', sessionId),
      false,
    );
    assert.equal(
      isVisitPhotoPathForSession(`visit-photos/pending/${sessionId}/../other.jpg`, sessionId),
      false,
    );
  });
});
