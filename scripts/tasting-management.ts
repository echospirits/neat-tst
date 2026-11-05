import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseEnvironmentFile } from '../lib/environmentFile';

const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
export const TASTING_MIGRATION_NAME = '20261105020000_tasting_management';
export function tastingMigrationConfiguration() {
  const envFile = argument('env-file');
  const expectedHost = argument('expected-host');
  const expectedTarget = argument('expected-target');
  if (!envFile || !expectedHost || !expectedTarget) throw new Error('Provide explicit --env-file, --expected-host and --expected-target arguments.');
  const config = Object.fromEntries(parseEnvironmentFile(readFileSync(path.resolve(envFile), 'utf8')));
  if (config.APP_ENV === 'production' || config.DATABASE_ENVIRONMENT === 'production') throw new Error('Production is outside this feature-development command.');
  const rehearsal = process.argv.includes('--rehearsal');
  if (rehearsal ? !expectedTarget.startsWith('tasting-') || config.APP_ENV !== 'development' : expectedTarget !== 'neon-neat-tst' || config.APP_ENV !== 'test' || config.DATABASE_ENVIRONMENT !== 'test') throw new Error('Only an explicitly identified tasting rehearsal or neat-tst target is allowed.');
  if (config.DATABASE_TARGET_ID !== expectedTarget || config.EXPECTED_DATABASE_HOST !== expectedHost) throw new Error('The environment target identity does not match the command arguments.');
  const connection = new URL(config.DATABASE_URL);
  if (connection.hostname !== expectedHost || !connection.hostname.endsWith('.neon.tech')) throw new Error('Database host does not match the verified Neon target.');
  connection.hostname = connection.hostname.replace('-pooler.', '.');
  return { config, connection, rehearsal, target: expectedTarget, host: expectedHost };
}

async function main() {
  const context = tastingMigrationConfiguration();
  const sql = readFileSync(path.join(process.cwd(), 'prisma/migrations', TASTING_MIGRATION_NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(sql).digest('hex');
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ migration: TASTING_MIGRATION_NAME, checksum, target: context.target, host: context.host, rehearsal: context.rehearsal, applied: false }));
    return;
  }
  if (argument('checksum') !== checksum) throw new Error('Provide the exact reviewed migration --checksum.');
  const db = new PrismaClient({ datasourceUrl: context.connection.toString() });
  try {
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tasting-management-migration'))`;
      const identity = await tx.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
      const previous = await tx.$queryRaw<Array<{ checksum: string; finished_at: Date | null }>>`SELECT checksum, finished_at FROM "_prisma_migrations" WHERE migration_name=${TASTING_MIGRATION_NAME} AND rolled_back_at IS NULL`;
      if (previous.length) {
        if (previous.length !== 1 || previous[0].checksum !== checksum || !previous[0].finished_at) throw new Error('Own migration ledger mismatch. No unrelated drift will be reconciled.');
        return { database: identity[0].database, alreadyApplied: true };
      }
      const tables = await tx.$queryRaw<Array<{ name: string }>>`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename IN ('TastingEvent','TastingWorkflowEvent')`;
      if (tables.length) throw new Error('Tasting tables exist without the exact migration ledger receipt. Review manually.');
      // This reviewed migration has no procedural bodies or semicolons inside string literals.
      const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      await tx.$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES (${randomUUID()},${checksum},${TASTING_MIGRATION_NAME},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`;
      return { database: identity[0].database, alreadyApplied: false };
    }, { maxWait: 20_000, timeout: 60_000 });
    console.log(JSON.stringify({ migration: TASTING_MIGRATION_NAME, checksum, target: context.target, host: context.host, rehearsal: context.rehearsal, ...result, appliedOrVerified: true }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/tasting-management.ts')) main().catch(error => { console.error(error instanceof Error ? error.message : 'Tasting migration failed.'); process.exitCode = 1; });
