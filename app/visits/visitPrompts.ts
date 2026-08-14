// Kept as a compatibility export for existing imports and tests. The editable
// configuration now lives in lib/visitWorkflow so the form and server action
// validate against the same source of truth.
export {
  agencyVisitOutcomes as agencyVisitOutcomePrompts,
  getVisitOutcomes as getVisitOutcomePrompts,
  wholesaleVisitOutcomes as wholesaleVisitOutcomePrompts,
} from '../../lib/visitWorkflow';
