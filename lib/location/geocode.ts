import type { GeocodeStatus } from '@prisma/client';

export type AddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  normalizedAddress: string;
};

type GeocodeReset = {
  latitude: null;
  longitude: null;
  geocodedAt: null;
  geocodeStatus: GeocodeStatus;
  normalizedGeocodeAddress: null;
  geocodeError: null;
};

const cleanAddressPart = (value: string | null | undefined) =>
  String(value ?? '').trim().replace(/\s+/g, ' ');

export const buildGeocodeAddress = (parts: AddressParts) =>
  [parts.address, parts.city, parts.state, parts.zip]
    .map(cleanAddressPart)
    .filter(Boolean)
    .join(', ');

export const normalizeGeocodeAddress = (parts: AddressParts) =>
  buildGeocodeAddress(parts).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export const didGeocodeAddressChange = (previous: AddressParts, next: AddressParts) =>
  normalizeGeocodeAddress(previous) !== normalizeGeocodeAddress(next);

export const getGeocodeResetForAddressChange = (
  previous: AddressParts | null | undefined,
  next: AddressParts,
): GeocodeReset | Record<string, never> => {
  if (!previous || !didGeocodeAddressChange(previous, next)) return {};

  return {
    latitude: null,
    longitude: null,
    geocodedAt: null,
    geocodeStatus: 'PENDING',
    normalizedGeocodeAddress: null,
    geocodeError: null,
  };
};

export async function geocodeAddress(parts: AddressParts): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  if (!apiKey) throw new Error('GOOGLE_MAPS_GEOCODING_API_KEY is not configured.');

  const address = buildGeocodeAddress(parts);
  if (!parts.address?.trim() || !parts.city?.trim() || !address) {
    throw new Error('A street address and city are required for geocoding.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Google geocoding returned HTTP ${response.status}.`);

  const data = (await response.json()) as {
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
    status?: string;
  };
  const match = data.results?.[0];
  const latitude = match?.geometry?.location?.lat;
  const longitude = match?.geometry?.location?.lng;
  if (data.status !== 'OK' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(data.error_message || `Google geocoding returned ${data.status ?? 'an invalid response'}.`);
  }

  return {
    latitude: latitude as number,
    longitude: longitude as number,
    normalizedAddress: normalizeGeocodeAddress(parts),
  };
}

