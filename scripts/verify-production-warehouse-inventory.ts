import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { validateRuntimeEnvironment } from '../lib/appEnvironment';

/** TST-only acceptance. Writes only forecasting inventory/current-demand observations/checks;
 * never imports sales, shared inventory or product configuration. */
async function main() {
  const runtime = validateRuntimeEnvironment();
  if (runtime.appEnvironment !== 'test' || process.env.DATABASE_TARGET_ID !== 'neon-neat-tst'
    || process.env.GITHUB_REPOSITORY !== 'echospirits/neat-tst' || process.env.GITHUB_REF !== 'refs/heads/tst') throw new Error('target');
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp || !path.isAbsolute(runnerTemp)) throw new Error('storage');
  const temporaryRoot = path.resolve(runnerTemp);
  const directory = mkdtempSync(path.join(temporaryRoot, 'neat-dc-inventory-'));
  if (!directory.startsWith(`${temporaryRoot}${path.sep}`)) throw new Error('storage');
  const { PrismaClient } = await import('@prisma/client');
  const { ECHO_ORGANIZATION_ID } = await import('../lib/echoAccess');
  const { forecastAccess } = await import('../lib/productionForecasting/import');
  const { getOrganizationOhlqCredentials } = await import('../lib/ohlqTenantCredentials');
  const { downloadOhlqDcInventory, downloadOhlqCurrentDemand } = await import('../lib/ohlqAnnualSalesReport');
  const { ingestDcInventory } = await import('../lib/productionForecasting/operationalSignals/dcInventoryIngestion');
  const { currentDemandProducts, getCurrentDemandSignals, ingestCurrentDemand } = await import('../lib/productionForecasting/operationalSignals/demandIngestion');
  const { calculateCurrentDemand } = await import('../lib/productionForecasting/operationalSignals/demand');
  const { getWarehouseBalanceSignals } = await import('../lib/productionForecasting/operationalSignals/warehouseBalance');
  const { formatDateInputValue } = await import('../lib/dateTime');
  const db = new PrismaClient();
  let phase = 'access';
  try {
    const organization = await forecastAccess(db, ECHO_ORGANIZATION_ID);
    const credentials = await getOrganizationOhlqCredentials(ECHO_ORGANIZATION_ID, db);
    if (!credentials || !organization.enabledStates.includes('OH')) throw new Error('credentials');
    const today = formatDateInputValue(new Date(), organization.timezone);
    phase = 'download';
    const download = await downloadOhlqDcInventory({ headless: true, returnBuffer: true, partnerCredentials: credentials,
      reportDate: today, downloadDir: path.join(directory, 'downloads'), debugDir: path.join(directory, 'screenshots'),
      useServerlessChromium: false, logger: { log: () => undefined, error: () => undefined },
      onDiagnostic: diagnostic => console.log(JSON.stringify({ source: 'DC_INVENTORY', phase: diagnostic.stage,
        ...Object.fromEntries(['frame', 'fromDateControls', 'vendorControls', 'brandControls', 'renderError'].flatMap(key => typeof diagnostic[key] === 'number' || typeof diagnostic[key] === 'boolean' ? [[key, diagnostic[key]]] : [])),
      })),
    });
    if (!download.csvBuffer) throw new Error('empty-export');
    phase = 'ingest';
    const now = new Date();
    const result = await ingestDcInventory({ organizationId: ECHO_ORGANIZATION_ID, businessDate: today, db, now,
      download: { status: 'ok', csv: download.csvBuffer.toString('utf8'), reportDate: download.reportDate, observedAt: now.toISOString() } });
    phase = 'demand-scope';
    const demandStartedAt = new Date(), demandDay = formatDateInputValue(demandStartedAt, organization.timezone);
    const [products, previousDemand] = await Promise.all([
      currentDemandProducts(ECHO_ORGANIZATION_ID, db), getCurrentDemandSignals(ECHO_ORGANIZATION_ID, db, demandStartedAt),
    ]);
    const completed = new Set(previousDemand.rows.filter(row => row.status === 'AVAILABLE' && !row.stale && row.businessDate === demandDay && row.sourceFreshness === 'CURRENT').map(row => row.productId));
    const pending = products.filter(product => !completed.has(product.id));
    let demandResult = { available: 0, unavailable: 0, failed: 0, reused: completed.size };
    let demandInvalidResponses = 0;
    if (pending.length) {
      phase = 'demand-download';
      const demandDownload = await downloadOhlqCurrentDemand({ headless: true, partnerCredentials: credentials, itemCodes: pending.map(product => product.code),
        downloadDir: path.join(directory, 'current-demand', 'downloads'), debugDir: path.join(directory, 'current-demand', 'screenshots'),
        useServerlessChromium: false, logger: { log: () => undefined, error: () => undefined },
      });
      const malformed = new Set(['INVALID_RESPONSE', 'INCOMPLETE_SOURCE', 'MISSING_CASE_PACK', 'MISSING_QUANTITY', 'INVALID_QUANTITY', 'CONFLICTING_AGENCY_ROWS']);
      for (const product of pending) {
        const responses = demandDownload.products.filter(response => response.itemCode === product.code);
        const response = responses[0];
        if (responses.length !== 1 || !response || response.status === 'failed') { demandInvalidResponses++; continue; }
        const calculated = calculateCurrentDemand(product.code, response.payload);
        if (calculated.status === 'unavailable' && malformed.has(calculated.reason)) demandInvalidResponses++;
      }
      phase = 'demand-ingest';
      const demandCompletedAt = new Date();
      demandResult = await ingestCurrentDemand({ organizationId: ECHO_ORGANIZATION_ID, businessDate: formatDateInputValue(demandCompletedAt, organization.timezone), db, now: demandCompletedAt, download: demandDownload });
    }
    phase = 'verify';
    const balances = await getWarehouseBalanceSignals(ECHO_ORGANIZATION_ID, db, new Date());
    const warehouses = ['GPT', 'GRN'] as const;
    const currentPairs = balances.rows.reduce((total, row) => total + warehouses.filter(warehouse => row.warehouses[warehouse].status === 'AVAILABLE').length, 0);
    const inventoryPairs = balances.rows.reduce((total, row) => total + warehouses.filter(warehouse => row.inventory.warehouses[warehouse].status === 'AVAILABLE' && !row.inventory.warehouses[warehouse].stale).length, 0);
    const shortfalls = Object.fromEntries(warehouses.map(warehouse => [warehouse, balances.rows.filter(row => {
      const balance = row.warehouses[warehouse];
      return balance.status === 'AVAILABLE' && balance.balanceCases !== null && balance.balanceCases < 0;
    }).length]));
    const invalidInventoryReasons = new Set(['INVALID_QUANTITY', 'INVALID_SOURCE_DATE', 'CONFLICTING_PRODUCT_ROWS']);
    const inventoryInvalidPairs = result.results.filter(row => row.reason !== null && invalidInventoryReasons.has(row.reason)).length;
    const failed = result.failed > 0 || inventoryInvalidPairs > 0 || demandResult.failed > 0 || demandInvalidResponses > 0 || currentPairs === 0;
    console.log(JSON.stringify({ status: failed ? 'failed' : 'verified', phase, environment: 'test', databaseTarget: 'neon-neat-tst',
      businessDate: balances.today, eligibleProducts: balances.rows.length, currentWarehousePairs: currentPairs, currentInventoryPairs: inventoryPairs, shortfalls,
      available: result.available, reused: result.reused, unavailable: result.unavailable, failed: result.failed,
      inventoryInvalidPairs, demandRequested: pending.length, demandAvailable: demandResult.available, demandReused: demandResult.reused, demandUnavailable: demandResult.unavailable, demandFailed: demandResult.failed, demandInvalidResponses }));
    if (failed) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ status: 'failed', source: 'DC_INVENTORY', phase }));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
    // Exact generated child was checked against RUNNER_TEMP before use.
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(() => { console.error(JSON.stringify({ status: 'failed', phase: 'setup' })); process.exitCode = 1; });
