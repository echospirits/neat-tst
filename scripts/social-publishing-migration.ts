import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseEnvironmentFile } from '../lib/environmentFile';

export const SOCIAL_MIGRATIONS = [
  { name: '20261112170000_social_publishing_pilot', checksum: '0c2d2112f280c563da8e9f00538959e91884758ba42a8bd34d81153e3dcbb160' },
  { name: '20261112180000_social_workflow_dispatch', checksum: '6a250d31328b0876254477ccad876e072b80223633f6116ff8cf7ea0739bfee8' },
] as const;
export const SOCIAL_TST_HOST = 'ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech';
const protectedEndpoints = ['ep-proud-recipe-amosj8m9', 'ep-noisy-dew-avchokwr', 'ep-dry-bird-avmcqwk5'];
const directHost = (host: string) => host.replace('-pooler.', '.');

export function socialMigrationConfiguration(args: readonly string[], contents: string) {
  const permitted = ['--apply', '--rehearsal'];
  if (args.some(value => !permitted.includes(value) && !/^--(?:env-file|expected-host|expected-target|checksums)=.+$/.test(value))) throw Error('Unknown or malformed social migration argument.');
  const read = (name: string) => {
    const matches = args.filter(value => value.startsWith(`--${name}=`));
    if (matches.length > 1) throw Error('Duplicate migration arguments are forbidden.');
    return matches[0]?.slice(name.length + 3);
  };
  const file = read('env-file'), host = read('expected-host'), target = read('expected-target');
  if (!file || !host || !target) throw Error('Provide explicit env-file, expected-host and expected-target.');
  const entries = parseEnvironmentFile(contents), env = Object.fromEntries(entries);
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw Error('Duplicate environment keys are forbidden.');
  const rehearsal = args.includes('--rehearsal');
  if (rehearsal ? target !== 'social-rehearsal' || protectedEndpoints.some(value => host.includes(value)) : target !== 'neon-neat-tst' || host !== SOCIAL_TST_HOST) throw Error('Only verified shared TST or an explicit isolated social rehearsal is allowed. Production is forbidden.');
  const environment = rehearsal ? 'development' : 'test';
  if (env.APP_ENV !== environment || env.DATABASE_ENVIRONMENT !== environment || env.DATABASE_TARGET_ID !== target || env.EXPECTED_DATABASE_HOST !== host || !host.endsWith('.neon.tech')) throw Error('Migration resource labels do not match the exact reviewed target.');
  const pooled = new URL(env.DATABASE_URL), direct = new URL(env.DIRECT_URL || env.DATABASE_URL);
  direct.hostname = directHost(direct.hostname);
  if (!['postgres:', 'postgresql:'].includes(pooled.protocol) || !['postgres:', 'postgresql:'].includes(direct.protocol) || pooled.hostname !== host || direct.hostname !== directHost(host) || !pooled.username || !pooled.password || direct.username !== pooled.username || direct.password !== pooled.password || direct.pathname !== pooled.pathname || pooled.searchParams.get('sslmode') === 'disable' || direct.searchParams.get('sslmode') === 'disable') throw Error('Matching secured pooled/direct database identities are required.');
  const apply = args.includes('--apply');
  const checksums = read('checksums');
  const expected = SOCIAL_MIGRATIONS.map(migration => migration.checksum).join(',');
  if (apply && (checksums !== expected || SOCIAL_MIGRATIONS.some(migration => !/^[0-9a-f]{64}$/.test(migration.checksum)))) throw Error('Writes require both exact independently reviewed migration checksums.');
  if (checksums && checksums !== expected) throw Error('Unexpected social migration checksum.');
  return { env, direct, host, target, environment, rehearsal, apply };
}

export function socialMigrationStatements(sql: string, migration: typeof SOCIAL_MIGRATIONS[number]) {
  const normalized = sql.replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), migration.checksum, 'Migration SQL differs from the exact independently reviewed LF-normalized bytes.');
  const statements = normalized.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
  assert.ok(statements.length && statements.every(statement => /^(?:CREATE TABLE "Social|CREATE (?:UNIQUE )?INDEX "Social|ALTER TABLE "Social)/.test(statement)), 'Only additive Social table/index/constraint statements are permitted.');
  assert.ok(!statements.some(statement => /\b(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/.test(statement.replace(/ON (?:UPDATE|DELETE) (?:CASCADE|RESTRICT|SET NULL|NO ACTION)/g, ''))), 'Destructive/data-changing SQL is not part of these additive migrations.');
  return statements;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find(value => value.startsWith('--env-file='))?.slice(11);
  if (!file) throw Error('An explicit ignored environment file is required.');
  const configuration = socialMigrationConfiguration(args, readFileSync(file, 'utf8'));
  const db = new PrismaClient({ datasourceUrl: configuration.direct.toString() });
  const migrationNames = SOCIAL_MIGRATIONS.map(migration => migration.name);
  const protectedTables = ['Organization', 'User', 'LoggedVisit', 'WorklistItem', 'SupplyOrder', 'SupplyNeed', 'TastingEvent'];
  const snapshot = async () => {
    const counts = Object.fromEntries(await Promise.all(protectedTables.map(async table => {
      const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*)::bigint AS count FROM "${table}"`);
      return [table, String(rows[0].count)];
    })));
    const otherLedger = await db.$queryRaw<Array<{ id: string; migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT id,migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name NOT IN (${migrationNames[0]},${migrationNames[1]}) ORDER BY id`;
    return { counts, otherMigrationFingerprint: createHash('sha256').update(JSON.stringify(otherLedger)).digest('hex') };
  };
  try {
    const before = await snapshot();
    const results: Array<{ name: string; state: string; checksum: string }> = [];
    for (const migration of SOCIAL_MIGRATIONS) {
      const sql = readFileSync(path.join('prisma', 'migrations', migration.name, 'migration.sql'), 'utf8');
      const statements = socialMigrationStatements(sql, migration);
      const ledger = await db.$queryRaw<Array<{ checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=${migration.name}`;
      assert.ok(ledger.length <= 1 && ledger.every(value => value.checksum === migration.checksum && value.finished_at && !value.rolled_back_at), 'Own migration ledger differs, is partial or was rolled back. No drift is reconciled.');
      if (!ledger.length && configuration.apply) {
        await db.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('social-publishing-migration',0))`;
          const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM _prisma_migrations WHERE migration_name=${migration.name}`;
          assert.equal(duplicate.length, 0, 'Another operator applied this migration. Re-run read-only checks.');
          for (const statement of statements) await tx.$executeRawUnsafe(statement);
          await tx.$executeRaw`INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES (${randomUUID()},${migration.checksum},NOW(),${migration.name},NOW(),1)`;
        }, { timeout: 60_000 });
      }
      results.push({ name: migration.name, state: ledger.length || configuration.apply ? 'applied' : 'pending', checksum: migration.checksum });
    }
    const after = await snapshot();
    assert.deepEqual(after, before, 'Protected existing records or unrelated migration history changed.');
    if (results.every(value => value.state === 'applied')) {
      const constraints = await db.$queryRaw<Array<{ validated: boolean }>>`SELECT convalidated AS validated FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relname LIKE 'Social%')`;
      assert.ok(constraints.length >= 20 && constraints.every(value => value.validated), 'Social constraints must exist and be validated.');
      const workflow = await db.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='SocialDelivery' AND column_name='workflowRunId'`;
      assert.equal(workflow.length, 1, 'Workflow dispatch persistence must exist.');
    }
    console.log(JSON.stringify({ target: configuration.target, environment: configuration.environment, rehearsal: configuration.rehearsal, apply: configuration.apply, migrations: results, protectedRecordsUnchanged: true, unrelatedMigrationHistoryUnchanged: true }));
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/social-publishing-migration.ts')) {
  main().catch(error => {
    const message = (error instanceof Error ? error.message : 'Unknown social migration failure.').replace(/postgres(?:ql)?:\/\/[^\s"'`]+/g, '[redacted database URL]');
    console.error(message.slice(0, 2000)); process.exitCode = 1;
  });
}
