export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { AlertStatus, MenuPlacementStatus, TargetOpportunityStatus, WorklistStatus } from '@prisma/client';
import Link from 'next/link';
import { requireUser } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

const toNumber = (value: unknown) => Number(value ?? 0);

export default async function TargetAccountabilityDashboard() {
  await requireUser();
  const now = new Date();
  const last30Days = new Date(now);
  last30Days.setUTCDate(last30Days.getUTCDate() - 30);
  const activeStatuses = [WorklistStatus.OPEN, WorklistStatus.IN_PROGRESS];

  const [
    aTierAccounts,
    targetProfiles,
    openOpportunities,
    wonOpportunities,
    openHeatLossAlerts,
    livePlacements,
    stalePlacements,
  ] = await Promise.all([
    prisma.targetAccountProfile.findMany({
      where: { currentPriorityTier: 'A' },
      select: { wholesaleAccountId: true },
    }),
    prisma.targetAccountProfile.findMany({
      select: {
        currentPriorityTier: true,
        currentScore: true,
        existingBuyer: true,
        expansionScore: true,
        wholesaleAccountId: true,
      },
      take: 5000,
    }),
    prisma.targetSkuOpportunity.count({
      where: { status: { in: [TargetOpportunityStatus.OPEN, TargetOpportunityStatus.IN_PROGRESS] } },
    }),
    prisma.targetSkuOpportunity.count({ where: { status: TargetOpportunityStatus.WON } }),
    prisma.targetHeatLossAlert.count({ where: { status: AlertStatus.OPEN } }),
    prisma.menuPlacement.count({ where: { status: MenuPlacementStatus.LIVE } }),
    prisma.menuPlacement.count({
      where: {
        status: MenuPlacementStatus.LIVE,
        OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: last30Days } }],
      },
    }),
  ]);
  const aTierIds = aTierAccounts.map((profile) => profile.wholesaleAccountId);
  const [aTierVisits, aTierOpenWorklist] = await Promise.all([
    prisma.loggedVisit.groupBy({
      by: ['wholesaleAccountId'],
      where: {
        locationType: 'wholesale',
        wholesaleAccountId: { in: aTierIds },
        visitAt: { gte: last30Days },
      },
      _count: { _all: true },
    }),
    prisma.worklistItem.findMany({
      where: {
        wholesaleAccountId: { in: aTierIds },
        status: { in: activeStatuses },
      },
      select: { wholesaleAccountId: true },
    }),
  ]);
  const aTierWithNextActions = new Set(aTierOpenWorklist.map((item) => item.wholesaleAccountId).filter(Boolean));
  const tierCounts = targetProfiles.reduce<Record<string, number>>((counts, profile) => {
    const tier = profile.currentPriorityTier ?? 'Unscored';
    counts[tier] = (counts[tier] ?? 0) + 1;
    return counts;
  }, {});
  const existingExpansionAccounts = targetProfiles.filter(
    (profile) => profile.existingBuyer && toNumber(profile.expansionScore) >= 75,
  ).length;
  const highScoreProspects = targetProfiles.filter(
    (profile) => !profile.existingBuyer && toNumber(profile.currentScore) >= 90,
  ).length;
  const targetAccountIds = targetProfiles.map((profile) => profile.wholesaleAccountId);
  const [completedFollowUps, openFollowUps] = await Promise.all([
    prisma.worklistItem.count({
      where: {
        wholesaleAccountId: { in: targetAccountIds },
        status: WorklistStatus.COMPLETED,
        completedAt: { gte: last30Days },
      },
    }),
    prisma.worklistItem.count({
      where: {
        wholesaleAccountId: { in: targetAccountIds },
        status: { in: activeStatuses },
      },
    }),
  ]);

  return (
    <>
      <div className="page-actions">
        <Link href="/targets">Back to target queue</Link>
      </div>

      <h1>Target Accountability Dashboard</h1>
      <p className="muted">
        Performance view for target-account progress, expansion, follow-through, and heat-loss risk.
      </p>

      <div className="grid performance-grid">
        <div className="card metric-card">
          <h3>A-tier contacted</h3>
          <p className="metric-value">{aTierVisits.length}</p>
          <p className="muted metric-caption">Unique A-tier accounts with visits in 30 days</p>
        </div>
        <div className="card metric-card">
          <h3>A-tier without next action</h3>
          <p className="metric-value">{Math.max(aTierAccounts.length - aTierWithNextActions.size, 0)}</p>
          <p className="muted metric-caption">Primary heat-loss indicator</p>
        </div>
        <div className="card metric-card">
          <h3>Open opportunities</h3>
          <p className="metric-value">{openOpportunities}</p>
          <p className="muted metric-caption">Model-generated opportunities still active</p>
        </div>
        <div className="card metric-card">
          <h3>Won opportunities</h3>
          <p className="metric-value">{wonOpportunities}</p>
          <p className="muted metric-caption">Converted target opportunities</p>
        </div>
        <div className="card metric-card">
          <h3>Existing expansion</h3>
          <p className="metric-value">{existingExpansionAccounts}</p>
          <p className="muted metric-caption">Existing buyers with expansion score 75+</p>
        </div>
        <div className="card metric-card">
          <h3>High-score prospects</h3>
          <p className="metric-value">{highScoreProspects}</p>
          <p className="muted metric-caption">Prospects scoring 90+</p>
        </div>
        <div className="card metric-card">
          <h3>Follow-up completion</h3>
          <p className="metric-value">
            {completedFollowUps}/{completedFollowUps + openFollowUps}
          </p>
          <p className="muted metric-caption">Real target-account worklist items completed in last 30 days vs active</p>
        </div>
        <div className="card metric-card">
          <h3>Heat-loss alerts</h3>
          <p className="metric-value">{openHeatLossAlerts}</p>
          <p className="muted metric-caption">Open model alerts</p>
        </div>
        <div className="card metric-card">
          <h3>Placement retention</h3>
          <p className="metric-value">
            {Math.max(livePlacements - stalePlacements, 0)}/{livePlacements}
          </p>
          <p className="muted metric-caption">Live placements verified within 30 days</p>
        </div>
      </div>

      <section className="dashboard-section">
        <div className="section-heading">
          <h2>Activity by Priority Tier</h2>
        </div>
        <div className="card">
          <div className="tier-bar-list">
            {Object.entries(tierCounts)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([tier, count]) => (
                <div className="tier-bar-row" key={tier}>
                  <span>{tier}</span>
                  <strong>{count}</strong>
                </div>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}
