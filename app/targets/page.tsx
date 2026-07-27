export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { TargetOpportunityStatus, UserRole, WorklistStatus, type Prisma } from '@prisma/client';
import Link from 'next/link';
import { getUserDisplayName, requireUser } from '../../lib/auth';
import { formatEasternDate } from '../../lib/dateTime';
import { prisma } from '../../lib/prisma';
import { LiveFilterForm } from '../components/LiveFilterForm';

const toNumber = (value: unknown) => Number(value ?? 0);

const activeWorklistStatuses = [WorklistStatus.COMPLETED, WorklistStatus.CANCELLED];

const hasResearchPending = (status: string | null) => !status || /pending|needs|queue|incomplete/i.test(status);

type TargetQueueParams = {
  assignedUserId?: string;
  buyer?: string;
  city?: string;
  county?: string;
  daysSinceLastActivity?: string;
  noNextAction?: string;
  opportunity?: string;
  ownershipGroupId?: string;
  researchStatus?: string;
  tier?: string;
  zip?: string;
};

export default async function TargetQueuePage({
  searchParams,
}: {
  searchParams?: Promise<TargetQueueParams>;
}) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const where: Prisma.TargetAccountProfileWhereInput = {};

  if (user.role !== UserRole.ADMIN) {
    where.OR = [{ assignedUserId: user.id }, { assignedUserId: null }];
  }

  if (params.assignedUserId && user.role === UserRole.ADMIN) {
    where.assignedUserId = params.assignedUserId;
  }

  if (params.tier) where.currentPriorityTier = params.tier;
  if (params.researchStatus) where.researchStatus = { contains: params.researchStatus, mode: 'insensitive' };
  if (params.ownershipGroupId) where.ownershipGroupId = params.ownershipGroupId;
  if (params.buyer === 'existing') where.existingBuyer = true;
  if (params.buyer === 'prospect') where.existingBuyer = false;

  const wholesaleWhere: Prisma.WholesaleAccountWhereInput = {};
  if (params.city) wholesaleWhere.city = { contains: params.city, mode: 'insensitive' };
  if (params.county) wholesaleWhere.county = { contains: params.county, mode: 'insensitive' };
  if (params.zip) wholesaleWhere.zip = { contains: params.zip, mode: 'insensitive' };
  if (params.opportunity) {
    wholesaleWhere.targetSkuOpportunities = {
      some: {
        category: { contains: params.opportunity, mode: 'insensitive' },
      },
    };
  }
  if (Object.keys(wholesaleWhere).length > 0) {
    where.wholesaleAccount = wholesaleWhere;
  }

  const [profiles, users, groups] = await Promise.all([
    prisma.targetAccountProfile.findMany({
      where,
      include: {
        assignedUser: true,
        ownershipGroup: true,
        wholesaleAccount: {
          select: {
            city: true,
            county: true,
            id: true,
            licenseeId: true,
            name: true,
            zip: true,
            targetSkuOpportunities: {
              where: { status: { in: [TargetOpportunityStatus.OPEN, TargetOpportunityStatus.IN_PROGRESS] } },
              orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
              take: 1,
            },
          },
        },
      },
      orderBy: [{ currentPriorityTier: 'asc' }, { currentScore: 'desc' }, { currentRank: 'asc' }],
      take: 600,
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: [{ name: 'asc' }, { email: 'asc' }] }),
    prisma.targetOwnershipGroup.findMany({ orderBy: [{ opportunityScore: 'desc' }, { name: 'asc' }], take: 250 }),
  ]);

  const wholesaleAccountIds = profiles.map((profile) => profile.wholesaleAccountId);
  const [worklistItems, visitStats] = await Promise.all([
    prisma.worklistItem.findMany({
      where: {
        status: { notIn: [...activeWorklistStatuses] },
        wholesaleAccountId: { in: wholesaleAccountIds },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.loggedVisit.groupBy({
      by: ['wholesaleAccountId'],
      where: {
        locationType: 'wholesale',
        wholesaleAccountId: { in: wholesaleAccountIds },
      },
      _max: { visitAt: true },
    }),
  ]);
  const worklistByAccount = new Map<string, (typeof worklistItems)[number]>();
  worklistItems.forEach((item) => {
    if (item.wholesaleAccountId && !worklistByAccount.has(item.wholesaleAccountId)) {
      worklistByAccount.set(item.wholesaleAccountId, item);
    }
  });
  const visitEntries = visitStats
    .map((stat) =>
      stat.wholesaleAccountId && stat._max.visitAt
        ? ([stat.wholesaleAccountId, stat._max.visitAt] as const)
        : null,
    )
    .filter((entry): entry is readonly [string, Date] => Boolean(entry));
  const lastVisitByAccount = new Map(visitEntries);
  const now = Date.now();
  const daysFilter = params.daysSinceLastActivity ? Number(params.daysSinceLastActivity) : null;
  const filteredProfiles = profiles
    .filter((profile) => {
      const worklistItem = worklistByAccount.get(profile.wholesaleAccountId);
      if (params.noNextAction === '1' && worklistItem) return false;

      if (daysFilter !== null && Number.isFinite(daysFilter)) {
        const lastVisitAt = lastVisitByAccount.get(profile.wholesaleAccountId);
        const days = lastVisitAt ? Math.floor((now - lastVisitAt.getTime()) / 86_400_000) : Number.POSITIVE_INFINITY;
        return days >= daysFilter;
      }

      return true;
    })
    .sort((left, right) => {
      const leftWorklist = worklistByAccount.get(left.wholesaleAccountId);
      const rightWorklist = worklistByAccount.get(right.wholesaleAccountId);
      const leftMissingAction = left.currentPriorityTier === 'A' && !leftWorklist ? 1 : 0;
      const rightMissingAction = right.currentPriorityTier === 'A' && !rightWorklist ? 1 : 0;
      const leftOpenOpp = left.wholesaleAccount.targetSkuOpportunities.length > 0 ? 1 : 0;
      const rightOpenOpp = right.wholesaleAccount.targetSkuOpportunities.length > 0 ? 1 : 0;
      const leftResearch = hasResearchPending(left.researchStatus) ? 1 : 0;
      const rightResearch = hasResearchPending(right.researchStatus) ? 1 : 0;

      return (
        rightMissingAction - leftMissingAction ||
        (left.currentPriorityTier ?? 'Z').localeCompare(right.currentPriorityTier ?? 'Z') ||
        rightOpenOpp - leftOpenOpp ||
        toNumber(right.currentScore) - toNumber(left.currentScore) ||
        rightResearch - leftResearch ||
        (left.currentRank ?? 99999) - (right.currentRank ?? 99999)
      );
    });

  return (
    <>
      <div className="page-actions">
        <Link className="btn compact-btn" href="/targets/dashboard">
          Accountability dashboard
        </Link>
      </div>

      <h1>Target Account Queue</h1>
      <p className="muted">
        Prioritized field queue from the Central Ohio scoring model, current CRM next actions, and account activity.
      </p>

      <details className="card compact-details filter-panel target-filter-panel">
        <summary>Filters</summary>
        <LiveFilterForm label="Filter target accounts" className="target-filter-form">
          {user.role === UserRole.ADMIN ? (
            <>
              <label>Assigned rep</label>
              <select name="assignedUserId" defaultValue={params.assignedUserId ?? ''}>
                <option value="">All reps</option>
                {users.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {getUserDisplayName(rep)}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <label>Priority tier</label>
          <select name="tier" defaultValue={params.tier ?? ''}>
            <option value="">All tiers</option>
            {['A', 'B', 'C', 'VERIFY', 'REVIEW', 'DO NOT TARGET', 'INTERNAL'].map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>

          <label>Ownership group</label>
          <select name="ownershipGroupId" defaultValue={params.ownershipGroupId ?? ''}>
            <option value="">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          <label>Buyer type</label>
          <select name="buyer" defaultValue={params.buyer ?? ''}>
            <option value="">Prospects and existing buyers</option>
            <option value="prospect">Prospects</option>
            <option value="existing">Existing buyers</option>
          </select>

          <label>City</label>
          <input name="city" defaultValue={params.city ?? ''} placeholder="Columbus" />
          <label>County</label>
          <input name="county" defaultValue={params.county ?? ''} placeholder="Franklin" />
          <label>ZIP</label>
          <input name="zip" defaultValue={params.zip ?? ''} placeholder="43215" />
          <label>Research status</label>
          <input name="researchStatus" defaultValue={params.researchStatus ?? ''} placeholder="Researched" />
          <label>Opportunity focus</label>
          <input name="opportunity" defaultValue={params.opportunity ?? ''} placeholder="Rum, Vodka, Whiskey" />
          <label>Days since last activity</label>
          <input name="daysSinceLastActivity" defaultValue={params.daysSinceLastActivity ?? ''} inputMode="numeric" />
          <label className="quick-chip target-checkbox">
            <input name="noNextAction" type="checkbox" value="1" defaultChecked={params.noNextAction === '1'} />
            No next action
          </label>
        </LiveFilterForm>
      </details>

      <div className="section-heading">
        <h2>Accounts</h2>
        <span className="pill">{filteredProfiles.length}</span>
      </div>

      <div className="target-card-list">
        {filteredProfiles.map((profile) => {
          const account = profile.wholesaleAccount;
          const opportunity = account.targetSkuOpportunities[0];
          const worklistItem = worklistByAccount.get(profile.wholesaleAccountId);
          const lastVisitAt = lastVisitByAccount.get(profile.wholesaleAccountId);

          return (
            <article className="card target-card" key={profile.id}>
              <div className="target-card-main">
                <div>
                  <div className="inline-meta">
                    <span className="pill">{profile.currentPriorityTier ?? 'Unscored'}</span>
                    {profile.existingBuyer ? <span className="pill">Existing buyer</span> : <span className="pill">Prospect</span>}
                    {profile.ownershipGroup ? <span className="pill">{profile.ownershipGroup.name}</span> : null}
                  </div>
                  <h2>
                    <Link href={`/wholesale/${profile.wholesaleAccountId}`}>{account.name}</Link>
                  </h2>
                  <p className="muted">
                    {account.licenseeId} · {[account.city, account.zip].filter(Boolean).join(' ')}
                  </p>
                </div>
                <div className="target-score">
                  <span>Score</span>
                  <strong>{toNumber(profile.currentScore).toFixed(1)}</strong>
                </div>
              </div>

              <p className="target-reason">{profile.reason}</p>

              <div className="target-card-grid">
                <div>
                  <span className="muted">Primary opportunity</span>
                  <strong>{profile.primaryOpportunity ?? opportunity?.category ?? 'Review account'}</strong>
                </div>
                <div>
                  <span className="muted">Opportunity focus</span>
                  <strong>{profile.primaryOpportunity ?? opportunity?.category ?? 'Review account'}</strong>
                </div>
                <div>
                  <span className="muted">Last activity</span>
                  <strong>{formatEasternDate(lastVisitAt) || 'No visits logged'}</strong>
                </div>
                <div>
                  <span className="muted">Assigned rep</span>
                  <strong>{profile.assignedUser ? getUserDisplayName(profile.assignedUser) : 'Unassigned'}</strong>
                </div>
              </div>

              <div className="target-next-action">
                <span className="muted">Next action</span>
                <strong>{worklistItem?.title ?? profile.recommendedNextAction ?? 'Set a next action'}</strong>
              </div>

              <div className="action-row">
                <Link className="btn compact-btn" href={`/visits/new?type=wholesale&wholesaleAccountId=${profile.wholesaleAccountId}`}>
                  Log visit
                </Link>
                <Link className="btn compact-btn secondary" href={`/wholesale/${profile.wholesaleAccountId}`}>
                  Open account
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
