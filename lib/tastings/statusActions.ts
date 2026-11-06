import { deriveTastingStatus, isTerminalTasting, TASTING_STATUS_LABELS, TASTING_WORKFLOW_STATUSES, type TastingState } from './model';

/** Only the workflow fields needed by an inline control cross the client boundary. */
export function tastingStatusControlData(tasting: TastingState & { id: string; version: number }) {
  return {
    id: tasting.id, version: tasting.version, status: deriveTastingStatus(tasting),
    terminal: isTerminalTasting(tasting), assignedTasterUserId: tasting.assignedTasterUserId ?? null,
  };
}
export type TastingStatusControlData = ReturnType<typeof tastingStatusControlData>;
export type TastingStatusAction = { status: typeof TASTING_WORKFLOW_STATUSES[number]; label: string; comment: 'none' | 'optional' | 'required'; commentLabel?: string };

/** Pilot policy: admins and assigned tasters have the same unrestricted status choices.
 * transitionTasting rechecks this against the authenticated actor and current version. */
export function getTastingStatusActions(tasting: TastingStatusControlData, actor: { userId: string; coordinator: boolean }): TastingStatusAction[] {
  if (!actor.coordinator && tasting.assignedTasterUserId !== actor.userId) return [];
  return TASTING_WORKFLOW_STATUSES.filter(status => status !== tasting.status).map(status => ({
    status, label: TASTING_STATUS_LABELS[status],
    comment: status === 'TASTER_NEEDS_EDIT' || status === 'CANCELLED' ? 'required' : status === 'AGENCY_DENIED' || status === 'STATE_DENIED' ? 'optional' : 'none',
    ...(status === 'TASTER_NEEDS_EDIT' ? { commentLabel: 'What needs to change?' } : status === 'CANCELLED' ? { commentLabel: 'Cancellation reason' } : status === 'AGENCY_DENIED' || status === 'STATE_DENIED' ? { commentLabel: 'Denial reason (optional)' } : {}),
  }));
}
