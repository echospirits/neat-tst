export const DEFAULT_TASTING_MINIMUM_DAYS = 10;
export type TastingState = {
  assignedTasterUserId?: string | null;
  tasterResponse: string;
  agencyApproval: string;
  stateApproval: string;
  workflowStatusOverride?: string | null;
  cancelledAt?: Date | null;
  completedAt?: Date | null;
  endsAt: Date;
  importNeedsReview?: boolean;
};
export const TASTING_STATUS_LABELS = {
  DRAFT: 'Draft', NEEDS_TASTER_RESPONSE: 'Needs Taster Response', TASTER_APPROVED: 'Taster Approved',
  TASTER_NEEDS_EDIT: 'Taster Needs Edit', REQUESTED_AGENCY_APPROVAL: 'Awaiting Agency Approval',
  AGENCY_APPROVED: 'Agency Approved', AGENCY_DENIED: 'Agency Denied', SUBMITTED_TO_STATE: 'Submitted to State',
  STATE_APPROVED: 'State Approved', STATE_DENIED: 'State Denied', CANCELLED: 'Cancelled',
  COMPLETED: 'Completed', IMPORT_REVIEW: 'Import Needs Review',
} as const;
export type TastingStatus = keyof typeof TASTING_STATUS_LABELS;
export function isTastingStatus(value: unknown): value is TastingStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TASTING_STATUS_LABELS, value);
}
export const TASTING_WORKFLOW_STATUSES = [
  'DRAFT', 'NEEDS_TASTER_RESPONSE', 'TASTER_APPROVED', 'TASTER_NEEDS_EDIT',
  'REQUESTED_AGENCY_APPROVAL', 'AGENCY_APPROVED', 'AGENCY_DENIED', 'SUBMITTED_TO_STATE',
  'STATE_APPROVED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED',
] as const;
export type TastingWorkflowStatus = typeof TASTING_WORKFLOW_STATUSES[number];
export function isTastingWorkflowStatus(value: unknown): value is TastingWorkflowStatus {
  return typeof value === 'string' && TASTING_WORKFLOW_STATUSES.some(status => status === value);
}
export const TERMINAL_TASTING_WORKFLOW_STATUSES = ['AGENCY_DENIED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED'] as const;
export function isTerminalTasting(value: Pick<TastingState, 'cancelledAt' | 'completedAt' | 'agencyApproval' | 'stateApproval' | 'workflowStatusOverride'>) {
  // A real Visit remains historical even when its workflow label is subsequently changed.
  if (value.completedAt) return true;
  if (isTastingWorkflowStatus(value.workflowStatusOverride)) return TERMINAL_TASTING_WORKFLOW_STATUSES.some(status => status === value.workflowStatusOverride);
  return Boolean(value.cancelledAt || value.agencyApproval === 'DENIED' || value.stateApproval === 'DENIED');
}
export function deriveTastingStatus(value: TastingState): TastingStatus {
  if (isTastingWorkflowStatus(value.workflowStatusOverride)) return value.workflowStatusOverride;
  if (value.cancelledAt) return 'CANCELLED';
  if (value.completedAt) return 'COMPLETED';
  if (value.stateApproval === 'DENIED') return 'STATE_DENIED';
  if (value.agencyApproval === 'DENIED') return 'AGENCY_DENIED';
  if (value.importNeedsReview) return 'IMPORT_REVIEW';
  if (value.tasterResponse === 'NEEDS_EDIT') return 'TASTER_NEEDS_EDIT';
  if (value.stateApproval === 'APPROVED') return 'STATE_APPROVED';
  if (value.stateApproval === 'SUBMITTED') return 'SUBMITTED_TO_STATE';
  if (value.agencyApproval === 'APPROVED') return 'AGENCY_APPROVED';
  if (value.agencyApproval === 'REQUESTED') return 'REQUESTED_AGENCY_APPROVAL';
  if (value.tasterResponse === 'APPROVED') return 'TASTER_APPROVED';
  return value.assignedTasterUserId ? 'NEEDS_TASTER_RESPONSE' : 'DRAFT';
}
export function tastingExecutionStatus(value: TastingState, now = new Date()) {
  if (value.completedAt) return 'COMPLETED';
  const status = deriveTastingStatus(value);
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'STATE_DENIED' || status === 'AGENCY_DENIED') return 'DENIED';
  if (status === 'COMPLETED') return 'MANUALLY_COMPLETED';
  return value.endsAt < now ? 'VISIT_NOT_LOGGED' : 'SCHEDULED';
}
export function tastingMinimumDays(settings: unknown): number {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return DEFAULT_TASTING_MINIMUM_DAYS;
  const value = (settings as Record<string, unknown>).tastingMinimumDays;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 365 ? value : DEFAULT_TASTING_MINIMUM_DAYS;
}
export type ConflictCandidate = TastingState & { id: string; agencyId: string; assignedTasterUserId: string | null; scheduledDate: Date; startsAt: Date };
export function tastingConflicts(input: Pick<ConflictCandidate, 'agencyId' | 'assignedTasterUserId' | 'scheduledDate' | 'startsAt' | 'endsAt'> & { id?: string }, existing: readonly ConflictCandidate[], minimumDays = DEFAULT_TASTING_MINIMUM_DAYS) {
  const active = existing.filter(value => value.id !== input.id && !isTerminalTasting(value));
  return {
    spacing: active.filter(value => value.agencyId === input.agencyId && Math.abs(value.scheduledDate.getTime() - input.scheduledDate.getTime()) < minimumDays * 86_400_000),
    overlap: active.filter(value => input.assignedTasterUserId && value.assignedTasterUserId === input.assignedTasterUserId && value.startsAt < input.endsAt && value.endsAt > input.startsAt),
  };
}
