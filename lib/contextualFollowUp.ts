import {
  OpportunityEventType,
  OpportunityStatus,
  UserRole,
  WorklistCategory,
  WorklistSource,
  WorklistStatus,
  type Prisma,
  type User,
} from "@prisma/client";
import { getUserDisplayName } from "./auth";
import {
  normalizeCRMActionContext,
  type CRMActionContext,
} from "./crmActionContext";
export class FollowUpError extends Error {}
export async function createAccountFollowUp(
  db: Prisma.TransactionClient,
  input: {
    organizationId: string;
    user: Pick<User, "id" | "name" | "email">;
    context: CRMActionContext;
    title: string;
    submissionKey: string;
    assignedToUserId?: string | null;
    dueDate?: Date | null;
    dueTimeMinutes?: number | null;
    note?: string | null;
    playbookRunId?: string | null;
  },
) {
  const { organizationId, user, submissionKey } = input;
  const context = normalizeCRMActionContext(input.context),
    title = input.title.trim().slice(0, 200);
  if (
    !title ||
    !submissionKey ||
    submissionKey.length > 200 ||
    Boolean(context.agencyId) === Boolean(context.wholesaleAccountId)
  )
    throw new FollowUpError("Choose one account and enter a title.");
  const [agency, wholesale, opportunity, agencyIntelligence] =
    await Promise.all([
      context.agencyId
        ? db.agency.findUnique({
            where: { id: context.agencyId },
            select: { id: true },
          })
        : null,
      context.wholesaleAccountId
        ? db.wholesaleAccount.findFirst({
            where: { id: context.wholesaleAccountId, mergedIntoId: null },
            select: { id: true },
          })
        : null,
      context.opportunityId
        ? db.salesOpportunity.findFirst({
            where: { id: context.opportunityId, organizationId },
            select: { id: true, wholesaleAccountId: true },
          })
        : null,
      context.agencyProductIntelligenceId
        ? db.agencyProductIntelligence.findFirst({
            where: { id: context.agencyProductIntelligenceId, organizationId },
            select: {
              id: true,
              agencyId: true,
              inventoryState: true,
              itemCode: true,
              opportunityState: true,
            },
          })
        : null,
    ]);
  if (
    (context.agencyId && !agency) ||
    (context.wholesaleAccountId && !wholesale)
  )
    throw new FollowUpError("The selected account is no longer available.");
  if (
    (context.opportunityId &&
      opportunity?.wholesaleAccountId !== context.wholesaleAccountId) ||
    (context.agencyProductIntelligenceId &&
      agencyIntelligence?.agencyId !== context.agencyId)
  ) {
    throw new FollowUpError(
      "The originating context does not match this account.",
    );
  }

  const requestedAssigneeId = input.assignedToUserId ?? user.id;
  const assignee = await db.user.findFirst({
    where: {
      id: requestedAssigneeId,
      organizationId,
      isActive: true,
      role: { notIn: [UserRole.TASTER, UserRole.PLATFORM_ADMIN] },
    },
  });
  if (!assignee) throw new FollowUpError("Choose an active team member.");
  const dueDate = input.dueDate ?? null;
  const dueTimeMinutes = dueDate ? (input.dueTimeMinutes ?? null) : null;
  const note = input.note;
  const detail =
    [
      context.reason,
      context.productItemCode || context.productName
        ? `Product: ${[context.productItemCode, context.productName].filter(Boolean).join(" - ")}`
        : null,
      note,
    ]
      .filter(Boolean)
      .join("\n\n") || null;

  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`followup:${organizationId}:${submissionKey}`}, 0))`;
  const existing = await db.worklistItem.findUnique({
    where: { organizationId_submissionKey: { organizationId, submissionKey } },
    select: { id: true },
  });
  if (existing) return { ...existing, replay: true };
  const item = await db.worklistItem.create({
    data: {
      organizationId,
      title,
      detail,
      status: WorklistStatus.OPEN,
      source: context.opportunityId
        ? WorklistSource.OPPORTUNITY_INTELLIGENCE
        : context.agencyProductIntelligenceId
          ? WorklistSource.AGENCY_INTELLIGENCE
          : WorklistSource.MANUAL,
      category: context.agencyId
        ? WorklistCategory.AGENCY
        : WorklistCategory.WHOLESALE,
      agencyId: context.agencyId,
      wholesaleAccountId: context.wholesaleAccountId,
      salesOpportunityId: context.opportunityId,
      agencyProductIntelligenceId: context.agencyProductIntelligenceId,
      submissionKey,
      playbookRunId: input.playbookRunId ?? null,
      dueDate,
      dueTimeMinutes,
      assignedToUserId: assignee.id,
      assignedTo: getUserDisplayName(assignee),
      createdByUserId: user.id,
      createdBy: getUserDisplayName(user),
    },
    select: { id: true },
  });
  if (opportunity) {
    const now = new Date();
    await Promise.all([
      db.salesOpportunity.update({
        where: { id: opportunity.id },
        data: {
          status: OpportunityStatus.ACTIONED,
          actionedAt: now,
          assignedToUserId: assignee.id,
        },
      }),
      db.opportunityEvent.create({
        data: {
          organizationId,
          opportunityId: opportunity.id,
          eventType: OpportunityEventType.WORKLIST_CREATED,
          eventKey: `WORKLIST_CREATED:${item.id}`,
          wholesaleAccountId: opportunity.wholesaleAccountId,
          userId: user.id,
          worklistItemId: item.id,
          metadata: {
            assignedToUserId: assignee.id,
            sourceType: context.sourceType,
          },
          occurredAt: now,
        },
      }),
    ]);
  }
  if (agencyIntelligence) {
    const now = new Date();
    await Promise.all([
      db.agencyProductIntelligence.update({
        where: { id: agencyIntelligence.id },
        data: { status: OpportunityStatus.ACTIONED },
      }),
      db.agencyIntelligenceEvent.create({
        data: {
          organizationId,
          agencyId: agencyIntelligence.agencyId,
          agencyProductIntelligenceId: agencyIntelligence.id,
          eventKey: `${agencyIntelligence.id}:WORKLIST_CREATED:${item.id}`,
          eventType: "WORKLIST_CREATED",
          inventoryState: agencyIntelligence.inventoryState,
          itemCode: agencyIntelligence.itemCode,
          opportunityState: agencyIntelligence.opportunityState,
          occurredAt: now,
          snapshot: { actorUserId: user.id, worklistItemId: item.id },
        },
      }),
    ]);
  }

  return { id: item.id, replay: false };
}
