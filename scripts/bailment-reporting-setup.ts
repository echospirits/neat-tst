import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { formatDateInputValue } from '../lib/dateTime';
import { ohioSourceConfiguration } from '../lib/productionForecasting/sourceConfiguration';
import { parseBailmentReportingCsv, type ParsedBailmentReportingReport } from '../lib/ohlqBailmentReportingParser';

export const BAILMENT_REPORTING_MIGRATION = '20261119010000_bailment_reporting';
const TST_PROJECT = 'dawn-frog-33352119';
const TST_BRANCH = 'br-divine-forest-avwq2b3g';
const ORGANIZATION = 'org_echo_spirits';
const REPORT_ID = 'bdf38254-b332-4d12-b689-1113a2644a40';
const ExactDecimal = Prisma.Decimal.clone({ precision: 60 });

class SetupError extends Error {
  constructor(readonly code: string) { super(`Bailment reporting setup stopped (${code}).`); }
}
function stop(code: string): never { throw new SetupError(code); }
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

/** The operator independently verifies these IDs and endpoint through Neon. */
export function reportingSetupConfiguration() {
  const configPath = argument('config');
  const expectedProject = argument('expected-project');
  const expectedBranch = argument('expected-branch');
  const expectedHost = argument('expected-host');
  const rehearsal = process.argv.includes('--rehearsal');
  if (!configPath || !expectedProject || !expectedBranch || !expectedHost) stop('missing-target-arguments');
  let config: { databaseUrl?: string; projectId?: string; branchId?: string };
  try { config = JSON.parse(readFileSync(path.resolve(configPath), 'utf8')); }
  catch { return stop('invalid-private-config'); }
  if (!config || expectedProject !== TST_PROJECT || config.projectId !== expectedProject
    || config.branchId !== expectedBranch || !/^br-[a-z0-9-]+$/.test(expectedBranch)
    || (rehearsal ? expectedBranch === TST_BRANCH : expectedBranch !== TST_BRANCH)) stop('target-identity-mismatch');
  let connection: URL;
  try { connection = new URL(config.databaseUrl ?? ''); }
  catch { return stop('invalid-database-url'); }
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || !connection.username || !connection.password
    || connection.hostname !== expectedHost || !/^ep-[a-z0-9.-]+\.neon\.tech$/.test(expectedHost)
    || !['require', 'verify-ca', 'verify-full'].includes(connection.searchParams.get('sslmode') ?? '')) stop('database-endpoint-mismatch');
  // A direct connection keeps the guarded migration transaction on one backend.
  connection.hostname = connection.hostname.replace('-pooler.', '.');
  return { connection, projectId: expectedProject, branchId: expectedBranch, host: expectedHost, rehearsal };
}

async function verifyDatabaseTarget(db: PrismaClient, context: ReturnType<typeof reportingSetupConfiguration>) {
  const [identity] = await db.$queryRaw<Array<{ database: string; branch: string | null; project: string | null }>>`
    SELECT current_database() AS database,
      current_setting('neon.branch_id', true) AS branch,
      current_setting('neon.project_id', true) AS project`;
  const expectedDatabase = decodeURIComponent(context.connection.pathname.slice(1));
  if (!identity || identity.database !== expectedDatabase
    || (identity.branch && identity.branch !== context.branchId)
    || (identity.project && identity.project !== context.projectId)) stop('connected-target-mismatch');
}

async function applyMigration(db: PrismaClient, sql: string, checksum: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bailment-reporting-migration'))`;
    const ledger = await tx.$queryRaw<Array<{ checksum: string; finished_at: Date | null }>>`
      SELECT checksum, finished_at FROM "_prisma_migrations"
      WHERE migration_name=${BAILMENT_REPORTING_MIGRATION} AND rolled_back_at IS NULL`;
    if (ledger.length) {
      if (ledger.length !== 1 || ledger[0].checksum !== checksum || !ledger[0].finished_at) stop('migration-ledger-mismatch');
      return { newlyApplied: false };
    }
    const objects = await tx.$queryRaw<Array<{ name: string }>>`
      SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('OhlqBailmentReportingSnapshot','OhlqBailmentReportingLine','echo_bailment_reporting')`;
    if (objects.length) stop('unregistered-reporting-objects');
    // This reviewed migration has ordinary statements only, with no function bodies.
    for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean)) {
      await tx.$executeRawUnsafe(statement);
    }
    await tx.$executeRaw`INSERT INTO "_prisma_migrations"
      (id,checksum,migration_name,started_at,finished_at,applied_steps_count)
      VALUES (${randomUUID()},${checksum},${BAILMENT_REPORTING_MIGRATION},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`;
    return { newlyApplied: true };
  }, { maxWait: 20_000, timeout: 90_000 });
}

async function validateRetainedSource(db: PrismaClient) {
  const retained = await db.ohlqBailmentReportState.findUnique({
    where: { organizationId: ORGANIZATION },
    include: { currentPayload: true, currentRetrieval: true },
  });
  if (!retained) stop('retained-source-unavailable');
  const payload = retained.currentPayload;
  const retrieval = retained.currentRetrieval;
  if (payload.organizationId !== ORGANIZATION || retrieval.organizationId !== ORGANIZATION
    || retrieval.status !== 'SUCCEEDED' || !retrieval.acquiredAt || !retrieval.requestedFrom || !retrieval.requestedTo
    || retrieval.requestedAt > retrieval.acquiredAt || retrieval.acquiredAt > retrieval.completedAt
    || retrieval.reportIdentity !== REPORT_ID || payload.contentHash !== retrieval.contentHash
    || payload.rowCount !== retrieval.rowCount || payload.schemaVersion !== 'ohlq-bailment-po-invoice-v1') stop('retained-provenance-mismatch');
  const scope = retrieval.parameterScope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)
    || (scope.parameter !== 'Vendor' && scope.parameter !== 'Brand') || scope.values !== 'all') stop('retained-scope-mismatch');
  const csvBuffer = Buffer.from(payload.csvBytes);
  if (csvBuffer.length !== payload.byteCount || createHash('sha256').update(new Uint8Array(csvBuffer)).digest('hex') !== payload.contentHash) {
    stop('retained-payload-mismatch');
  }
  const parsed = parseBailmentReportingCsv(csvBuffer);
  if (parsed.rowCount !== payload.rowCount || parsed.contentHash !== payload.contentHash) stop('retained-parser-mismatch');
  const organization = await db.organization.findFirst({
    where: { id: ORGANIZATION, active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] }, enabledStates: { has: 'OH' } },
    select: { timezone: true, settings: true },
  });
  const requestedFrom = retrieval.requestedFrom.toISOString().slice(0, 10);
  const requestedTo = retrieval.requestedTo.toISOString().slice(0, 10);
  if (!organization || organization.timezone !== retrieval.timezone
    || ohioSourceConfiguration(organization.settings).historyStart !== requestedFrom
    || formatDateInputValue(retrieval.requestedAt, retrieval.timezone) !== requestedTo) stop('retained-organization-mismatch');
  const requestId = `retained-${createHash('sha256').update(`${retrieval.retrievalId}:${payload.contentHash}`).digest('hex')}`;
  return {
    parsed,
    input: {
      organizationId: ORGANIZATION, requestId, csvBuffer,
      requestedAt: retrieval.requestedAt, acquiredAt: retrieval.acquiredAt,
      requestedFrom, requestedTo, timezone: retrieval.timezone, reportIdentity: retrieval.reportIdentity,
      parameterScope: { parameter: scope.parameter, values: 'all' } as { parameter: 'Vendor' | 'Brand'; values: 'all' },
      exportCompleted: true as const, expectedSizeBytes: payload.byteCount,
    },
  };
}

const viewFields = [
  ['Vendor_Name', 'vendorName'], ['Broker_Name', 'brokerName'], ['Invoice_Date', 'invoiceDate'],
  ['Invoice_Number', 'invoiceNumber'], ['PO_Create_Date', 'poCreateDate'], ['PO_Number', 'poNumber'],
  ['Transfer_Order_Number', 'transferOrderNumber'], ['Agency', 'agency'], ['Transfer_Order_Ship_Date', 'transferOrderShipDate'],
  ['UPC_Code', 'upcCode'], ['Brand', 'brand'], ['Name', 'name'], ['Category', 'category'], ['DC_Name', 'dcName'],
  ['Cases', 'cases'], ['Odd_Bottles', 'oddBottles'], ['Cases_Bottles', 'casesBottles'],
  ['Quoted_Case_Price', 'quotedCasePrice'], ['Discount', 'discount'], ['Total', 'total'], ['Date_Paid', 'datePaid'],
] as const;
const decimalFields = new Set(['cases', 'oddBottles', 'quotedCasePrice', 'discount', 'total']);

/** Compare every typed native cell and independent SQL monthly sums, without logging financial values. */
async function reconcileRetainedSource(db: PrismaClient, retained: Awaited<ReturnType<typeof validateRetainedSource>>) {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM public.echo_bailment_reporting ORDER BY "Source_Row_Number"`;
  if (rows.length !== retained.parsed.rowCount) stop('view-row-count-mismatch');
  for (let index = 0; index < rows.length; index++) {
    const expected = retained.parsed.lines[index];
    const actual = rows[index];
    if (actual.Source_Row_Number !== expected.sourceLineNumber) stop('view-line-ordinal-mismatch');
    for (const [alias, field] of viewFields) {
      const sourceValue = expected[field];
      const viewValue = actual[alias];
      if (sourceValue === null) { if (viewValue !== null) stop('view-null-mismatch'); }
      else if (sourceValue instanceof Date) {
        if (!(viewValue instanceof Date) || sourceValue.getTime() !== viewValue.getTime()) stop('view-date-mismatch');
      } else if (decimalFields.has(field)) {
        if (viewValue === null || !new ExactDecimal(String(viewValue)).equals(sourceValue)) stop('view-decimal-mismatch');
      } else if (viewValue !== sourceValue) stop('view-text-mismatch');
    }
    for (const [alias, expectedDay] of [['Report_From', retained.input.requestedFrom], ['Report_To', retained.input.requestedTo]]) {
      const date = actual[alias];
      if (!(date instanceof Date) || date.toISOString().slice(0, 10) !== expectedDay) stop('view-coverage-mismatch');
    }
  }
  const current = await db.ohlqBailmentReportingSnapshot.findFirst({
    where: { organizationId: ORGANIZATION }, orderBy: [{ requestedAt: 'desc' }, { requestId: 'desc' }],
    select: { id: true, contentHash: true, acquiredAt: true },
  });
  if (!current || current.contentHash !== retained.parsed.contentHash
    || current.acquiredAt.getTime() !== retained.input.acquiredAt.getTime()) stop('current-source-clock-mismatch');
  const storedRaw = await db.ohlqBailmentReportingLine.findMany({
    where: { organizationId: ORGANIZATION, snapshotId: current.id }, orderBy: { sourceLineNumber: 'asc' },
    select: { sourceValues: true },
  });
  if (storedRaw.length !== retained.parsed.rowCount || storedRaw.some((line, index) =>
    JSON.stringify(line.sourceValues) !== JSON.stringify(retained.parsed.lines[index].sourceValues))) stop('stored-source-values-mismatch');
  const monthly = await db.$queryRaw<Array<{ month: string; rows: number; totalCount: number; total: string }>>`
    SELECT COALESCE(to_char("Invoice_Date", 'YYYY-MM'), 'unknown') AS month,
      count(*)::integer AS rows, count("Total")::integer AS "totalCount",
      COALESCE(sum("Total"), 0)::text AS total
    FROM public.echo_bailment_reporting GROUP BY 1 ORDER BY 1`;
  const expectedMonths = sourceMonthlyTotals(retained.parsed);
  if (monthly.length !== expectedMonths.size || monthly.some(actual => {
    const expected = expectedMonths.get(actual.month);
    return !expected || expected.rows !== actual.rows || expected.totalCount !== actual.totalCount
      || !expected.total.equals(actual.total);
  })) stop('monthly-reconciliation-mismatch');
  return { rows: rows.length, months: monthly.length, exactTypedCells: rows.length * viewFields.length, rawCellsPreserved: true, monthlyTotalsMatch: true };
}

function sourceMonthlyTotals(parsed: ParsedBailmentReportingReport) {
  const months = new Map<string, { rows: number; totalCount: number; total: Prisma.Decimal }>();
  for (const line of parsed.lines) {
    const month = line.invoiceDate?.toISOString().slice(0, 7) ?? 'unknown';
    const value = months.get(month) ?? { rows: 0, totalCount: 0, total: new ExactDecimal(0) };
    value.rows++;
    if (line.total !== null) { value.totalCount++; value.total = value.total.plus(line.total); }
    months.set(month, value);
  }
  return months;
}

async function main() {
  const context = reportingSetupConfiguration();
  const sql = readFileSync(path.join(process.cwd(), 'prisma/migrations', BAILMENT_REPORTING_MIGRATION, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const apply = process.argv.includes('--apply');
  const seed = process.argv.includes('--seed-retained');
  const reconcile = process.argv.includes('--reconcile-retained');
  const validate = process.argv.includes('--validate-retained');
  const receipt: Record<string, unknown> = {
    migration: BAILMENT_REPORTING_MIGRATION, checksum, projectId: context.projectId,
    branchId: context.branchId, host: context.host, rehearsal: context.rehearsal,
  };
  if (seed && !apply) stop('seed-requires-apply');
  if (apply && argument('checksum') !== checksum) stop('reviewed-checksum-required');
  if (!apply && !reconcile && !validate) { console.log(JSON.stringify({ ...receipt, dryRun: true })); return; }
  const db = new PrismaClient({ datasourceUrl: context.connection.toString() });
  try {
    await verifyDatabaseTarget(db, context);
    const retained = seed || validate || reconcile ? await validateRetainedSource(db) : undefined;
    if (retained) receipt.retainedSource = {
      rows: retained.parsed.rowCount, bytes: retained.input.expectedSizeBytes, contentHash: retained.parsed.contentHash,
      retrievedAt: retained.input.acquiredAt.toISOString(), from: retained.input.requestedFrom, to: retained.input.requestedTo,
      validated: true,
    };
    if (apply) receipt.migrationResult = await applyMigration(db, sql, checksum);
    if (seed && retained) {
      // The publisher imports the guarded runtime singleton. Configure only this
      // local process before importing it; no hosted environment or scheduler changes.
      Object.assign(process.env, {
        APP_ENV: 'test', DATABASE_ENVIRONMENT: 'test', DATABASE_URL: context.connection.toString(),
        DATABASE_TARGET_ID: context.rehearsal ? 'bailment-reporting-rehearsal' : 'neon-neat-tst',
        EXPECTED_DATABASE_HOST: context.connection.hostname, APP_BASE_URL: 'https://neat-tst.vercel.app',
        PRODUCTION_BASE_URL: 'https://crm.echospirits.com',
      });
      const { publishBailmentReportingSnapshot } = await import('../lib/ohlqBailmentReporting');
      receipt.seed = await publishBailmentReportingSnapshot(retained.input, db);
    }
    if ((seed || reconcile) && retained) receipt.reconciliation = await reconcileRetainedSource(db, retained);
    console.log(JSON.stringify(receipt));
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/bailment-reporting-setup.ts')) {
  main().catch(error => {
    // Database/CSV exceptions may contain secrets or financial values. Emit only a code.
    let code = 'validation-or-database-error';
    if (error instanceof SetupError) code = error.code;
    else if (error && typeof error === 'object') {
      const detail = error as { code?: unknown; errorCode?: unknown; meta?: { code?: unknown } };
      const candidate = detail.code ?? detail.errorCode;
      const name = (error as { name?: unknown }).name;
      if (typeof candidate === 'string' && (/^P\d{4}$/.test(candidate)
        || ['empty-export', 'oversized-export', 'invalid-encoding', 'invalid-csv', 'schema-change', 'invalid-date', 'invalid-number',
          'invalid-provenance', 'organization-unavailable', 'request-conflict', 'incomplete-export', 'persistence'].includes(candidate))) {
        code = candidate;
        if (typeof detail.meta?.code === 'string' && /^[0-9A-Z]{5}$/.test(detail.meta.code)) code += `:${detail.meta.code}`;
      }
      else if (typeof name === 'string' && ['PrismaClientInitializationError', 'PrismaClientValidationError', 'PrismaClientUnknownRequestError',
        'PrismaClientRustPanicError', 'BailmentReportingParseError', 'BailmentReportingError'].includes(name)) code = name;
    }
    console.error(`Bailment reporting setup stopped (${code}).`);
    process.exitCode = 1;
  });
}
