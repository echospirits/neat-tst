import { assertSideEffectEnabled, validateRuntimeEnvironment } from '../lib/appEnvironment';
import { loadLocalEnvironmentFile } from '../lib/environmentFile';
import { syncProductionSources } from '../lib/productionForecasting/sourceWorkflow';
import { prisma } from '../lib/prisma';
const arg = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? '' : ''; };
async function main() {
  loadLocalEnvironmentFile('.env.local'); loadLocalEnvironmentFile('.env');
  const environment = arg('--environment'), runtime = validateRuntimeEnvironment();
  if (!['test', 'production'].includes(environment) || runtime.appEnvironment !== environment || !process.argv.includes('--apply')) throw new Error('Pass --environment matching APP_ENV and --apply.');
  assertSideEffectEnabled('ohlqImport');
  console.log(JSON.stringify(await syncProductionSources()));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Production source sync failed.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
