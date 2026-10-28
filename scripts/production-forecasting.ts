import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { loadEnvironmentFile } from '../lib/environmentFile';

const argument = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const envFile = argument('env-file');
if (!envFile) throw new Error('Provide an explicit --env-file path.');
loadEnvironmentFile(path.resolve(envFile));
const rehearsal = process.argv.includes('--rehearsal');
if (rehearsal ? !process.env.DATABASE_TARGET_ID?.startsWith('forecast-rehearsal-') : process.env.APP_ENV !== 'test' || process.env.DATABASE_TARGET_ID !== 'neon-neat-tst') throw new Error('This command is restricted to verified neat-tst or an explicit forecast rehearsal branch.');
// Prisma's schema operations use a direct connection; never log its credential.
const connection = new URL(process.env.DATABASE_URL!);
if (rehearsal && connection.hostname !== process.env.EXPECTED_DATABASE_HOST) throw new Error('Rehearsal host does not match the explicitly configured disposable branch.');
if (!rehearsal && connection.hostname !== process.env.EXPECTED_DATABASE_HOST) throw new Error('Database host differs from verified TST environment identity.');
connection.hostname = connection.hostname.replace('-pooler.', '.');
process.env.DATABASE_URL = connection.toString();
if (!rehearsal) process.env.EXPECTED_DATABASE_HOST = connection.hostname;
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    const identity = await db.$queryRaw<{ database: string; server: string }[]>`SELECT current_database() AS database, version() AS server`;
    console.log(JSON.stringify({ target: process.env.DATABASE_TARGET_ID, host: connection.hostname, database: identity[0].database, rehearsal }));
    if (process.argv.includes('--apply-migration')) {
      const migration = '20261028010000_production_forecasting';
      const sql = readFileSync(path.join(process.cwd(), 'prisma/migrations', migration, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('production-forecast-migration'))`;
        const previous = await tx.$queryRaw<{ checksum: string; finished_at: Date | null }[]>`SELECT checksum, finished_at FROM "_prisma_migrations" WHERE migration_name=${migration} AND rolled_back_at IS NULL`;
        if (previous.length) { if (previous.length !== 1 || previous[0].checksum !== checksum || !previous[0].finished_at) throw new Error('Migration ledger mismatch. No unrelated migrations will be reconciled.'); return; }
        for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        await tx.$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES (${randomUUID()},${checksum},${migration},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`;
      }, { timeout: 60000 });
      console.log(JSON.stringify({ migration, checksum, appliedOrVerified: true }));
    }
    const organizationId = argument('organization');
    const bailmentFile = argument('bailment-file'), dcFile = argument('dc-file');
    if (bailmentFile || dcFile || process.argv.includes('--configure-ohio')) {
      if (!organizationId) throw new Error('Provide --organization for source imports.');
      const { importProductionSource, forecastAccess } = await import('../lib/productionForecasting/import');
      const { ohioSourceConfiguration } = await import('../lib/productionForecasting/sourceWorkflow');
      const { formatDateInputValue } = await import('../lib/dateTime');
      const { shift, validDay } = await import('../lib/productionForecasting/model');
      const organization = await forecastAccess(db, organizationId), config = ohioSourceConfiguration(organization.settings);
      const today = formatDateInputValue(new Date(), organization.timezone);
      const historyStart = argument('history-start') ?? config.historyStart;
      const direct = argument('direct-invoices') ?? config.directInvoices;
      if (process.argv.includes('--configure-ohio')) {
        if (!historyStart || !validDay(historyStart) || historyStart > shift(today, -1) || !['invoice-date', 'shipment-only'].includes(direct ?? '')) throw new Error('A confirmed history start and direct invoice policy are required.');
        const configuration = JSON.stringify({ historyStart, directInvoices: direct });
        await db.$executeRaw`UPDATE "Organization" SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{productionForecasting}', COALESCE(settings->'productionForecasting','{}'::jsonb) || jsonb_build_object('ohio', ${configuration}::jsonb), true) WHERE id=${organizationId}`;
        console.log(JSON.stringify({ sourceConfiguration: 'saved', organizationId, historyStart, directInvoices: direct }));
      }
      if (bailmentFile) {
        if (!historyStart || !validDay(historyStart) || !['invoice-date', 'shipment-only'].includes(direct ?? '')) throw new Error('Full Bailment import requires a confirmed --history-start and --direct-invoices policy.');
        const result = await importProductionSource(readFileSync(path.resolve(bailmentFile), 'utf8'), { organizationId, market: 'OH', source: 'BAILMENT_PO_INVOICE', start: historyStart, end: shift(today, -1), observedOn: today, complete: true, nativeHistory: { fullPortfolio: true, directInvoices: direct as 'invoice-date' | 'shipment-only' } }, db);
        console.log(JSON.stringify({ source: 'BAILMENT_PO_INVOICE', ...result }));
      }
      if (dcFile) console.log(JSON.stringify({ source: 'DISTRIBUTION_CENTER', ...await importProductionSource(readFileSync(path.resolve(dcFile), 'utf8'), { organizationId, market: 'OH', source: 'DISTRIBUTION_CENTER', start: today, end: today, observedOn: today, complete: true }, db) }));
    }
    if (process.argv.includes('--refresh')) {
      if (!organizationId) throw new Error('Provide --organization for refresh.');
      const { refreshProductionForecast } = await import('../lib/productionForecasting/service');
      console.log(JSON.stringify(await refreshProductionForecast(organizationId, db)));
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Production forecasting operation failed; no credentials or source rows are logged.'); process.exitCode = 1; });
