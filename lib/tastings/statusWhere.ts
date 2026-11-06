import type { Prisma } from '@prisma/client';
import { TASTING_WORKFLOW_STATUSES, TERMINAL_TASTING_WORKFLOW_STATUSES } from './model';

const noWorkflowOverride = {
  OR: [{ workflowStatusOverride: null }, { workflowStatusOverride: { notIn: [...TASTING_WORKFLOW_STATUSES] } }],
} satisfies Prisma.TastingEventWhereInput;

/** Current scheduling obligations; completed Visit evidence always remains historical. */
export const activeTastingWhere = {
  completedAt: null,
  OR: [
    { workflowStatusOverride: { in: TASTING_WORKFLOW_STATUSES.filter(status => !TERMINAL_TASTING_WORKFLOW_STATUSES.some(terminal => terminal === status)) } },
    { AND: [noWorkflowOverride, { cancelledAt: null, agencyApproval: { not: 'DENIED' }, stateApproval: { not: 'DENIED' } }] },
  ],
} satisfies Prisma.TastingEventWhereInput;

/** Effective terminal workflow states plus immutable completion evidence. */
export const terminalTastingWhere = {
  OR: [
    { completedAt: { not: null } },
    { workflowStatusOverride: { in: [...TERMINAL_TASTING_WORKFLOW_STATUSES] } },
    { AND: [noWorkflowOverride, { OR: [{ cancelledAt: { not: null } }, { agencyApproval: 'DENIED' }, { stateApproval: 'DENIED' }] }] },
  ],
} satisfies Prisma.TastingEventWhereInput;
