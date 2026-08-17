export function shouldAutomaticallyRequestLocation(
  hasRememberedPreference: boolean,
  permissionState: PermissionState | null,
) {
  if (permissionState === 'denied') return false;
  return permissionState === 'granted' || hasRememberedPreference;
}
