import { GeocodeStatus } from '@prisma/client';
import { geocodeAddress, normalizeGeocodeAddress, type AddressParts } from '../lib/location/geocode';
import { prisma } from '../lib/prisma';

const getArgNumber = (name: string, fallback: number) => {
  const index = process.argv.indexOf(name);
  const parsed = Number(index >= 0 ? process.argv[index + 1] : NaN);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};
const limit = getArgNumber('--limit', 250);
const delayMs = getArgNumber('--delay-ms', 125);
const retryFailed = process.argv.includes('--retry-failed');
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function geocodeRecord(
  kind: 'agency' | 'wholesale',
  record: AddressParts & {
    geocodeStatus: GeocodeStatus;
    id: string;
    normalizedGeocodeAddress: string | null;
  },
) {
  const model = kind === 'agency' ? prisma.agency : prisma.wholesaleAccount;
  const normalizedAddress = normalizeGeocodeAddress(record);
  if (record.geocodeStatus === GeocodeStatus.SUCCESS && record.normalizedGeocodeAddress === normalizedAddress) {
    return 'unchanged';
  }

  try {
    const result = await geocodeAddress(record);
    await (model.update as Function)({
      where: { id: record.id },
      data: {
        geocodeError: null,
        geocodedAt: new Date(),
        geocodeStatus: GeocodeStatus.SUCCESS,
        latitude: result.latitude,
        longitude: result.longitude,
        normalizedGeocodeAddress: result.normalizedAddress,
      },
    });
    return 'success';
  } catch (error) {
    await (model.update as Function)({
      where: { id: record.id },
      data: {
        geocodeError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown geocoding error',
        geocodedAt: new Date(),
        geocodeStatus: GeocodeStatus.FAILED,
        latitude: null,
        longitude: null,
        normalizedGeocodeAddress: normalizedAddress || null,
      },
    });
    return 'failed';
  }
}

async function main() {
  if (!process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim()) {
    throw new Error('Set GOOGLE_MAPS_GEOCODING_API_KEY before running the geocode backfill.');
  }
  const statuses = retryFailed ? [GeocodeStatus.PENDING, GeocodeStatus.FAILED] : [GeocodeStatus.PENDING];
  const [agencies, wholesaleAccounts] = await Promise.all([
    prisma.agency.findMany({
      take: limit,
      where: { geocodeStatus: { in: statuses } },
      select: { id: true, address: true, city: true, state: true, zip: true, geocodeStatus: true, normalizedGeocodeAddress: true },
    }),
    prisma.wholesaleAccount.findMany({
      take: limit,
      where: { isActive: true, mergedIntoId: null, geocodeStatus: { in: statuses } },
      select: { id: true, address: true, city: true, state: true, zip: true, geocodeStatus: true, normalizedGeocodeAddress: true },
    }),
  ]);
  const summary = { attempted: 0, failed: 0, success: 0, unchanged: 0 };
  for (const [kind, records] of [['agency', agencies], ['wholesale', wholesaleAccounts]] as const) {
    for (const record of records) {
      const result = await geocodeRecord(kind, record);
      summary[result] += 1;
      summary.attempted += result === 'unchanged' ? 0 : 1;
      if (delayMs > 0) await wait(delayMs);
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().finally(() => prisma.$disconnect());

