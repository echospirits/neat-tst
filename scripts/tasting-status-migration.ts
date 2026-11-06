import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { tastingMigrationConfiguration } from './tasting-management';

const migration = '20261106030000_tasting_status_override';
async function main() {
  const context = tastingMigrationConfiguration();
  const sql = readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8').replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(sql).digest('hex');
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ migration, checksum, target: context.target, host: context.host, rehearsal: context.rehearsal, applied: false }));
    return;
  }
  if (!process.argv.includes(`--checksum=${checksum}`)) throw new Error('Provide the exact reviewed migration --checksum.');
  const db = new PrismaClient({ datasourceUrl: context.connection.toString() });
  try {
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('tasting-management-migration'))`;
      const previous = await tx.$queryRaw<Array<{ checksum: string; finished_at: Date | null }>>`SELECT checksum, finished_at FROM "_prisma_migrations" WHERE migration_name=${migration} AND rolled_back_at IS NULL`;
      if (previous.length) {
        if (previous.length !== 1 || previous[0].checksum !== checksum || !previous[0].finished_at) throw new Error('Own migration ledger mismatch.');
        return { alreadyApplied: true };
      }
      const columns = await tx.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='TastingEvent' AND column_name='workflowStatusOverride'`;
      if (columns.length) throw new Error('Status column exists without this exact migration ledger receipt.');
      const before = await tx.tastingEvent.count();
      for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      if (await tx.tastingEvent.count() !== before) throw new Error('Unexpected tasting row count change.');
      await tx.$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES (${randomUUID()},${checksum},${migration},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`;
      return { alreadyApplied: false, existingTastingsPreserved: before };
    }, { maxWait: 20_000, timeout: 60_000 });
    console.log(JSON.stringify({ migration, checksum, target: context.target, host: context.host, rehearsal: context.rehearsal, ...result, appliedOrVerified: true }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Status migration failed.'); process.exitCode = 1; });
