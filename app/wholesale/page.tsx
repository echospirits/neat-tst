export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountType, Prisma, TargetOpportunityStatus } from '@prisma/client';
import { requireUser } from '../../lib/auth';
import { formatEasternDate } from '../../lib/dateTime';
import { prisma } from '../../lib/prisma';
import {
  formatWholesaleLicenseeIds,
  getPrimaryWholesaleLicenseeId,
  getWholesaleLicenseeIdConflictWhere,
  getWholesaleLicenseeIdCreateData,
  getWholesaleLicenseeIdTextSearchWhere,
  getWholesaleLicenseeIdValues,
  normalizeWholesaleLicenseeId,
  parseWholesaleLicenseeIds,
  syncWholesaleAccountLicenseeIds,
} from '../../lib/wholesaleAccounts';
import { LiveFilterForm } from '../components/LiveFilterForm';
import { TagBadges } from '../tags/TagBadges';
import { activateOfficialWholesaleAccount } from './actions';

type SortDirection = 'asc' | 'desc';

type WholesaleSortKey =
  | 'actions'
  | 'status'
  | 'licenseeIds'
  | 'name'
  | 'agencyId'
  | 'address'
  | 'city'
  | 'phone'
  | 'tags'
  | 'menuPlacements'
  | 'loggedVisits'
  | 'mostRecentVisit'
  | 'targetTier'
  | 'opportunityScore'
  | 'targetRank'
  | 'opportunityFocus'
  | 'buyerType'
  | 'researchStatus'
  | 'avgMonthly9L'
  | 'priceFitPercent'
  | 'etohioVolume9L';

type WholesalePageParams = {
  dir?: string;
  page?: string;
  q?: string;
  sort?: string;
  status?: string;
};

type WholesaleTableRow = {
  actionHref: string | null;
  actionLabel: string;
  address: string | null;
  agencyId: string | null;
  avgMonthly9L: number | null;
  buyerType: string | null;
  city: string | null;
  etohioVolume9L: number | null;
  id: string;
  isOfficialCandidate: boolean;
  licenseeIdsText: string | null;
  loggedVisits: number;
  menuPlacements: number;
  mostRecentVisit: Date | null;
  name: string;
  nameHref: string | null;
  opportunityFocus: string | null;
  opportunityScore: number | null;
  phone: string | null;
  priceFitPercent: number | null;
  researchStatus: string | null;
  statusLabel: string;
  tagText: string;
  tags: Array<{ color: string | null; id: string; name: string }>;
  targetRank: number | null;
  targetTier: string | null;
};

const MAX_WHOLESALE_ACCOUNT_ROWS = 5000;
const WHOLESALE_PAGE_SIZE = 300;

const wholesaleSortColumns: Array<{ key: WholesaleSortKey; label: string }> = [
  { key: 'actions', label: 'Actions' },
  { key: 'status', label: 'Status' },
  { key: 'licenseeIds', label: 'Licensee IDs' },
  { key: 'name', label: 'Name' },
  { key: 'agencyId', label: 'Agency ID' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'phone', label: 'Phone' },
  { key: 'tags', label: 'Tags' },
  { key: 'menuPlacements', label: 'Menu Placements' },
  { key: 'loggedVisits', label: 'Logged Visits' },
  { key: 'mostRecentVisit', label: 'Most Recent Visit' },
  { key: 'targetTier', label: 'Target Tier' },
  { key: 'opportunityScore', label: 'Opportunity Score' },
  { key: 'targetRank', label: 'Target Rank' },
  { key: 'opportunityFocus', label: 'Opportunity Focus' },
  { key: 'buyerType', label: 'Buyer Type' },
  { key: 'researchStatus', label: 'Research Status' },
  { key: 'avgMonthly9L', label: 'Avg 9L/Month' },
  { key: 'priceFitPercent', label: 'Price-Fit %' },
  { key: 'etohioVolume9L', label: 'ETOHIO 9L' },
];

const numericSortKeys = new Set<WholesaleSortKey>([
  'avgMonthly9L',
  'etohioVolume9L',
  'loggedVisits',
  'menuPlacements',
  'opportunityScore',
  'priceFitPercent',
  'targetRank',
  'targetTier',
]);

const descendingDefaultSortKeys = new Set<WholesaleSortKey>([
  'avgMonthly9L',
  'etohioVolume9L',
  'loggedVisits',
  'menuPlacements',
  'mostRecentVisit',
  'opportunityScore',
  'priceFitPercent',
]);

const targetTierRanks: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  VERIFY: 4,
  REVIEW: 5,
  'DO NOT TARGET': 6,
  INTERNAL: 7,
};

const toOptional = (value: string | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatMetric = (value: number | null, suffix = '') => (value === null ? 'n/a' : `${value.toFixed(1)}${suffix}`);

const isWholesaleSortKey = (value: string | undefined): value is WholesaleSortKey =>
  wholesaleSortColumns.some((column) => column.key === value);

const getDefaultSortDirection = (sortKey: WholesaleSortKey): SortDirection =>
  descendingDefaultSortKeys.has(sortKey) ? 'desc' : 'asc';

const getSortDirection = (value: string | undefined, sortKey: WholesaleSortKey): SortDirection =>
  value === 'asc' || value === 'desc' ? value : getDefaultSortDirection(sortKey);

const getNextSortDirection = (
  sortKey: WholesaleSortKey,
  currentSortKey: WholesaleSortKey,
  currentSortDirection: SortDirection,
) => (sortKey === currentSortKey ? (currentSortDirection === 'asc' ? 'desc' : 'asc') : getDefaultSortDirection(sortKey));

const buildSortHref = ({
  currentSortDirection,
  currentSortKey,
  params,
  sortKey,
}: {
  currentSortDirection: SortDirection;
  currentSortKey: WholesaleSortKey;
  params: WholesalePageParams;
  sortKey: WholesaleSortKey;
}) => {
  const query = new URLSearchParams();
  const q = (params.q ?? '').trim();
  const status = (params.status ?? '').trim();

  if (q) query.set('q', q);
  if (status) query.set('status', status);

  query.set('sort', sortKey);
  query.set('dir', getNextSortDirection(sortKey, currentSortKey, currentSortDirection));

  return `/wholesale?${query.toString()}`;
};

const buildPageHref = ({
  page,
  params,
  sortDirection,
  sortKey,
}: {
  page: number;
  params: WholesalePageParams;
  sortDirection: SortDirection;
  sortKey: WholesaleSortKey;
}) => {
  const query = new URLSearchParams();
  const q = (params.q ?? '').trim();
  const status = (params.status ?? '').trim();

  if (q) query.set('q', q);
  if (status) query.set('status', status);

  query.set('sort', sortKey);
  query.set('dir', sortDirection);
  query.set('page', String(page));

  return `/wholesale?${query.toString()}`;
};

function SortableHeader({
  currentSortDirection,
  currentSortKey,
  label,
  params,
  sortKey,
}: {
  currentSortDirection: SortDirection;
  currentSortKey: WholesaleSortKey;
  label: string;
  params: WholesalePageParams;
  sortKey: WholesaleSortKey;
}) {
  const isActive = sortKey === currentSortKey;

  return (
    <th aria-sort={isActive ? (currentSortDirection === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link
        aria-label={`Sort by ${label} ${getNextSortDirection(sortKey, currentSortKey, currentSortDirection)}`}
        className={isActive ? 'sort-link active' : 'sort-link'}
        href={buildSortHref({ currentSortDirection, currentSortKey, params, sortKey })}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="sort-indicator">
          {isActive ? (currentSortDirection === 'asc' ? '^' : 'v') : ''}
        </span>
      </Link>
    </th>
  );
}

const compareText = (left: string | null | undefined, right: string | null | undefined, direction: SortDirection) => {
  const leftText = (left ?? '').trim();
  const rightText = (right ?? '').trim();

  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;

  const result = leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
};

const compareNumber = (left: number | null | undefined, right: number | null | undefined, direction: SortDirection) => {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
  if (right === null || right === undefined) return -1;

  const result = left - right;
  return direction === 'asc' ? result : -result;
};

const compareDate = (left: Date | null, right: Date | null, direction: SortDirection) => {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const result = left.getTime() - right.getTime();
  return direction === 'asc' ? result : -result;
};

const getSortNumberValue = (row: WholesaleTableRow, sortKey: WholesaleSortKey) => {
  switch (sortKey) {
    case 'avgMonthly9L':
      return row.avgMonthly9L;
    case 'etohioVolume9L':
      return row.etohioVolume9L;
    case 'loggedVisits':
      return row.loggedVisits;
    case 'menuPlacements':
      return row.menuPlacements;
    case 'opportunityScore':
      return row.opportunityScore;
    case 'priceFitPercent':
      return row.priceFitPercent;
    case 'targetRank':
      return row.targetRank;
    case 'targetTier':
      return row.targetTier ? targetTierRanks[row.targetTier.toUpperCase()] ?? 99 : null;
    default:
      return null;
  }
};

const getSortTextValue = (row: WholesaleTableRow, sortKey: WholesaleSortKey) => {
  switch (sortKey) {
    case 'actions':
      return row.actionLabel;
    case 'agencyId':
      return row.agencyId;
    case 'address':
      return row.address;
    case 'buyerType':
      return row.buyerType;
    case 'city':
      return row.city;
    case 'licenseeIds':
      return row.licenseeIdsText;
    case 'name':
      return row.name;
    case 'opportunityFocus':
      return row.opportunityFocus;
    case 'phone':
      return row.phone;
    case 'researchStatus':
      return row.researchStatus;
    case 'status':
      return row.statusLabel;
    case 'tags':
      return row.tagText;
    default:
      return null;
  }
};

const sortWholesaleRows = (rows: WholesaleTableRow[], sortKey: WholesaleSortKey, direction: SortDirection) =>
  [...rows].sort((left, right) => {
    const primary =
      sortKey === 'mostRecentVisit'
        ? compareDate(left.mostRecentVisit, right.mostRecentVisit, direction)
        : numericSortKeys.has(sortKey)
          ? compareNumber(getSortNumberValue(left, sortKey), getSortNumberValue(right, sortKey), direction)
          : compareText(getSortTextValue(left, sortKey), getSortTextValue(right, sortKey), direction);

    return (
      primary ||
      compareText(left.name, right.name, 'asc') ||
      compareText(left.licenseeIdsText, right.licenseeIdsText, 'asc')
    );
  });

const getSelectedTagIds = (formData: FormData) =>
  Array.from(
    new Set(
      formData
        .getAll('tagId')
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  );

async function createWholesale(formData: FormData) {
  'use server';

  const user = await requireUser();
  const licenseeIds = parseWholesaleLicenseeIds(
    String(formData.get('licenseeIds') ?? formData.get('licenseeId') ?? ''),
  );
  const licenseeId = getPrimaryWholesaleLicenseeId(licenseeIds);
  const name = String(formData.get('name') ?? '').trim();

  if (!licenseeId || !name) {
    redirect('/wholesale?status=invalid');
  }

  const tagIds = getSelectedTagIds(formData);
  const matchingAccounts = await prisma.wholesaleAccount.findMany({
    where: getWholesaleLicenseeIdConflictWhere(licenseeIds),
    select: { id: true },
    take: 2,
  });
  const matchingAccountIds = Array.from(new Set(matchingAccounts.map((account) => account.id)));

  if (matchingAccountIds.length > 1) {
    redirect('/wholesale?status=duplicate-licensee');
  }

  const officialAccount = await prisma.account.findFirst({
    where: {
      licenseeId: { equals: licenseeId, mode: 'insensitive' },
      type: AccountType.BAR_RESTAURANT,
    },
    select: { id: true },
  });
  const accountData = {
    isActive: true,
    name,
    officialAccountId: officialAccount?.id,
    agencyId: toOptional(String(formData.get('agencyId') ?? '')),
    address: toOptional(String(formData.get('address') ?? '')),
    city: toOptional(String(formData.get('city') ?? '')),
    county: toOptional(String(formData.get('county') ?? '')),
    zip: toOptional(String(formData.get('zip') ?? '')),
    phone: toOptional(String(formData.get('phone') ?? '')),
    ownership: toOptional(String(formData.get('ownership') ?? '')),
    districtId: toOptional(String(formData.get('districtId') ?? '')),
    deliveryDay: toOptional(String(formData.get('deliveryDay') ?? '')),
  };
  const account = await prisma.$transaction(async (tx) => {
    const existingAccountId = matchingAccountIds[0];

    if (existingAccountId) {
      const updatedAccount = await tx.wholesaleAccount.update({
        where: { id: existingAccountId },
        data: {
          ...accountData,
          licenseeId,
        },
        select: { id: true },
      });
      await syncWholesaleAccountLicenseeIds(tx, updatedAccount.id, licenseeIds);
      return updatedAccount;
    }

    return tx.wholesaleAccount.create({
      data: {
        ...accountData,
        licenseeId,
        licenseeIds: { create: getWholesaleLicenseeIdCreateData(licenseeIds) },
        createdByUserId: user.id,
      },
      select: { id: true },
    });
  });

  if (tagIds.length > 0) {
    await prisma.locationTag.createMany({
      data: tagIds.map((tagId) => ({
        tagId,
        wholesaleAccountId: account.id,
        note: 'Applied from wholesale account form',
        createdByUserId: user.id,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath('/wholesale');
  revalidatePath('/tags');
  revalidatePath('/visits/new');
  redirect('/wholesale?status=saved');
}

const wholesaleSearchWhere = (q: string): Prisma.WholesaleAccountWhereInput => ({
  OR: [
    { name: { contains: q, mode: 'insensitive' } },
    ...getWholesaleLicenseeIdTextSearchWhere(q),
    { agencyId: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
    { tags: { some: { tag: { name: { contains: q, mode: 'insensitive' } } } } },
    { menuPlacements: { some: { product: { contains: q, mode: 'insensitive' } } } },
    { menuPlacements: { some: { menuItemName: { contains: q, mode: 'insensitive' } } } },
    { targetProfile: { is: { currentPriorityTier: { contains: q, mode: 'insensitive' } } } },
    { targetProfile: { is: { primaryOpportunity: { contains: q, mode: 'insensitive' } } } },
    { targetProfile: { is: { researchStatus: { contains: q, mode: 'insensitive' } } } },
    { targetSkuOpportunities: { some: { category: { contains: q, mode: 'insensitive' } } } },
  ],
});

const officialWholesaleSearchWhere = (q: string): Prisma.AccountWhereInput => ({
  licenseeId: { not: null },
  type: AccountType.BAR_RESTAURANT,
  OR: [
    { name: { contains: q, mode: 'insensitive' } },
    { licenseeId: { contains: q, mode: 'insensitive' } },
    { agencyRefId: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
    { city: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q, mode: 'insensitive' } },
  ],
});

export default async function WholesalePage({
  searchParams,
}: {
  searchParams?: Promise<WholesalePageParams>;
}) {
  await requireUser();

  const params = (await searchParams) ?? {};
  const q = (params.q ?? '').trim();
  const sortKey = isWholesaleSortKey(params.sort) ? params.sort : 'name';
  const sortDirection = getSortDirection(params.dir, sortKey);
  const requestedPage = Number.parseInt(params.page ?? '1', 10);
  const accountWhere: Prisma.WholesaleAccountWhereInput = {
    isActive: true,
    ...(q ? wholesaleSearchWhere(q) : {}),
  };

  const [accounts, tags, officialCandidates] = await Promise.all([
    prisma.wholesaleAccount.findMany({
      take: MAX_WHOLESALE_ACCOUNT_ROWS,
      where: accountWhere,
      include: {
        licenseeIds: {
          orderBy: [{ isPrimary: 'desc' }, { licenseeId: 'asc' }],
          select: { licenseeId: true },
        },
        tags: {
          include: { tag: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { menuPlacements: true },
        },
      },
      orderBy: [{ name: 'asc' }, { licenseeId: 'asc' }],
    }),
    prisma.tag.findMany({ orderBy: [{ name: 'asc' }] }),
    q
      ? prisma.account.findMany({
          where: officialWholesaleSearchWhere(q),
          orderBy: [{ name: 'asc' }, { licenseeId: 'asc' }],
          take: 40,
          select: {
            id: true,
            licenseeId: true,
            agencyRefId: true,
            name: true,
            address: true,
            city: true,
            phone: true,
          },
        })
      : [],
  ]);
  const candidateLicenseeIds = officialCandidates
    .map((account) => normalizeWholesaleLicenseeId(account.licenseeId))
    .filter(Boolean) as string[];
  const linkedWholesaleAccounts =
    candidateLicenseeIds.length > 0
      ? await prisma.wholesaleAccount.findMany({
          where: {
            OR: [
              ...candidateLicenseeIds.map((licenseeId) => ({
                licenseeId: { equals: licenseeId, mode: 'insensitive' as const },
              })),
              {
                licenseeIds: {
                  some: {
                    OR: candidateLicenseeIds.map((licenseeId) => ({
                      licenseeId: { equals: licenseeId, mode: 'insensitive' as const },
                    })),
                  },
                },
              },
            ],
          },
          select: {
            licenseeId: true,
            licenseeIds: { select: { licenseeId: true } },
          },
        })
      : [];
  const linkedLicenseeIds = new Set(
    linkedWholesaleAccounts.flatMap((account) => getWholesaleLicenseeIdValues(account)),
  );
  const officialAccounts = officialCandidates.filter((account) => {
    const licenseeId = normalizeWholesaleLicenseeId(account.licenseeId);
    return licenseeId && !linkedLicenseeIds.has(licenseeId);
  });
  const accountIds = accounts.map((account) => account.id);
  const [visitStats, targetProfiles, targetMetrics, targetOpportunities] =
    accountIds.length > 0
      ? await Promise.all([
          prisma.loggedVisit.groupBy({
            by: ['wholesaleAccountId'],
            where: {
              locationType: 'wholesale',
              wholesaleAccountId: { in: accountIds },
            },
            _count: { _all: true },
            _max: { visitAt: true },
          }),
          prisma.targetAccountProfile.findMany({
            where: { wholesaleAccountId: { in: accountIds } },
            select: {
              currentPriorityTier: true,
              currentRank: true,
              currentScore: true,
              existingBuyer: true,
              primaryOpportunity: true,
              researchStatus: true,
              wholesaleAccountId: true,
            },
          }),
          prisma.targetAccountMetric.findMany({
            where: { wholesaleAccountId: { in: accountIds } },
            orderBy: [{ wholesaleAccountId: 'asc' }, { periodEnd: 'desc' }],
            select: {
              avgMonthly9L: true,
              etohioVolume9L: true,
              priceFitPercent: true,
              wholesaleAccountId: true,
            },
          }),
          prisma.targetSkuOpportunity.findMany({
            where: {
              status: { in: [TargetOpportunityStatus.OPEN, TargetOpportunityStatus.IN_PROGRESS] },
              wholesaleAccountId: { in: accountIds },
            },
            orderBy: [{ wholesaleAccountId: 'asc' }, { score: 'desc' }, { updatedAt: 'desc' }],
            select: {
              category: true,
              score: true,
              wholesaleAccountId: true,
            },
          }),
        ])
      : [[], [], [], []];
  const visitStatMap = Object.fromEntries(
    visitStats.map((stat) => [
      stat.wholesaleAccountId ?? '',
      {
        count: stat._count._all,
        lastVisitAt: stat._max.visitAt,
      },
    ]),
  );
  const targetProfileMap = new Map(targetProfiles.map((profile) => [profile.wholesaleAccountId, profile]));
  const latestMetricMap = new Map<string, (typeof targetMetrics)[number]>();
  targetMetrics.forEach((metric) => {
    if (!latestMetricMap.has(metric.wholesaleAccountId)) {
      latestMetricMap.set(metric.wholesaleAccountId, metric);
    }
  });
  const topOpportunityMap = new Map<string, (typeof targetOpportunities)[number]>();
  targetOpportunities.forEach((opportunity) => {
    if (!topOpportunityMap.has(opportunity.wholesaleAccountId)) {
      topOpportunityMap.set(opportunity.wholesaleAccountId, opportunity);
    }
  });
  const activeRows: WholesaleTableRow[] = accounts.map((account) => {
    const stats = visitStatMap[account.id] ?? { count: 0, lastVisitAt: null };
    const metric = latestMetricMap.get(account.id) ?? null;
    const opportunity = topOpportunityMap.get(account.id) ?? null;
    const profile = targetProfileMap.get(account.id) ?? null;
    const tags = account.tags.map((assignment) => assignment.tag);

    return {
      actionHref: `/visits/new?type=wholesale&wholesaleAccountId=${account.id}`,
      actionLabel: 'Log visit',
      address: account.address,
      agencyId: account.agencyId,
      avgMonthly9L: toNullableNumber(metric?.avgMonthly9L),
      buyerType: profile ? (profile.existingBuyer ? 'Existing buyer' : 'Prospect') : null,
      city: account.city,
      etohioVolume9L: toNullableNumber(metric?.etohioVolume9L),
      id: account.id,
      isOfficialCandidate: false,
      licenseeIdsText: formatWholesaleLicenseeIds(account),
      loggedVisits: stats.count,
      menuPlacements: account._count.menuPlacements,
      mostRecentVisit: stats.lastVisitAt,
      name: account.name,
      nameHref: `/wholesale/${account.id}`,
      opportunityFocus: profile?.primaryOpportunity ?? opportunity?.category ?? null,
      opportunityScore: toNullableNumber(profile?.currentScore ?? opportunity?.score),
      phone: account.phone,
      priceFitPercent: toNullableNumber(metric?.priceFitPercent),
      researchStatus: profile?.researchStatus ?? null,
      statusLabel: 'Active',
      tagText: tags.map((tag) => tag.name).join(', '),
      tags,
      targetRank: profile?.currentRank ?? null,
      targetTier: profile?.currentPriorityTier ?? null,
    };
  });
  const officialRows: WholesaleTableRow[] = officialAccounts.map((account) => ({
    actionHref: null,
    actionLabel: 'Activate',
    address: account.address,
    agencyId: account.agencyRefId,
    avgMonthly9L: null,
    buyerType: null,
    city: account.city,
    etohioVolume9L: null,
    id: account.id,
    isOfficialCandidate: true,
    licenseeIdsText: account.licenseeId,
    loggedVisits: 0,
    menuPlacements: 0,
    mostRecentVisit: null,
    name: account.name,
    nameHref: null,
    opportunityFocus: null,
    opportunityScore: null,
    phone: account.phone,
    priceFitPercent: null,
    researchStatus: null,
    statusLabel: 'Official record - inactive',
    tagText: '',
    tags: [],
    targetRank: null,
    targetTier: null,
  }));
  const sortedRows = sortWholesaleRows([...activeRows, ...officialRows], sortKey, sortDirection);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / WHOLESALE_PAGE_SIZE));
  const currentPage = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages);
  const startIndex = (currentPage - 1) * WHOLESALE_PAGE_SIZE;
  const tableRows = sortedRows.slice(startIndex, startIndex + WHOLESALE_PAGE_SIZE);
  const firstRowNumber = sortedRows.length > 0 ? startIndex + 1 : 0;
  const lastRowNumber = Math.min(startIndex + WHOLESALE_PAGE_SIZE, sortedRows.length);

  return (
    <>
      <h1>Wholesale Accounts</h1>
      <p className="muted">Active accounts by default. Search also checks inactive official OHLQ records.</p>

      <LiveFilterForm className="filter-form narrow-filter" label="Filter wholesale accounts">
        <input name="q" defaultValue={q} placeholder="Filter name, licensee ID, menu placement, phone" />
        <input name="page" type="hidden" value="1" />
        <label>Sort by</label>
        <select name="sort" defaultValue={sortKey}>
          {wholesaleSortColumns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
        <label>Direction</label>
        <select name="dir" defaultValue={sortDirection}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </LiveFilterForm>
      {params.status === 'saved' ? <p className="pill">Wholesale account saved.</p> : null}
      {params.status === 'invalid' ? <p className="pill">Name and at least one Licensee ID are required.</p> : null}
      {params.status === 'duplicate-licensee' ? (
        <p className="pill">Those Licensee IDs are already split across multiple wholesale accounts.</p>
      ) : null}
      {params.status === 'invalid-official' ? <p className="pill">Select a valid official wholesale record.</p> : null}

      <details className="card compact-details admin-panel">
        <summary>Create non-official wholesale account</summary>
        <form action={createWholesale}>
          <div className="form-grid">
            <textarea name="licenseeIds" placeholder="Licensee IDs" required rows={3} />
            <input name="name" placeholder="Name" required />
            <input name="phone" placeholder="Phone" />
            <input name="city" placeholder="City" />
          </div>
          <details className="compact-details nested-details">
            <summary>More account details</summary>
            <div className="form-grid">
              <input name="agencyId" placeholder="Agency ID" />
              <input name="address" placeholder="Address" />
              <input name="county" placeholder="County" />
              <input name="zip" placeholder="Zip" />
              <input name="ownership" placeholder="Ownership" />
              <input name="districtId" placeholder="District ID" />
              <input name="deliveryDay" placeholder="Delivery Day" />
            </div>
          </details>
          {tags.length > 0 ? (
            <details className="compact-details nested-details">
              <summary>Tags</summary>
              <div className="tag-checkbox-grid">
                {tags.map((tag) => (
                  <label className="tag-checkbox" key={tag.id}>
                    <input name="tagId" type="checkbox" value={tag.id} />
                    <span className="tag-swatch" style={{ backgroundColor: tag.color ?? '#7c9cff' }} />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          <button type="submit">Save wholesale account</button>
        </form>
      </details>

      <div className="section-heading">
        <h2>Accounts</h2>
        <span className="pill">{sortedRows.length}</span>
        <span className="pill">
          {firstRowNumber}-{lastRowNumber}
        </span>
      </div>

      <div className="table-scroll wholesale-table-scroll">
        <table className="responsive-table">
          <thead>
            <tr>
              {wholesaleSortColumns.map((column) => (
                <SortableHeader
                  currentSortDirection={sortDirection}
                  currentSortKey={sortKey}
                  key={column.key}
                  label={column.label}
                  params={params}
                  sortKey={column.key}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr className={row.isOfficialCandidate ? 'inactive-official-row' : undefined} key={row.id}>
                <td data-label="Actions">
                  {row.actionHref ? (
                    <Link className="btn compact-btn" href={row.actionHref}>
                      {row.actionLabel}
                    </Link>
                  ) : (
                    <form action={activateOfficialWholesaleAccount}>
                      <input name="officialAccountId" type="hidden" value={row.id} />
                      <button className="compact-btn secondary" type="submit">
                        {row.actionLabel}
                      </button>
                    </form>
                  )}
                </td>
                <td data-label="Status">
                  <span className="pill">{row.statusLabel}</span>
                  {row.isOfficialCandidate ? <span className="muted tap-to-activate">Tap to activate</span> : null}
                </td>
                <td data-label="Licensee IDs">{row.licenseeIdsText}</td>
                <td data-label="Name">
                  {row.nameHref ? (
                    <Link className="table-link" href={row.nameHref}>
                      {row.name}
                    </Link>
                  ) : (
                    <form action={activateOfficialWholesaleAccount} className="inline-activate-form">
                      <input name="officialAccountId" type="hidden" value={row.id} />
                      <button className="link-button table-link" type="submit">
                        {row.name}
                      </button>
                    </form>
                  )}
                </td>
                <td data-label="Agency ID">{row.agencyId}</td>
                <td data-label="Address">{row.address}</td>
                <td data-label="City">{row.city}</td>
                <td data-label="Phone">{row.phone}</td>
                <td data-label="Tags">
                  <TagBadges tags={row.tags} emptyLabel={row.isOfficialCandidate ? 'Activate to tag' : 'No tags'} />
                </td>
                <td data-label="Menu Placements">{row.menuPlacements}</td>
                <td data-label="Logged Visits">{row.loggedVisits}</td>
                <td data-label="Most Recent Visit">{formatEasternDate(row.mostRecentVisit)}</td>
                <td data-label="Target Tier">
                  {row.targetTier ? <span className="pill">{row.targetTier}</span> : <span className="muted">Not scored</span>}
                </td>
                <td data-label="Opportunity Score">{formatMetric(row.opportunityScore)}</td>
                <td data-label="Target Rank">{row.targetRank ?? 'n/a'}</td>
                <td data-label="Opportunity Focus">{row.opportunityFocus ?? 'n/a'}</td>
                <td data-label="Buyer Type">{row.buyerType ?? 'n/a'}</td>
                <td data-label="Research Status">{row.researchStatus ?? 'n/a'}</td>
                <td data-label="Avg 9L/Month">{formatMetric(row.avgMonthly9L)}</td>
                <td data-label="Price-Fit %">{formatMetric(row.priceFitPercent, '%')}</td>
                <td data-label="ETOHIO 9L">{formatMetric(row.etohioVolume9L)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="pagination-row">
          {currentPage > 1 ? (
            <Link
              className="btn compact-btn secondary"
              href={buildPageHref({ page: currentPage - 1, params, sortDirection, sortKey })}
            >
              Previous
            </Link>
          ) : (
            <span className="pill">Previous</span>
          )}
          <span className="muted">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Link
              className="btn compact-btn secondary"
              href={buildPageHref({ page: currentPage + 1, params, sortDirection, sortKey })}
            >
              Next
            </Link>
          ) : (
            <span className="pill">Next</span>
          )}
        </div>
      ) : null}
      {q && sortedRows.length === 0 ? (
        <p className="muted activity-empty">No active or official wholesale accounts match that search.</p>
      ) : null}
    </>
  );
}
