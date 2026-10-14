import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { validateRuntimeEnvironment } from '../lib/appEnvironment';
import { wholesaleCityRepairSql } from '../lib/wholesaleCityRepair';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const argument = (name: string) => args[args.indexOf(name) + 1];
const expectedEnvironment = args.includes('--environment') ? argument('--environment') : '';
const output = args.includes('--evidence') ? argument('--evidence') : '';
if (!['test', 'production'].includes(expectedEnvironment)) throw new Error('Pass --environment test or production.');
if (apply && !output) throw new Error('Apply requires --evidence <local JSON path> for recovery values.');

if (args.includes('--print-sql')) {
  console.log(wholesaleCityRepairSql(apply));
} else {
  const runtime = validateRuntimeEnvironment();
  if (runtime.appEnvironment !== expectedEnvironment) throw new Error('Requested environment does not match APP_ENV.');
  const expectedTarget = expectedEnvironment === 'test' ? 'neon-neat-tst' : 'ohlq-field-crm';
  if (process.env.DATABASE_TARGET_ID !== expectedTarget) throw new Error('Unexpected database target.');
  const db = new PrismaClient();
  db.$transaction(async (tx) => {
      const [{ repair }] = await tx.$queryRawUnsafe<Array<{ repair: { accounts: unknown[]; jobs: unknown[]; retryAccounts: number } }>>(wholesaleCityRepairSql(apply));
      if (output) writeFileSync(path.resolve(output), JSON.stringify({ environment: expectedEnvironment, requestedApply: apply, ...repair }, null, 2), { flag: 'wx' });
      return repair;
    }, { timeout: 60000 }).then((repair) => {
      console.log(JSON.stringify({ applied: apply, accounts: repair.accounts.length, attempts: repair.jobs.length, retryAccounts: repair.retryAccounts }));
    }).catch(() => {
      console.error('City repair failed; the database transaction was rolled back.');
      process.exitCode = 1;
    }).finally(() => db.$disconnect());
}
