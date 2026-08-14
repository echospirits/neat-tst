'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Coordinates } from '../../lib/location/distance';

type CurrentLocation = Coordinates & {
  accuracy: number;
  capturedAt: number;
};

type LocationState =
  | { status: 'idle' | 'loading' | 'denied' | 'unavailable'; location: null }
  | { status: 'ready'; location: CurrentLocation };

const LOCATION_KEY = 'crm-current-location-v1';
const DENIED_KEY = 'crm-location-denied-v1';
const MAX_LOCATION_AGE_MS = 10 * 60 * 1000;

const readCachedLocation = (): CurrentLocation | null => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LOCATION_KEY) ?? 'null') as CurrentLocation | null;
    if (!parsed || Date.now() - parsed.capturedAt > MAX_LOCATION_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle', location: null });

  useEffect(() => {
    const cached = readCachedLocation();
    if (cached) setState({ status: 'ready', location: cached });
    else if (sessionStorage.getItem(DENIED_KEY) === 'true') setState({ status: 'denied', location: null });
    else if (!navigator.geolocation) setState({ status: 'unavailable', location: null });
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: 'unavailable', location: null });
      return;
    }

    setState({ status: 'loading', location: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: CurrentLocation = {
          accuracy: position.coords.accuracy,
          capturedAt: Date.now(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        sessionStorage.setItem(LOCATION_KEY, JSON.stringify(location));
        sessionStorage.removeItem(DENIED_KEY);
        setState({ status: 'ready', location });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        if (denied) sessionStorage.setItem(DENIED_KEY, 'true');
        setState({ status: denied ? 'denied' : 'unavailable', location: null });
      },
      { enableHighAccuracy: false, maximumAge: MAX_LOCATION_AGE_MS, timeout: 8_000 },
    );
  }, []);

  return { ...state, requestLocation };
}

