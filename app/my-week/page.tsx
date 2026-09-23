export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { WorklistSource, WorklistStatus } from '@prisma/client';
import { buildPageMetadata } from '../../lib/appBrand';
import { getUserDisplayName, requireUser } from '../../lib/auth';
import { addDaysToDateInputValue, formatDateOnlyInputValue, formatEasternDateInputValue } from '../../lib/dateTime';
import { getOrganizationFeatures, requireOrganizationContext } from '../../lib/organizations';
import { prisma } from '../../lib/prisma';
import { getWorklistLocations } from '../../lib/worklistLocations';
import { isValidSchedulerDate, getSchedulerWeekDates } from '../../lib/myDayWeekScheduler';
import { WorklistScheduler } from './WorklistScheduler';
import { completeSchedulerWorklistItem, createSchedulerWorklistItem, updateSchedulerWorklistItem } from './actions';
import { WorkViewNavigation } from '../components/WorkViewNavigation';

export const metadata = buildPageMetadata('My Week');

const weekLabelFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export default async function MyWeekPage({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const currentUser = await requireUser();
  const { organizationId } = await requireOrganizationContext(currentUser);
  const enabledFeatures = await getOrganizationFeatures(organizationId);
  const params = (await searchParams) ?? {};
  const anchorDate = isValidSchedulerDate(params.date) ? params.date : formatEasternDateInputValue();
  const weekDates = getSchedulerWeekDates(anchorDate);
  const weekStart = weekDates[0];
  const nextWeekStart = addDaysToDateInputValue(weekDates[6], 1);
  const overdueCutoff = addDaysToDateInputValue(weekStart, -30);
  const actorName = getUserDisplayName(currentUser);
  const excludedIntelligenceSources: WorklistSource[] = [
    ...(!enabledFeatures.has('AGENCY_INTELLIGENCE') ? [WorklistSource.AGENCY_INTELLIGENCE] : []),
    ...(!enabledFeatures.has('WHOLESALE_OPPORTUNITIES') ? [WorklistSource.OPPORTUNITY_INTELLIGENCE] : []),
  ];

  const [items, users] = await Promise.all([
    prisma.worklistItem.findMany({
      where: {
        organizationId,
        ...(excludedIntelligenceSources.length ? { source: { notIn: excludedIntelligenceSources } } : {}),
        AND: [
          { OR: [{ assignedToUserId: currentUser.id }, { assignedTo: actorName }] },
          { status: { in: [WorklistStatus.OPEN, WorklistStatus.IN_PROGRESS] } },
          { OR: [
            { dueDate: null },
            { dueDate: { gte: new Date(`${overdueCutoff}T00:00:00.000Z`), lt: new Date(`${nextWeekStart}T00:00:00.000Z`) } },
          ] },
        ],
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { dueTimeMinutes: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 300,
      include: {
        loggedVisit: { select: { locationType: true, agencyId: true, wholesaleAccountId: true } },
        agencyProductIntelligence: { select: { itemCode: true, itemName: true } },
      },
    }),
    prisma.user.findMany({
      where: { organizationId, isActive: true, role: { notIn: ['TASTER', 'PLATFORM_ADMIN'] } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, email: true, firstName: true, lastName: true, name: true },
    }),
  ]);

  const locations = await getWorklistLocations(items);
  const agencyIds = [...new Set([...locations.values()].flatMap((location) => location?.type === 'agency' ? [location.id] : []))];
  const wholesaleIds = [...new Set([...locations.values()].flatMap((location) => location?.type === 'wholesale' ? [location.id] : []))];
  const targetOverlays = agencyIds.length || wholesaleIds.length
    ? await prisma.organizationAccountOverlay.findMany({
        where: {
          organizationId,
          isTargeting: true,
          OR: [
            { accountType: 'AGENCY', externalAccountId: { in: agencyIds } },
            { accountType: 'WHOLESALE', externalAccountId: { in: wholesaleIds } },
          ],
        },
        select: { accountType: true, externalAccountId: true },
      })
    : [];
  const targetedAccountKeys = new Set(targetOverlays.map((item) => `${item.accountType}:${item.externalAccountId}`));
  const schedulerItems = items.map((item) => {
    const location = locations.get(item.id);
    return {
      id: item.id,
      title: item.title,
      detail: item.detail,
      dueDate: item.dueDate ? formatDateOnlyInputValue(item.dueDate) : null,
      dueTimeMinutes: item.dueTimeMinutes,
      status: item.status,
      category: item.category,
      agencyId: item.agencyId,
      wholesaleAccountId: item.wholesaleAccountId,
      salesOpportunityId: item.salesOpportunityId,
      agencyProductIntelligenceId: item.agencyProductIntelligenceId,
      productItemCode: item.agencyProductIntelligence?.itemCode ?? null,
      productName: item.agencyProductIntelligence?.itemName ?? null,
      assignedToUserId: item.assignedToUserId,
      isTargeting: Boolean(location && targetedAccountKeys.has(`${location.type === 'agency' ? 'AGENCY' : 'WHOLESALE'}:${location.id}`)),
      location: location ? { id: location.id, name: location.name, type: location.type, href: location.href } : null,
    };
  });

  return <>
    <header className="page-heading page-header">
      <div>
        <span className="page-eyebrow">My work</span>
        <h1>My Week</h1>
        <p className="muted">Assigned to {actorName} for {weekLabelFormatter.format(new Date(`${weekStart}T12:00:00.000Z`))} – {weekLabelFormatter.format(new Date(`${weekDates[6]}T12:00:00.000Z`))}</p>
      </div>
    </header>
    <WorkViewNavigation active="week" showPursuing={enabledFeatures.has('WHOLESALE_OPPORTUNITIES')} />
    <WorklistScheduler
      anchorDate={anchorDate}
      completeAction={completeSchedulerWorklistItem}
      createAction={createSchedulerWorklistItem}
      currentUserId={currentUser.id}
      items={schedulerItems}
      updateAction={updateSchedulerWorklistItem}
      users={users.map((member) => ({ id: member.id, name: getUserDisplayName(member) }))}
      view="week"
    />
  </>;
}
