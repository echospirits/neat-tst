import { assertSideEffectEnabled, validateRuntimeEnvironment } from '../lib/appEnvironment';
import { loadLocalEnvironmentFile } from '../lib/environmentFile';
import { discoverProductsForOrganizations } from '../lib/organizationProductDiscovery';
import { prisma } from '../lib/prisma';

async function main() {
  loadLocalEnvironmentFile('.env.local');
  loadLocalEnvironmentFile('.env');
  const index = process.argv.indexOf('--environment');
  const environment = index >= 0 ? process.argv[index + 1] : undefined;
  if (!environment || !['production', 'test'].includes(environment)) throw new Error('Pass --environment test or --environment production.');
  const runtime = validateRuntimeEnvironment();
  if (runtime.appEnvironment !== environment) throw new Error('Requested environment does not match APP_ENV.');
  assertSideEffectEnabled('ohlqImport');
  console.log(JSON.stringify(await discoverProductsForOrganizations()));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
