import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { updateWholesaleAccountFromAccountMaster } from '../lib/ohlqAccountMasterPersistence';
import type { AccountMasterRow } from '../lib/ohlqAccountMasterImport';

// Opt-in database verification. Only temporary tables are written, in a
// transaction that is always rolled back. Never run an OHLQ import here.
const databaseUrl = process.env.WHOLESALE_IMPORT_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set WHOLESALE_IMPORT_TEST_DATABASE_URL to the verified neat-tst database.');
const target = new URL(databaseUrl);
assert.ok(['ep-noisy-dew-avchokwr.c-11.us-east-1.aws.neon.tech', 'ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech'].includes(target.hostname), 'Expected the verified neat-tst database host.');
assert.equal(target.pathname, '/neondb');
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const rollback = new Error('Temporary-table verification complete: roll back.');
let checks = 0;
const row: AccountMasterRow = {
  licenseeId: 'fixture', name: 'New official name', dba: null, address: '99 Official Rd', city: 'Official City',
  zip: '49999', state: 'OH', agencyId: '25', county: 'New county', deliveryDay: 'Tuesday',
  districtId: '4', ownership: 'New owner', phone: '614-555-0100',
};
type Values = { id: string; name: string; address: string | null; city: string | null; zip: string | null;
  addressImportProtected: boolean; cityImportProtected: boolean; zipImportProtected: boolean;
  isActive: boolean; latitude: number | null; geocodeStatus: string; ownership: string | null };

async function main() {
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Account" (LIKE public."Account" INCLUDING DEFAULTS) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "WholesaleAccount" (LIKE public."WholesaleAccount" INCLUDING DEFAULTS) ON COMMIT DROP');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO pg_temp, public');
      await tx.$executeRawUnsafe('ALTER TABLE "WholesaleAccount" DROP COLUMN IF EXISTS "addressImportProtected", DROP COLUMN IF EXISTS "cityImportProtected", DROP COLUMN IF EXISTS "zipImportProtected"');
      const tables = await tx.$queryRaw<Array<{ relname: string; relpersistence: string }>>`
        SELECT relname, relpersistence FROM pg_class WHERE oid IN (to_regclass('"Account"'), to_regclass('"WholesaleAccount"'))`;
      assert.equal(tables.length, 2);
      assert.ok(tables.every(table => table.relpersistence === 't'));
      checks++;
      await tx.$executeRaw`
        INSERT INTO "Account" (id, type, name, address, city, zip, "updatedAt")
        VALUES ('raw', 'BAR_RESTAURANT', 'Official name', '1 Official St', 'Columbus', '43215', CURRENT_TIMESTAMP)`;
      for (const [id, address, city, zip, officialId, createdBy, merged] of [
        ['legacy', '10 Public St', 'Columbus', null, 'raw', null, null],
        ['same', '1 Official St', 'Columbus', '43215', 'raw', null, null],
        ['manual', '20 Public St', null, '43000', null, 'fixture-user', null],
        ['merged', '30 Old St', 'Old city', '40000', 'raw', null, 'same'],
      ]) {
        await tx.$executeRaw`
          INSERT INTO "WholesaleAccount" (id, "licenseeId", name, address, city, zip, "officialAccountId", "createdByUserId", "mergedIntoId", "isActive", latitude, longitude, "geocodeStatus", "updatedAt")
          VALUES (${id}, ${id}, 'Public name', ${address}, ${city}, ${zip}, ${officialId}, ${createdBy}, ${merged}, false, 40, -83, 'SUCCESS', CURRENT_TIMESTAMP)`;
      }
      const migration = readFileSync('prisma/migrations/20261010160000_wholesale_address_import_protection/migration.sql', 'utf8');
      for (const statement of migration.replace(/--[^\n]*/g, '').split(';').map(value => value.trim()).filter(Boolean)) {
        if (statement === 'BEGIN' || statement === 'COMMIT') continue;
        await tx.$executeRawUnsafe(statement);
      }
      const get = async (id: string) => (await tx.$queryRaw<Values[]>`SELECT * FROM "WholesaleAccount" WHERE id = ${id}`)[0];
      let legacy = await get('legacy');
      assert.equal(legacy.addressImportProtected, true); assert.equal(legacy.cityImportProtected, false);
      assert.equal(legacy.zipImportProtected, true); assert.equal(legacy.address, '10 Public St');
      assert.equal(legacy.zip, null); assert.equal(legacy.latitude, 40); checks++;
      const same = await get('same');
      assert.equal(same.addressImportProtected, false); assert.equal(same.cityImportProtected, false); assert.equal(same.zipImportProtected, false); checks++;
      const manual = await get('manual');
      assert.equal(manual.addressImportProtected, true); assert.equal(manual.cityImportProtected, false); assert.equal(manual.zipImportProtected, true); checks++;
      assert.equal((await get('merged')).addressImportProtected, false); checks++;
      await updateWholesaleAccountFromAccountMaster(tx, 'legacy', row, 'raw');
      legacy = await get('legacy');
      assert.equal(legacy.name, 'Public name'); assert.equal(legacy.isActive, true);
      assert.equal(legacy.address, '10 Public St'); assert.equal(legacy.zip, null); assert.equal(legacy.city, 'Official City');
      assert.equal(legacy.ownership, 'New owner'); assert.equal(legacy.latitude, null); assert.equal(legacy.geocodeStatus, 'PENDING'); checks++;
      await tx.$executeRaw`UPDATE "WholesaleAccount" SET latitude = 40, longitude = -83, "geocodeStatus" = 'SUCCESS' WHERE id = 'legacy'`;
      await updateWholesaleAccountFromAccountMaster(tx, 'legacy', { ...row, name: 'Another official name', address: '101 Changed Rd', zip: '43333' }, 'raw');
      legacy = await get('legacy');
      assert.equal(legacy.name, 'Public name'); assert.equal(legacy.address, '10 Public St'); assert.equal(legacy.zip, null);
      assert.equal(legacy.latitude, 40); assert.equal(legacy.geocodeStatus, 'SUCCESS'); checks++;
      await updateWholesaleAccountFromAccountMaster(tx, 'same', row, 'raw');
      const refreshed = await get('same');
      assert.equal(refreshed.name, 'Public name'); assert.equal(refreshed.address, row.address); assert.equal(refreshed.city, row.city); assert.equal(refreshed.zip, row.zip); checks++;
      await tx.$executeRaw`UPDATE "WholesaleAccount" SET latitude = 40, longitude = -83, "geocodeStatus" = 'SUCCESS' WHERE id = 'same'`;
      await updateWholesaleAccountFromAccountMaster(tx, 'same', { ...row, address: '99 official rd.', city: 'official city' }, 'raw');
      assert.equal((await get('same')).latitude, 40); checks++;
      await updateWholesaleAccountFromAccountMaster(tx, 'same', { ...row, address: null, city: null, zip: null, phone: null, ownership: null }, 'raw');
      assert.equal((await get('same')).address, '99 official rd.'); assert.equal((await get('same')).ownership, row.ownership); checks++;
      // Save after preflight, then exercise the real parameterized persistence.
      await tx.$executeRaw`UPDATE "WholesaleAccount" SET name = 'Later manual rename', address = NULL, "addressImportProtected" = true WHERE id = 'same'`;
      await updateWholesaleAccountFromAccountMaster(tx, 'same', row, 'raw');
      assert.equal((await get('same')).name, 'Later manual rename'); assert.equal((await get('same')).address, null); checks++;
      await assert.rejects(updateWholesaleAccountFromAccountMaster(tx, 'merged', row, 'raw'), /changed during Account Master import/); checks++;
      const raw = await tx.$queryRaw<Array<{ address: string }>>`SELECT address FROM "Account" WHERE id = 'raw'`;
      assert.equal(raw[0].address, '1 Official St'); checks++;
      throw rollback;
    }, { timeout: 60_000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
  console.log(JSON.stringify({ checks, temporaryTablesOnly: true, transactionRolledBack: true, databaseTarget: 'neon-neat-tst' }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; });
