// Keep ownership on existing records while returning the application to Echo.
// Role, email domain and Support View never grant another organization access.
export const ECHO_ORGANIZATION_ID = 'org_echo_spirits';

export function hasEchoAccess(user: { organizationId: string | null } | null | undefined) {
  return user?.organizationId === ECHO_ORGANIZATION_ID;
}

export function assertEchoOrganization(organizationId: string) {
  if (organizationId !== ECHO_ORGANIZATION_ID) throw new Error('Background processing is restricted to Echo Spirits.');
}
