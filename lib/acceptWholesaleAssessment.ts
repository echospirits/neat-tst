import { Prisma, type PrismaClient, type UserRole } from '@prisma/client';
import { commercialAccountKey } from './commercialOpportunity';
import { readAssessment } from './wholesaleAssessment';

export const chosenPursuitWhere = {
  OR: [{ status: { in: ['ACTIONED', 'SNOOZED'] } }, { status: 'OPEN', OR: [{ actionedAt: { not: null } }, { worklistItems: { some: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } }] }],
} satisfies Prisma.SalesOpportunityWhereInput;

// Explicit acceptance is the only bridge from computed intelligence to CRM work.
// One transaction keeps the frozen hypothesis, assignment, task and events together.
export async function acceptWholesaleAssessment({ db, organizationId, id, candidateKey, actor, assignedToUserId }: {
  db: PrismaClient; organizationId: string; id: string; candidateKey: string;
  actor: { id: string; role: UserRole }; assignedToUserId?: string;
}) {
  return db.$transaction(async tx => {
    const row = await tx.wholesaleAccountAssessment.findFirst({ where: { id, organizationId } });
    const assessment = readAssessment(row?.assessment);
    const accountKey = row ? commercialAccountKey(row.wholesaleAccountId) : null;
    if (row?.refreshRequestedAt) throw new Error('Commercial inputs changed; wait for recalculation before accepting this account.');
    if (!row || !assessment || assessment.rating === null || assessment.rating < 3 || row.state !== 'READY' || row.assessmentStatus !== 'READY' || accountKey !== candidateKey || Boolean(row.dismissedKey) || row.snoozedUntil && row.snoozedUntil > new Date()) throw new Error('Commercial assessment changed or is unavailable. Refresh and review it.');
    const [account, overlay, assignee, existing] = await Promise.all([
      tx.wholesaleAccount.findFirst({ where: { id: row.wholesaleAccountId, mergedIntoId: null }, include: { tags: { where: { organizationId }, include: { tag: true } } } }),
      tx.organizationAccountOverlay.findFirst({ where: { organizationId, accountType: 'WHOLESALE', externalAccountId: row.wholesaleAccountId } }),
      tx.user.findFirst({ where: { id: ['ADMIN','PLATFORM_ADMIN'].includes(actor.role) ? assignedToUserId || actor.id : actor.id, organizationId, isActive: true, role: { notIn: ['TASTER','PLATFORM_ADMIN'] } }, select: { id: true, name: true, email: true } }),
      tx.salesOpportunity.findFirst({ where: { organizationId, wholesaleAccountId: row.wholesaleAccountId, ...chosenPursuitWhere } }),
    ]);
    if (!account || account.isActive === false || account.tags.some(t => /DO.NOT.PURSUE/i.test(t.tag.name)) || overlay?.opportunitySuppressed || overlay?.active === false) throw new Error('This account is inactive or suppressed. Review its eligibility.');
    if (!assignee) throw new Error('Choose an active team member in this organization.');
    if (existing) throw new Error('An existing pursuit already holds this account’s work. Open that pursuit to continue.');
    const now = new Date();
    await tx.salesOpportunity.updateMany({ where: { organizationId, wholesaleAccountId: row.wholesaleAccountId, status: 'OPEN', actionedAt: null, worklistItems: { none: { status: { in: ['OPEN','IN_PROGRESS'] } } } }, data: { status: 'RESOLVED', activeAccountKey: null, resolvedAt: now } });
    const opportunity = await tx.salesOpportunity.create({ data: { organizationId, wholesaleAccountId: row.wholesaleAccountId, activeAccountKey: `${organizationId}:${row.wholesaleAccountId}`,
      type: 'COMMERCIAL_FOLLOW_UP', status: 'ACTIONED', cycleKey: `${accountKey}:${row.runId}`, targetCategory: null,
      title: row.title, recommendedAction: row.action, explanation: assessment.reasons, signalSnapshot: row.assessment as Prisma.InputJsonValue,
      rulesVersion: assessment.version, scoringVersion: assessment.version, productionScore: 0, priorityBand: row.priorityBand, assignedToUserId: assignee.id,
      detectedAt: now, lastDetectedAt: now, actionedAt: now } });
    const item = await tx.worklistItem.create({ data: { organizationId, wholesaleAccountId: row.wholesaleAccountId, salesOpportunityId: opportunity.id, title: row.action,
      detail: `${row.title}\n${assessment.reasons.join('\n')}`, category: 'WHOLESALE', source: 'OPPORTUNITY_INTELLIGENCE', status: 'OPEN', assignedToUserId: assignee.id,
      assignedTo: assignee.name || assignee.email, createdByUserId: actor.id, dueDate: new Date(now.getTime() + 7 * 86_400_000) } });
    const context = { organizationId, opportunityId: opportunity.id, wholesaleAccountId: row.wholesaleAccountId, userId: actor.id, occurredAt: now };
    await tx.opportunityEvent.createMany({ data: [
      { ...context, eventType: 'DETECTED', eventKey: 'DETECTED:ACCEPTED', metadata: { modelVersion: assessment.version, assessmentRunId: row.runId, commercialRating: assessment.rating, hypothesis: { type: 'COMMERCIAL_FOLLOW_UP', accountKey }, evidence: assessment.reasons } },
      { ...context, eventType: 'ACTIONED', eventKey: 'ACTIONED:primary', metadata: { assignedToUserId: assignee.id } },
      { ...context, eventType: 'WORKLIST_CREATED', eventKey: `WORKLIST_CREATED:${item.id}`, worklistItemId: item.id },
    ] });
    return { taskId: item.id, accountId: row.wholesaleAccountId };
  }, { isolationLevel: 'Serializable' });
}
