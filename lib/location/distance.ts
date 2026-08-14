export type Coordinates = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_MILES = 3958.7613;
const MILES_PER_LATITUDE_DEGREE = 69;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const isValidCoordinates = (value: Coordinates) =>
  Number.isFinite(value.latitude) &&
  Number.isFinite(value.longitude) &&
  value.latitude >= -90 &&
  value.latitude <= 90 &&
  value.longitude >= -180 &&
  value.longitude <= 180;

export const parseCoordinates = (
  latitudeValue: string | null | undefined,
  longitudeValue: string | null | undefined,
): Coordinates | null => {
  if (!latitudeValue?.trim() || !longitudeValue?.trim()) return null;
  const coordinates = { latitude: Number(latitudeValue), longitude: Number(longitudeValue) };
  return isValidCoordinates(coordinates) ? coordinates : null;
};

export function getDistanceMiles(from: Coordinates, to: Coordinates) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getCoordinateBounds(center: Coordinates, radiusMiles: number) {
  const latitudeDelta = radiusMiles / MILES_PER_LATITUDE_DEGREE;
  const longitudeMilesPerDegree = Math.max(
    MILES_PER_LATITUDE_DEGREE * Math.cos(toRadians(center.latitude)),
    0.01,
  );
  const longitudeDelta = radiusMiles / longitudeMilesPerDegree;

  return {
    maxLatitude: Math.min(90, center.latitude + latitudeDelta),
    maxLongitude: Math.min(180, center.longitude + longitudeDelta),
    minLatitude: Math.max(-90, center.latitude - latitudeDelta),
    minLongitude: Math.max(-180, center.longitude - longitudeDelta),
  };
}

export const formatDistanceMiles = (distanceMiles: number) =>
  distanceMiles < 10 ? `${distanceMiles.toFixed(1)} mi` : `${Math.round(distanceMiles)} mi`;

