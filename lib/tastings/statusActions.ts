import { deriveTastingStatus, isTerminalTasting, TASTING_STATUS_LABELS, type TastingState } from './model';
import type { TastingAction } from './service';

/** Only the workflow fields needed by an inline control cross the client boundary. */
export function tastingStatusControlData(tasting: TastingState & { id: string; version: number }) {
  return {
    id: tasting.id, version: tasting.version, status: deriveTastingStatus(tasting),
    terminal: isTerminalTasting(tasting), assignedTasterUserId: tasting.assignedTasterUserId ?? null,
    tasterResponse: tasting.tasterResponse, agencyApproval: tasting.agencyApproval, stateApproval: tasting.stateApproval,
  };
}
export type TastingStatusControlData = ReturnType<typeof tastingStatusControlData>;
export type TastingStatusAction = { action: TastingAction; label: string; comment: 'none' | 'optional' | 'required'; commentLabel?: string };

/** Presentation only: transitionTasting rechecks the authenticated actor and current version. */
export function getTastingStatusActions(tasting: TastingStatusControlData, actor: { userId: string; coordinator: boolean }): TastingStatusAction[] {
  if (tasting.terminal) return [];
  const actions: TastingStatusAction[] = [];
  if (tasting.assignedTasterUserId === actor.userId) {
    if (tasting.tasterResponse !== 'APPROVED') actions.push({ action: 'TASTER_APPROVE', label: TASTING_STATUS_LABELS.TASTER_APPROVED, comment: 'none' });
    if (tasting.tasterResponse !== 'NEEDS_EDIT') actions.push({ action: 'TASTER_NEEDS_EDIT', label: TASTING_STATUS_LABELS.TASTER_NEEDS_EDIT, comment: 'required', commentLabel: 'What needs to change?' });
  }
  if (actor.coordinator) {
    if (tasting.tasterResponse === 'APPROVED' && tasting.agencyApproval === 'NOT_REQUESTED') actions.push({ action: 'REQUEST_AGENCY_APPROVAL', label: TASTING_STATUS_LABELS.REQUESTED_AGENCY_APPROVAL, comment: 'none' });
    if (tasting.agencyApproval === 'REQUESTED') actions.push(
      { action: 'AGENCY_APPROVE', label: TASTING_STATUS_LABELS.AGENCY_APPROVED, comment: 'none' },
      { action: 'AGENCY_DENY', label: TASTING_STATUS_LABELS.AGENCY_DENIED, comment: 'optional', commentLabel: 'Agency denial reason (optional)' },
    );
    if (tasting.tasterResponse === 'APPROVED' && tasting.agencyApproval === 'APPROVED' && tasting.stateApproval === 'NOT_SUBMITTED') actions.push({ action: 'SUBMIT_TO_STATE', label: TASTING_STATUS_LABELS.SUBMITTED_TO_STATE, comment: 'none' });
    if (tasting.stateApproval === 'SUBMITTED') actions.push(
      { action: 'STATE_APPROVE', label: TASTING_STATUS_LABELS.STATE_APPROVED, comment: 'none' },
      { action: 'STATE_DENY', label: TASTING_STATUS_LABELS.STATE_DENIED, comment: 'optional', commentLabel: 'State denial reason (optional)' },
    );
    actions.push({ action: 'CANCEL', label: TASTING_STATUS_LABELS.CANCELLED, comment: 'required', commentLabel: 'Cancellation reason' });
  }
  return actions;
}
