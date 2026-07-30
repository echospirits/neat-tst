import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  getWholesaleLicenseeIdValues,
  isGeneratedWholesaleLicenseeId,
  parseWholesaleLicenseeIds,
  syncWholesaleAccountLicenseeIds,
} from './wholesaleAccounts';

export type MergeAccountValues = {
  address: string | null;
  agencyId: string | null;
  city: string | null;
  county: string | null;
  deliveryDay: string | null;
  districtId: string | null;
  licenseeId: string;
  licenseeIds: { licenseeId: string }[];
  name: string;
  ownership: string | null;
  phone: string | null;
  state: string | null;
  zip: string | null;
};

export type WholesaleMergeErrorCode =
  | 'already-merged'
  | 'invalid-source'
  | 'invalid-target'
  | 'same-account'
  | 'source-is-official'
  | 'target-has-target-data-conflict'
  | 'target-is-not-official';

export class WholesaleMergeError extends Error {
  constructor(public readonly code: WholesaleMergeErrorCode, message: string) {
    super(message);
    this.name = 'WholesaleMergeError';
  }
}

const preferDestinationValue = (destination: string | null, source: string | null) =>
  destination?.trim() ? destination : source;

export const getWholesaleMergeDestinationFallbacks = (
  source: MergeAccountValues,
  destination: MergeAccountValues,
) => ({
  address: preferDestinationValue(destination.address, source.address),
  agencyId: preferDestinationValue(destination.agencyId, source.agencyId),
  city: preferDestinationValue(destination.city, source.city),
  county: preferDestinationValue(destination.county, source.county),
  deliveryDay: preferDestinationValue(destination.deliveryDay, source.deliveryDay),
  districtId: preferDestinationValue(destination.districtId, source.districtId),
  ownership: preferDestinationValue(destination.ownership, source.ownership),
  phone: preferDestinationValue(destination.phone, source.phone),
  state: preferDestinationValue(destination.state, source.state) ?? 'OH',
  zip: preferDestinationValue(destination.zip, source.zip),
});

export const getWholesaleMergeLicenseeIds = (
  source: Pick<MergeAccountValues, 'licenseeId' | 'licenseeIds'>,
  destination: Pick<MergeAccountValues, 'licenseeId' | 'licenseeIds'>,
) => {
  const destinationIds = getWholesaleLicenseeIdValues(destination);
  const transferableSourceIds = getWholesaleLicenseeIdValues(source).filter(
    (licenseeId) => !isGeneratedWholesaleLicenseeId(licenseeId),
  );

  return parseWholesaleLicenseeIds([...destinationIds, ...transferableSourceIds].join('\n'));
};

const getTargetRecordCount = async (db: Prisma.TransactionClient | typeof prisma, wholesaleAccountId: string) => {
  const counts = await Promise.all([
    db.targetAccountProfile.count({ where: { wholesaleAccountId } }),
    db.targetAccountScoreHistory.count({ where: { wholesaleAccountId } }),
    db.targetAccountMetric.count({ where: { wholesaleAccountId } }),
    db.targetPublicResearch.count({ where: { wholesaleAccountId } }),
    db.targetSkuOpportunity.count({ where: { wholesaleAccountId } }),
    db.targetHeatLossAlert.count({ where: { wholesaleAccountId } }),
    db.targetChainMembership.count({ where: { wholesaleAccountId } }),
  ]);

  return counts.reduce((total, count) => total + count, 0);
};

const getAccountForMerge = (db: Prisma.TransactionClient | typeof prisma, id: string) =>
  db.wholesaleAccount.findUnique({
    where: { id },
    select: {
      address: true,
      agencyId: true,
      city: true,
      county: true,
      deliveryDay: true,
      districtId: true,
      id: true,
      isActive: true,
      licenseeId: true,
      licenseeIds: { select: { licenseeId: true } },
      mergedIntoId: true,
      name: true,
      officialAccountId: true,
      ohlqLastEchoPurchaseBottles: true,
      ohlqLastEchoPurchaseDate: true,
      ohlqLastEchoPurchaseItemCode: true,
      ohlqLastEchoPurchaseItemName: true,
      ohlqLastEchoPurchaseUpdatedAt: true,
      ownership: true,
      phone: true,
      state: true,
      zip: true,
    },
  });

export async function getWholesaleAccountMergePreview(sourceId: string, targetId: string) {
  const [source, target] = await Promise.all([
    getAccountForMerge(prisma, sourceId),
    getAccountForMerge(prisma, targetId),
  ]);

  if (!source) throw new WholesaleMergeError('invalid-source', 'The manual account no longer exists.');
  if (!target) throw new WholesaleMergeError('invalid-target', 'The official account no longer exists.');
  if (sourceId === targetId) throw new WholesaleMergeError('same-account', 'Choose two different accounts.');
  assertMergeSource(source);
  assertMergeTarget(target);

  const [
    visits,
    worklistItems,
    contacts,
    tags,
    menuPlacements,
    recipeSuggestions,
    sourceTargetRecords,
    targetTargetRecords,
  ] = await Promise.all([
    prisma.loggedVisit.count({ where: { wholesaleAccountId: sourceId } }),
    prisma.worklistItem.count({ where: { wholesaleAccountId: sourceId } }),
    prisma.locationContact.count({ where: { wholesaleAccountId: sourceId } }),
    prisma.locationTag.count({ where: { wholesaleAccountId: sourceId } }),
    prisma.menuPlacement.count({ where: { wholesaleAccountId: sourceId } }),
    prisma.recipeSuggestion.count({ where: { wholesaleAccountId: sourceId } }),
    getTargetRecordCount(prisma, sourceId),
    getTargetRecordCount(prisma, targetId),
  ]);

  const blockers =
    sourceTargetRecords > 0 && targetTargetRecords > 0
      ? ['Both accounts contain target intelligence. Resolve that data before merging.']
      : [];

  return {
    blockers,
    counts: {
      contacts,
      menuPlacements,
      recipeSuggestions,
      tags,
      targetRecords: sourceTargetRecords,
      visits,
      worklistItems,
    },
    destinationFallbacks: getWholesaleMergeDestinationFallbacks(source, target),
    licenseeIds: getWholesaleMergeLicenseeIds(source, target),
    source,
    target,
  };
}

type MergeAccountRecord = NonNullable<Awaited<ReturnType<typeof getAccountForMerge>>>;

function assertMergeSource(
  source: Awaited<ReturnType<typeof getAccountForMerge>>,
): asserts source is MergeAccountRecord {
  if (!source) throw new WholesaleMergeError('invalid-source', 'The manual account no longer exists.');
  if (source.mergedIntoId) {
    throw new WholesaleMergeError('already-merged', 'The manual account was already merged.');
  }
  if (source.officialAccountId) {
    throw new WholesaleMergeError('source-is-official', 'The source must be a non-official account.');
  }
}

function assertMergeTarget(
  target: Awaited<ReturnType<typeof getAccountForMerge>>,
): asserts target is MergeAccountRecord {
  if (!target) throw new WholesaleMergeError('invalid-target', 'The official account no longer exists.');
  if (!target.officialAccountId || target.mergedIntoId || !target.isActive) {
    throw new WholesaleMergeError('target-is-not-official', 'The destination must be an active official account.');
  }
}

export async function mergeWholesaleAccounts({
  mergedByUserId,
  sourceId,
  targetId,
}: {
  mergedByUserId: string;
  sourceId: string;
  targetId: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const [source, target] = await Promise.all([
        getAccountForMerge(tx, sourceId),
        getAccountForMerge(tx, targetId),
      ]);
      if (sourceId === targetId) {
        throw new WholesaleMergeError('same-account', 'Choose two different accounts.');
      }
      assertMergeSource(source);
      assertMergeTarget(target);

      const [sourceTargetRecords, targetTargetRecords] = await Promise.all([
        getTargetRecordCount(tx, sourceId),
        getTargetRecordCount(tx, targetId),
      ]);
      if (sourceTargetRecords > 0 && targetTargetRecords > 0) {
        throw new WholesaleMergeError(
          'target-has-target-data-conflict',
          'Both accounts contain target intelligence.',
        );
      }

      const targetTagIds = (
        await tx.locationTag.findMany({
          where: { wholesaleAccountId: targetId },
          select: { tagId: true },
        })
      ).map(({ tagId }) => tagId);
      const targetRecipeIds = (
        await tx.recipeSuggestion.findMany({
          where: { wholesaleAccountId: targetId },
          select: { recipeId: true },
        })
      ).map(({ recipeId }) => recipeId);

      if (targetTagIds.length > 0) {
        await tx.locationTag.deleteMany({
          where: { wholesaleAccountId: sourceId, tagId: { in: targetTagIds } },
        });
      }
      if (targetRecipeIds.length > 0) {
        await tx.recipeSuggestion.deleteMany({
          where: { wholesaleAccountId: sourceId, recipeId: { in: targetRecipeIds } },
        });
      }

      await tx.loggedVisit.updateMany({
        where: { wholesaleAccountId: sourceId },
        data: { wholesaleAccountId: targetId },
      });
      await tx.worklistItem.updateMany({
        where: { wholesaleAccountId: sourceId },
        data: { wholesaleAccountId: targetId },
      });
      await tx.locationContact.updateMany({
        where: { wholesaleAccountId: sourceId },
        data: { wholesaleAccountId: targetId },
      });
      await tx.locationTag.updateMany({
        where: { wholesaleAccountId: sourceId },
        data: { wholesaleAccountId: targetId },
      });
      await tx.menuPlacement.updateMany({
        where: { wholesaleAccountId: sourceId },
        data: { wholesaleAccountId: targetId },
      });
      await tx.recipeSuggestion.updateMany({
        where: { wholesaleAccountId: sourceId },
        data: { wholesaleAccountId: targetId },
      });

      if (sourceTargetRecords > 0) {
        await tx.targetAccountProfile.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetAccountScoreHistory.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetAccountMetric.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetPublicResearch.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetSkuOpportunity.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetHeatLossAlert.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetChainMembership.updateMany({
          where: { wholesaleAccountId: sourceId },
          data: { wholesaleAccountId: targetId },
        });
        await tx.targetOwnershipGroup.updateMany({
          where: { bestEntryWholesaleAccountId: sourceId },
          data: { bestEntryWholesaleAccountId: targetId },
        });
      }

      const licenseeIds = getWholesaleMergeLicenseeIds(source, target);
      const sourceLicenseeIds = getWholesaleLicenseeIdValues(source);
      const destinationFallbacks = getWholesaleMergeDestinationFallbacks(source, target);
      const sourceHasNewerEchoPurchase =
        source.ohlqLastEchoPurchaseDate &&
        (!target.ohlqLastEchoPurchaseDate || source.ohlqLastEchoPurchaseDate > target.ohlqLastEchoPurchaseDate);

      await tx.wholesaleAccount.update({
        where: { id: sourceId },
        data: {
          isActive: false,
          licenseeId: `merged-${sourceId}`,
          mergeSnapshot: {
            address: source.address,
            agencyId: source.agencyId,
            city: source.city,
            county: source.county,
            deliveryDay: source.deliveryDay,
            districtId: source.districtId,
            licenseeIds: sourceLicenseeIds,
            name: source.name,
            officialAccountId: source.officialAccountId,
            ownership: source.ownership,
            phone: source.phone,
            state: source.state,
            zip: source.zip,
          },
          mergedAt: new Date(),
          mergedByUserId,
          mergedIntoId: targetId,
        },
      });
      await tx.wholesaleLicenseeId.deleteMany({ where: { wholesaleAccountId: sourceId } });
      await syncWholesaleAccountLicenseeIds(tx, targetId, licenseeIds);
      await tx.wholesaleAccount.update({
        where: { id: targetId },
        data: {
          ...destinationFallbacks,
          isActive: true,
          ...(sourceHasNewerEchoPurchase
            ? {
                ohlqLastEchoPurchaseBottles: source.ohlqLastEchoPurchaseBottles,
                ohlqLastEchoPurchaseDate: source.ohlqLastEchoPurchaseDate,
                ohlqLastEchoPurchaseItemCode: source.ohlqLastEchoPurchaseItemCode,
                ohlqLastEchoPurchaseItemName: source.ohlqLastEchoPurchaseItemName,
                ohlqLastEchoPurchaseUpdatedAt: source.ohlqLastEchoPurchaseUpdatedAt,
              }
            : {}),
        },
      });

      return { sourceId, targetId };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
