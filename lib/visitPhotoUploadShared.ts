export const MAX_VISIT_PHOTO_BYTES = 5 * 1024 * 1024;

const uploadSessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidVisitPhotoUploadSessionId = (value: string) => uploadSessionPattern.test(value);

export const getVisitPhotoUploadPrefix = (sessionId: string) => `visit-photos/pending/${sessionId}/`;

export const isVisitPhotoPathForSession = (pathname: string, sessionId: string) =>
  isValidVisitPhotoUploadSessionId(sessionId) &&
  pathname.startsWith(getVisitPhotoUploadPrefix(sessionId)) &&
  !pathname.includes('..');
