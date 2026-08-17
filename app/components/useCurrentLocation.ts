'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Coordinates } from '../../lib/location/distance';
import { shouldAutomaticallyRequestLocation } from '../../lib/location/locationPreference';

type CurrentLocation = Coordinates & {
  accuracy: number;
  capturedAt: number;
};

type LocationState =
  | { status: 'idle' | 'loading' | 'denied' | 'unavailable'; location: null }
  | { status: 'ready'; location: CurrentLocation };

const LOCATION_KEY = 'crm-current-location-v1';
const LOCATION_PREFERENCE_KEY = 'crm-location-enabled-v1';
const MAX_LOCATION_AGE_MS = 10 * 60 * 1000;

const readCachedLocation = (): CurrentLocation | null => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LOCATION_KEY) ?? 'null') as CurrentLocation | null;
    if (!parsed || Date.now() - parsed.capturedAt > MAX_LOCATION_AGE_MS) {
      sessionStorage.removeItem(LOCATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const hasRememberedLocationPreference = () => {
  try {
    return localStorage.getItem(LOCATION_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
};

const rememberLocationPreference = () => {
  try {
    localStorage.setItem(LOCATION_PREFERENCE_KEY, 'true');
  } catch {
    // Location still works when persistent browser storage is unavailable.
  }
};

const getLocationPermissionState = async (): Promise<PermissionState | null> => {
  if (!navigator.permissions) return null;
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return null;
  }
};

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle', location: null });

  const acquireLocation = useCallback(() => {
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
        rememberLocationPreference();
        setState({ status: 'ready', location });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setState({ status: denied ? 'denied' : 'unavailable', location: null });
      },
      { enableHighAccuracy: false, maximumAge: MAX_LOCATION_AGE_MS, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    const cached = readCachedLocation();
    if (cached) {
      rememberLocationPreference();
      setState({ status: 'ready', location: cached });
      return;
    }
    if (!navigator.geolocation) {
      setState({ status: 'unavailable', location: null });
      return;
    }

    let active = true;
    void getLocationPermissionState().then((permissionState) => {
      if (!active) return;
      if (permissionState === 'denied') {
        setState({ status: 'denied', location: null });
        return;
      }
      if (shouldAutomaticallyRequestLocation(hasRememberedLocationPreference(), permissionState)) {
        acquireLocation();
      }
    });

    return () => {
      active = false;
    };
  }, [acquireLocation]);

  const requestLocation = acquireLocation;

  return { ...state, requestLocation };
}

