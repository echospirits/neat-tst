import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getVisitPhotoUploadPrefix,
  isValidVisitPhotoUploadSessionId,
  isVisitPhotoPathForSession,
  MAX_VISIT_PHOTO_BYTES,
} from '../lib/visitPhotoUploadShared';

describe('visit photo client upload boundaries', () => {
  const sessionId = '123e4567-e89b-42d3-a456-426614174000';

  it('keeps the documented five-megabyte application limit', () => {
    assert.equal(MAX_VISIT_PHOTO_BYTES, 5 * 1024 * 1024);
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
