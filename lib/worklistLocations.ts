import type { PrismaClient, WorklistCategory } from '@prisma/client';
import { prisma } from './prisma';

type WorklistLocationItem = {
  id: string;
  category: WorklistCategory;
  agencyId: string | null;
  wholesaleAccountId: string | null;
  loggedVisit: {
    locationType: string;
    agencyId: string | null;
    wholesaleAccountId: string | null;
  } | null;
};

export type WorklistLocationReference = {
  id: string;
  type: 'agency' | 'wholesale';
};

export type WorklistLocation = WorklistLocationReference & {
  href: string;
  name: string;
};

export function getWorklistLocationReference(
  item: Omit<WorklistLocationItem, 'id'>,
): WorklistLocationReference | null {
  if (item.category === 'AGENCY' && item.agencyId) {
    return { id: item.agencyId, type: 'agency' };
  }

  if (item.category === 'WHOLESALE' && item.wholesaleAccountId) {
    return { id: item.wholesaleAccountId, type: 'wholesale' };
  }

  if (item.agencyId) {
    return { id: item.agencyId, type: 'agency' };
  }

  if (item.wholesaleAccountId) {
    return { id: item.wholesaleAccountId, type: 'wholesale' };
  }

  if (item.loggedVisit?.locationType === 'agency' && item.loggedVisit.agencyId) {
    return { id: item.loggedVisit.agencyId, type: 'agency' };
  }

  if (item.loggedVisit?.locationType === 'wholesale' && item.loggedVisit.wholesaleAccountId) {
    return { id: item.loggedVisit.wholesaleAccountId, type: 'wholesale' };
  }

  if (item.loggedVisit?.agencyId) {
    return { id: item.loggedVisit.agencyId, type: 'agency' };
  }

  if (item.loggedVisit?.wholesaleAccountId) {
    return { id: item.loggedVisit.wholesaleAccountId, type: 'wholesale' };
  }

  return null;
}

export async function getWorklistLocations(
  items: WorklistLocationItem[],
  db: PrismaClient = prisma,
): Promise<Map<string, WorklistLocation>> {
  const references = new Map(
    items.map((item) => [item.id, getWorklistLocationReference(item)] as const),
  );
  const agencyIds = Array.from(
    new Set(
      Array.from(references.values())
        .filter((reference) => reference?.type === 'agency')
        .map((reference) => reference!.id),
    ),
  );
  const wholesaleAccountIds = Array.from(
    new Set(
      Array.from(references.values())
        .filter((reference) => reference?.type === 'wholesale')
        .map((reference) => reference!.id),
    ),
  );

  const [agencies, wholesaleAccounts] = await Promise.all([
    agencyIds.length
      ? db.agency.findMany({
          where: {
            OR: [{ id: { in: agencyIds } }, { agencyId: { in: agencyIds } }],
          },
          select: { id: true, agencyId: true, name: true },
        })
      : [],
    wholesaleAccountIds.length
      ? db.wholesaleAccount.findMany({
          where: { id: { in: wholesaleAccountIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const agencyByReference = new Map(
    agencies.flatMap((agency) => [
      [agency.id, agency] as const,
      [agency.agencyId, agency] as const,
    ]),
  );
  const wholesaleById = new Map(wholesaleAccounts.map((account) => [account.id, account] as const));
  const locations = new Map<string, WorklistLocation>();

  references.forEach((reference, itemId) => {
    if (!reference) return;

    if (reference.type === 'agency') {
      const agency = agencyByReference.get(reference.id);
      if (agency) {
        locations.set(itemId, {
          ...reference,
          href: `/agencies/${agency.id}`,
          name: agency.name,
        });
      }
      return;
    }

    const account = wholesaleById.get(reference.id);
    if (account) {
      locations.set(itemId, {
        ...reference,
        href: `/wholesale/${account.id}`,
        name: account.name,
      });
    }
  });

  return locations;
}
