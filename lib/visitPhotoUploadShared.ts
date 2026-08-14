export const MAX_VISIT_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_AGENCY_VISIT_PHOTO_BYTES = 200 * 1024;
export const WHOLESALE_VISIT_PHOTO_SHORT_SIDE = 1000;
export const AGENCY_VISIT_PHOTO_LONG_SIDE = 1600;

export type VisitPhotoLocationType = 'agency' | 'wholesale';

export function fitImageWithinLongSide(width: number, height: number, maximumLongSide: number) {
  const scale = Math.min(1, maximumLongSide / Math.max(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

export function fitWholesaleVisitPhoto(width: number, height: number) {
  const scale = Math.min(1, WHOLESALE_VISIT_PHOTO_SHORT_SIDE / Math.min(width, height));
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

const uploadSessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidVisitPhotoUploadSessionId = (value: string) => uploadSessionPattern.test(value);

export const getVisitPhotoUploadPrefix = (sessionId: string) => `visit-photos/pending/${sessionId}/`;

export const isVisitPhotoPathForSession = (pathname: string, sessionId: string) =>
  isValidVisitPhotoUploadSessionId(sessionId) &&
  pathname.startsWith(getVisitPhotoUploadPrefix(sessionId)) &&
  !pathname.includes('..');
