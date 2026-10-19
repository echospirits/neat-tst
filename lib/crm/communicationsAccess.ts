// Platform privileges never substitute for the user's own tenant membership.
export function canAccessOwnCommunications(
  user: { organizationId: string | null },
  context: { organizationId: string; isSupportView: boolean },
) {
  return !context.isSupportView && user.organizationId === context.organizationId;
}
