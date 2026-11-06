-- Preserve milestone and Visit evidence while allowing an explicit workflow label.
ALTER TABLE "TastingEvent" ADD COLUMN "workflowStatusOverride" TEXT;

ALTER TABLE "TastingEvent" ADD CONSTRAINT "TastingEvent_workflow_status_override_check"
CHECK ("workflowStatusOverride" IS NULL OR "workflowStatusOverride" IN (
  'DRAFT', 'NEEDS_TASTER_RESPONSE', 'TASTER_APPROVED', 'TASTER_NEEDS_EDIT',
  'REQUESTED_AGENCY_APPROVAL', 'AGENCY_APPROVED', 'AGENCY_DENIED', 'SUBMITTED_TO_STATE',
  'STATE_APPROVED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED'
));
