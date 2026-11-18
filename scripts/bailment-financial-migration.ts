import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { parseEnvironmentFile } from '../lib/environmentFile';

export const BAILMENT_MIGRATION = '20261118010000_bailment_financial_reports';
export const BAILMENT_MIGRATION_CHECKSUM = 'b729ee9e96c2c780ce296a30155de84095d8f93904a1a168235aa88870ed886f';
const sharedHost = 'ep-noisy-dew-avchokwr.c-11.us-east-1.aws.neon.tech';
const rehearsalHost = 'ep-late-scene-avs5lnse.c-11.us-east-1.aws.neon.tech';
const tables = ['OhlqBailmentReportPayload', 'OhlqBailmentReportRetrieval', 'OhlqBailmentReportState'];
const option = (args: string[], name: string) => {
  const values = args.filter(value => value.startsWith(`--${name}=`));
  if (values.length !== 1) throw Error(`Provide exactly one --${name}.`);
  return values[0].slice(name.length + 3);
};

export function bailmentMigrationConfiguration(args: string[], contents: string) {
  if (args.some(value => !['--apply', '--rehearsal'].includes(value) && !/^--(?:env-file|expected-host|checksum)=.+$/.test(value))) throw Error('Unknown migration argument.');
  const host = option(args, 'expected-host'), file = option(args, 'env-file');
  const entries = parseEnvironmentFile(contents), config = Object.fromEntries(entries);
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'Duplicate environment keys.');
  const rehearsal = args.includes('--rehearsal');
  assert.equal(config.APP_ENV, 'test'); assert.equal(config.DATABASE_ENVIRONMENT, 'test');
  assert.equal(config.DATABASE_TARGET_ID, rehearsal ? 'bailment-storage-rehearsal' : 'neon-neat-tst');
  assert.equal(config.EXPECTED_DATABASE_HOST, host);
  const connection = new URL(config.DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(connection.protocol));
  assert.equal(connection.hostname, host);
  connection.hostname = connection.hostname.replace('-pooler.', '.');
  assert.equal(connection.hostname, rehearsal ? rehearsalHost : sharedHost, 'Only the reviewed TST endpoint is authorized.');
  assert.equal(connection.pathname, '/neondb'); assert.ok(connection.username && connection.password);
  assert.notEqual(connection.searchParams.get('sslmode'), 'disable');
  if (args.includes('--apply')) assert.equal(option(args, 'checksum'), BAILMENT_MIGRATION_CHECKSUM);
  return { connection, rehearsal, apply: args.includes('--apply'), file, host };
}

type Db = PrismaClient | Prisma.TransactionClient;
async function ledger(db: Db) {
  return db.$queryRaw<Array<{ checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT checksum,finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=${BAILMENT_MIGRATION}`;
}
async function protectedFingerprint(db: Db) {
  return db.$queryRaw<Array<{ ledger: string; organizations: string; sources: bigint; forecasts: bigint }>>`SELECT
    (SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text,'')) FROM "_prisma_migrations" m WHERE migration_name<>${BAILMENT_MIGRATION}) AS ledger,
    (SELECT md5(coalesce(jsonb_agg(jsonb_build_object('id',o.id,'settings',o.settings,'timezone',o.timezone,'active',o.active) ORDER BY o.id)::text,'')) FROM "Organization" o) AS organizations,
    (SELECT count(*) FROM "ProductionSourceImport") AS sources,
    (SELECT count(*) FROM "ProductionForecastSnapshot") AS forecasts`;
}

async function main() {
  const args = process.argv.slice(2);
  const context = bailmentMigrationConfiguration(args, readFileSync(path.resolve(option(args, 'env-file')), 'utf8'));
  const sql = readFileSync(path.join('prisma/migrations', BAILMENT_MIGRATION, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(sql).digest('hex'), BAILMENT_MIGRATION_CHECKSUM, 'Reviewed SQL changed.');
  const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
  assert.ok(statements.every(statement => /^(CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE) "(?:OhlqBailmentReport|bailment_)/.test(statement)), 'Only additive financial schema statements are permitted.');
  const db = new PrismaClient({ datasourceUrl: context.connection.toString() });
  try {
    const before = await protectedFingerprint(db);
    const outcome = await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout='15s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bailment-financial-migration'))`;
      const rows = await ledger(tx);
      if (rows.length) {
        assert.equal(rows.length, 1); assert.equal(rows[0].checksum, BAILMENT_MIGRATION_CHECKSUM);
        assert.ok(rows[0].finished_at); assert.equal(rows[0].rolled_back_at, null);
      }
      const present = await tx.$queryRaw<Array<{ name: string }>>`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename IN ('OhlqBailmentReportPayload','OhlqBailmentReportRetrieval','OhlqBailmentReportState') ORDER BY tablename`;
      assert.equal(present.length, rows.length ? 3 : 0, 'Financial schema/ledger drift must be reviewed.');
      if (rows.length || !context.apply) return { alreadyApplied: !!rows.length, applied: !!rows.length };
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      await tx.$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES (${randomUUID()},${BAILMENT_MIGRATION_CHECKSUM},${BAILMENT_MIGRATION},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`;
      return { alreadyApplied: false, applied: true };
    }, { timeout: 60000, maxWait: 20000 });
    assert.deepEqual(await protectedFingerprint(db), before, 'Existing source, forecast, organization or unrelated ledger changed.');
    console.log(JSON.stringify({ operation: 'bailment-financial-migration', migration: BAILMENT_MIGRATION, checksum: BAILMENT_MIGRATION_CHECKSUM, rehearsal: context.rehearsal, host: context.host, tables, ...outcome, protectedRecordsPreserved: true }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/bailment-financial-migration.ts')) main().catch(() => { console.error('Bailment financial migration failed; inspect target and reviewed schema before retrying.'); process.exitCode = 1; });
