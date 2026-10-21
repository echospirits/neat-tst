import os from 'node:os';
import { retryDatabaseRead } from './databaseReadRetry';
import path from 'node:path';
import { OhlqReportDataSource, OhlqReportRunStatus, type PrismaClient } from '@prisma/client';
import { refreshAgencyIntelligence } from './agencyIntelligenceService';
import { importOhlqAgencyInventoryCsv } from './ohlqAgencyInventoryImport';
import { downloadOhlqAgencyInventoryReport, getOhlqAgencyInventoryObservationDate } from './ohlqAnnualSalesReport';
import { getOrganizationOhlqCredentials } from './ohlqTenantCredentials';
import { completeTenantInventoryRun, errorTenantInventoryRun, startTenantInventoryRun } from './ohlqTenantInventoryStatus';
import { prisma } from './prisma';

type Logger = Pick<Console, 'error' | 'log'>;
const defaultServices = {
  credentials: getOrganizationOhlqCredentials,
  download: downloadOhlqAgencyInventoryReport,
  importCsv: importOhlqAgencyInventoryCsv,
  refresh: refreshAgencyIntelligence,
};

export async function runOhlqTenantInventoryWorkflow({
  db = prisma,
  logger = console,
  services = defaultServices,
}: {
  db?: PrismaClient;
  logger?: Logger;
  services?: typeof defaultServices;
} = {}) {
  if (!process.env.OHLQ_TENANT_CREDENTIAL_ENCRYPTION_KEY?.trim()) {
    throw new Error('OHLQ_TENANT_CREDENTIAL_ENCRYPTION_KEY is required.');
  }

  const reportDate = getOhlqAgencyInventoryObservationDate();
  const organizations = await retryDatabaseRead(() => db.organization.findMany({
    where: {
      active: true,
      ohlqCredentials: { isNot: null },
      OR: [
        { features: { some: { enabled: true, featureKey: 'AGENCY_INTELLIGENCE' } } },
        { accountOverlays: { some: { accountType: 'AGENCY', isTargeting: true } } },
      ],
    },
    orderBy: { id: 'asc' },
    select: {
      displayName: true,
      id: true,
      features: { where: { enabled: true, featureKey: 'AGENCY_INTELLIGENCE' }, select: { id: true } },
      accountOverlays: { where: { accountType: 'AGENCY', isTargeting: true }, select: { externalAccountId: true } },
    },
  }));
  const latestSales = await retryDatabaseRead(() => db.ohlqReportImportStatus.findFirst({
    where: { dataSource: OhlqReportDataSource.ANNUAL_SALES_SUMMARY, status: OhlqReportRunStatus.COMPLETED },
    orderBy: { reportDate: 'desc' },
    select: { reportDate: true },
  }));
  const failures: string[] = [];
  const intelligenceFailures: string[] = [];
  let importedRows = 0;

  for (const organization of organizations) {
    let inventoryCompleted = false;
    try {
      await startTenantInventoryRun(organization.id, reportDate, db);
      const credentials = await retryDatabaseRead(() => services.credentials(organization.id, db));
      if (!credentials) throw new Error('Tenant OHLQ credentials are no longer configured.');
      const download = await services.download({
        debugDir: path.join(os.tmpdir(), 'ohlq-playwright', organization.id),
        downloadDir: path.join(os.tmpdir(), 'ohlq-downloads', organization.id),
        headless: true,
        partnerCredentials: credentials,
        reportDate,
        returnBuffer: true,
        useServerlessChromium: process.env.VERCEL === '1',
      });
      if (!download.csvBuffer) throw new Error('Inventory download completed without a CSV buffer.');
      const result = await services.importCsv({ csv: download.csvBuffer, db, organizationId: organization.id, reportDate: download.reportDate });
      importedRows += result.importedRows;
      await completeTenantInventoryRun(organization.id, download, result, db);
      inventoryCompleted = true;
      if ((organization.features.length || organization.accountOverlays.length) && latestSales) {
        await services.refresh({
          db,
          inventoryReportDate: new Date(`${download.reportDate}T00:00:00.000Z`),
          organizationId: organization.id,
          salesReportDate: latestSales.reportDate,
          targetedAgencyIds: organization.features.length ? undefined : organization.accountOverlays.map((overlay) => overlay.externalAccountId),
        });
      }
      logger.log(JSON.stringify({ organizationId: organization.id, inventoryRows: result.importedRows, reportDate: download.reportDate }));
    } catch (error) {
      if (inventoryCompleted) {
        intelligenceFailures.push(organization.id);
        logger.error(`Inventory imported for ${organization.id}, but retail intelligence failed: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      failures.push(organization.id);
      await errorTenantInventoryRun(organization.id, reportDate, error, db).catch(() => undefined);
      logger.error(`Tenant inventory failed for ${organization.displayName} (${organization.id}): ${error instanceof Error ? error.message : error}`);
    }
  }

  logger.log(`Tenant inventory processed ${organizations.length} configured organization(s).`);
  if (failures.length || intelligenceFailures.length) throw new Error(`Tenant inventory import failures: ${failures.join(', ') || 'none'}; retail intelligence failures after successful import: ${intelligenceFailures.join(', ') || 'none'}`);
  return { configuredOrganizations: organizations.length, importedRows };
}
