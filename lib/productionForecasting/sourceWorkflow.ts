import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { ECHO_ORGANIZATION_ID } from '../echoAccess';
import { getOrganizationOhlqCredentials } from '../ohlqTenantCredentials';
import { downloadOhlqBailmentInvoices, downloadOhlqPartnerDc, type OhlqAnnualSalesDownloadResult } from '../ohlqAnnualSalesReport';
import { formatDateInputValue } from '../dateTime';
import { importProductionSource, type ImportOptions, type SourceKind } from './import';
import { shift } from './model';
import { ohioSourceConfiguration } from './sourceConfiguration';
import { refreshProductionForecast } from './service';
import { syncOperationalSignals } from './operationalSignals/workflow';
import type { ForecastRefreshStage } from './refreshState';
import { captureOhlqBailmentReport, recordOhlqBailmentFailure, BAILMENT_REPORT_ID, type BailmentFailureReason } from '../ohlqBailmentReportStorage';

const defaults = { credentials: getOrganizationOhlqCredentials, bailment: downloadOhlqBailmentInvoices, dc: downloadOhlqPartnerDc, importCsv: importProductionSource, refresh: refreshProductionForecast, operations: syncOperationalSignals, captureBailment: captureOhlqBailmentReport, recordBailmentFailure: recordOhlqBailmentFailure };
type ProductionSourceServices = Omit<typeof defaults, 'operations' | 'captureBailment' | 'recordBailmentFailure'> & Partial<Pick<typeof defaults, 'captureBailment' | 'recordBailmentFailure'>> & { operations?: (options: Parameters<typeof syncOperationalSignals>[0]) => Promise<{ failed: number }> };
export type ProductionSourceOutcome = { configuredOrganizations: number; importedSources: number; refreshedForecasts: number; capturedFinancialReports?: number; failedSources: Array<'BAILMENT_PO_INVOICE' | 'BAILMENT_FINANCIAL_CAPTURE' | 'DISTRIBUTION_CENTER' | 'FORECAST' | 'OPERATIONS'> };
export { ohioSourceConfiguration } from './sourceConfiguration';

/** Uses the existing OHLQ scheduled job and each enrolled tenant's credentials.
 * Sources and tenants fail independently; logs contain operational counts only. */
export async function syncProductionSources({ db = prisma, services = defaults, logger = console, now = new Date(), retrievalId = randomUUID(), onStage, onResult, refreshInventory = false }: { db?: PrismaClient; services?: ProductionSourceServices; logger?: Pick<Console, 'log' | 'error'>; now?: Date; retrievalId?: string; refreshInventory?: boolean; onStage?: (stage: ForecastRefreshStage) => Promise<void>; onResult?: (result: ProductionSourceOutcome) => void } = {}) {
  const organizations = await db.organization.findMany({ where: { id: ECHO_ORGANIZATION_ID, active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] }, enabledStates: { has: 'OH' }, ohlqCredentials: { isNot: null }, features: { some: { featureKey: 'PRODUCTION_FORECASTING', enabled: true } } }, orderBy: { id: 'asc' }, select: { id: true, settings: true, timezone: true } });
  const failures: string[] = [];
  const failedSources: ProductionSourceOutcome['failedSources'] = [];
  let importedSources = 0;
  let refreshedForecasts = 0;
  let capturedFinancialReports = 0;
  for (const organization of organizations) {
    if (organization.id !== ECHO_ORGANIZATION_ID) continue;
    const today = formatDateInputValue(now, organization.timezone), end = shift(today, -1), config = ohioSourceConfiguration(organization.settings);
    const credentials = await services.credentials(organization.id, db).catch(() => null);
    for (const source of ['BAILMENT_PO_INVOICE', 'DISTRIBUTION_CENTER'] as SourceKind[]) {
      await onStage?.(source === 'BAILMENT_PO_INVOICE' ? 'BAILMENT' : 'GUIDANCE');
      let phase: 'credentials' | 'configuration' | 'download' | 'validation' = 'credentials';
      // The invocation timestamp identifies the source request and fixes its
      // timezone-local date range, even if login/download crosses midnight.
      // Acquisition time comes separately from the completed native download.
      const request = { organizationId: organization.id, retrievalId: `${retrievalId}:${organization.id}`, requestedAt: new Date(now), requestedFrom: config.historyStart, requestedTo: today, timezone: organization.timezone, reportIdentity: BAILMENT_REPORT_ID, parameterScope: { parameter: 'Vendor' as const, values: 'all' as const } };
      let financialAttempted = false;
      const financialFailure = async (reason: BailmentFailureReason, persist = true, acquiredAt?: Date) => {
        financialAttempted = true;
        failures.push(`${organization.id}:BAILMENT_FINANCIAL_CAPTURE`);
        failedSources.push('BAILMENT_FINANCIAL_CAPTURE');
        if (persist) await (services.recordBailmentFailure ?? recordOhlqBailmentFailure)({ ...request, acquiredAt, reason }, db).catch(() => undefined);
        logger.error(JSON.stringify({ organizationId: organization.id, source: 'BAILMENT_FINANCIAL_CAPTURE', status: 'failed', reason, reportDate: today }));
      };
      const options: ImportOptions = { organizationId: organization.id, market: 'OH', source, start: source === 'BAILMENT_PO_INVOICE' ? config.historyStart ?? end : today, end: source === 'BAILMENT_PO_INVOICE' ? end : today, observedOn: today, complete: true };
      try {
        if (!credentials) throw new Error('Tenant credentials unavailable.');
        phase = 'configuration';
        if (source === 'BAILMENT_PO_INVOICE' && (!config.historyStart || config.historyStart > today)) throw new Error('Complete native history start must be configured.');
        const downloadOptions = { headless: true, returnBuffer: true, partnerCredentials: credentials, reportDate: today, debugDir: path.join(os.tmpdir(), 'ohlq-private', organization.id, 'playwright'), downloadDir: path.join(os.tmpdir(), 'ohlq-private', organization.id, 'downloads'), logger: { log: () => undefined, error: () => undefined }, useServerlessChromium: process.env.VERCEL === '1' };
        phase = 'download';
        const download: OhlqAnnualSalesDownloadResult = source === 'BAILMENT_PO_INVOICE' ? await services.bailment({ ...downloadOptions, fromDate: config.historyStart! }) : await services.dc(downloadOptions);
        if (source === 'BAILMENT_PO_INVOICE') {
          // Capture the native bytes before the forecasting adapter applies any
          // product, movement-date, quantity or eligibility rules.
          financialAttempted = true;
          const exported = download.nativeExport;
          if (!download.csvBuffer || !exported || exported.parameterScope.values !== 'all' || exported.requestedFrom !== config.historyStart || exported.requestedTo !== today || exported.reportIdentity !== BAILMENT_REPORT_ID || !exported.exportCompleted || !Number.isFinite(new Date(exported.acquiredAt).getTime())) {
            await financialFailure('provenance');
          } else {
            const acquiredAt = new Date(exported.acquiredAt);
            try {
              const captured = await (services.captureBailment ?? captureOhlqBailmentReport)({ ...request, requestedFrom: exported.requestedFrom, requestedTo: exported.requestedTo, reportIdentity: exported.reportIdentity, parameterScope: { parameter: exported.parameterScope.parameter, values: 'all' }, acquiredAt, exportCompleted: true, expectedSizeBytes: download.sizeBytes, csvBuffer: download.csvBuffer }, db);
              if (captured.status === 'FAILED') await financialFailure(captured.reason ?? 'invalid-csv', false, acquiredAt);
              else {
                capturedFinancialReports++;
                logger.log(JSON.stringify({ organizationId: organization.id, source: 'BAILMENT_FINANCIAL_CAPTURE', status: captured.replay ? 'replayed' : 'captured', rows: captured.rowCount, published: captured.published, reportDate: today }));
              }
            } catch { await financialFailure('persistence', true, acquiredAt); }
          }
        }
        phase = 'validation';
        if (!download.csvBuffer || download.reportDate !== today) throw new Error('A current complete source export is required.');
        if (source === 'BAILMENT_PO_INVOICE') {
          if (!config.directInvoices || config.historyStart! > end) throw new Error('Forecasting requires a complete-day history range and configured direct invoice policy.');
          options.nativeHistory = { fullPortfolio: true, directInvoices: config.directInvoices };
        }
        const result = await services.importCsv(download.csvBuffer.toString('utf8'), options, db);
        importedSources++;
        logger.log(JSON.stringify({ organizationId: organization.id, source, status: result.replay ? 'replayed' : 'imported', rows: result.rowCount, excludedRows: result.excludedRows, reportDate: today }));
      } catch (error) {
        if (source === 'BAILMENT_PO_INVOICE' && !financialAttempted) await financialFailure(phase === 'validation' ? 'provenance' : phase);
        failures.push(`${organization.id}:${source}`);
        failedSources.push(source);
        // No provider error text, rows, credentials, or filenames in CI metadata.
        const contentHash = createHash('sha256').update(JSON.stringify({ ...options, attempt: 'scheduled-download-failure' })).digest('hex');
        const detail = error instanceof Error ? error.message : '';
        const reason = phase === 'download' && /incorrect username or password|returned to login|sign.in.*(failed|timeout)/i.test(detail) ? 'upstream-authentication' : phase === 'download' && /render|parameters did not load/i.test(detail) ? 'upstream-report-unavailable' : phase;
        await db.productionSourceImport.upsert({ where: { organizationId_market_source_contentHash: { organizationId: organization.id, market: 'OH', source, contentHash } }, create: { organizationId: organization.id, market: 'OH', source, contentHash, status: 'FAILED', coverageStart: new Date(options.start), coverageEnd: new Date(options.end), observedOn: new Date(today), summary: { issue: 'Forecast source import failed; independently saved financial reports and other completed work are retained.', reason } }, update: {} }).catch(() => undefined);
        logger.error(JSON.stringify({ organizationId: organization.id, source, status: 'failed', reason, reportDate: today }));
      }
    }
    await onStage?.('FORECAST');
    try { await services.refresh(organization.id, db, now); refreshedForecasts++; }
    catch { failures.push(`${organization.id}:REFRESH`); failedSources.push('FORECAST'); logger.error(JSON.stringify({ organizationId: organization.id, status: 'refresh-failed' })); }
  }
  if (services.operations) {
    await onStage?.('OPERATIONS');
    // Run even when a source failed; its clock reflects actual retrieval time.
    try { const result = await services.operations({ db, logger, refreshInventory }); if (result.failed) { failures.push('OPERATIONAL_SIGNALS'); failedSources.push('OPERATIONS'); } }
    catch { failures.push('OPERATIONAL_SIGNALS'); failedSources.push('OPERATIONS'); logger.error(JSON.stringify({ source: 'OPERATIONAL_SIGNALS', status: 'failed' })); }
  }
  onResult?.({ configuredOrganizations: organizations.filter(organization => organization.id === ECHO_ORGANIZATION_ID).length, importedSources, refreshedForecasts, capturedFinancialReports, failedSources });
  if (failures.length) throw new Error(`Production source failures: ${failures.join(', ')}.`);
  return { configuredOrganizations: organizations.length, importedSources };
}
