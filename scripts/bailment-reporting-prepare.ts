import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { formatDateInputValue } from '../lib/dateTime';
import { ohioSourceConfiguration } from '../lib/productionForecasting/sourceConfiguration';
import { parseBailmentReportingCsv, type BailmentReportingLineInput } from '../lib/ohlqBailmentReportingParser';

const PROJECT = 'dawn-frog-33352119';
const TST_BRANCH = 'br-divine-forest-avwq2b3g';
const ORGANIZATION = 'org_echo_spirits';
const REPORT = 'bdf38254-b332-4d12-b689-1113a2644a40';
const Decimal = Prisma.Decimal.clone({ precision: 60 });
const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
class PrepareError extends Error { constructor(readonly code: string) { super(code); } }
function stop(code: string): never { throw new PrepareError(code); }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : stop('invalid-input-object');
function text(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : stop('invalid-input-text'); }
function instant(value: unknown) {
  const source = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(source)) stop('invalid-source-instant');
  // The retained Prisma timestamps have no database timezone and represent UTC.
  const result = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(source) ? source : `${source}Z`);
  if (!Number.isFinite(result.getTime())) stop('invalid-source-instant');
  return result;
}
function day(value: unknown) {
  const source = text(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z?)?$/.test(source)) stop('invalid-source-day');
  const result = source.slice(0, 10);
  const date = new Date(`${result}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result) stop('invalid-source-day');
  return result;
}
// SET LOCAL standard_conforming_strings=on precedes every generated statement.
const sql = (value: string | null) => value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
const jsonSql = (value: unknown) => `${sql(JSON.stringify(value))}::jsonb`;
function block(body: string) {
  let delimiter = '$bailment_seed_guard$';
  while (body.includes(delimiter)) delimiter = `${delimiter.slice(0, -1)}_$`;
  return `DO ${delimiter}\nBEGIN\n${body}\nEND;\n${delimiter};`;
}

const fields = [
  ['vendorName', 'Vendor_Name'], ['brokerName', 'Broker_Name'], ['invoiceDate', 'Invoice_Date'],
  ['invoiceNumber', 'Invoice_Number'], ['poCreateDate', 'PO_Create_Date'], ['poNumber', 'PO_Number'],
  ['transferOrderNumber', 'Transfer_Order_Number'], ['agency', 'Agency'], ['transferOrderShipDate', 'Transfer_Order_Ship_Date'],
  ['upcCode', 'UPC_Code'], ['brand', 'Brand'], ['name', 'Name'], ['category', 'Category'], ['dcName', 'DC_Name'],
  ['cases', 'Cases'], ['oddBottles', 'Odd_Bottles'], ['casesBottles', 'Cases_Bottles'],
  ['quotedCasePrice', 'Quoted_Case_Price'], ['discount', 'Discount'], ['total', 'Total'], ['datePaid', 'Date_Paid'],
] as const;
const decimals = new Set<string>(['cases', 'oddBottles', 'quotedCasePrice', 'discount', 'total']);
const dates = new Set<string>(['invoiceDate', 'poCreateDate', 'transferOrderShipDate', 'datePaid']);
function normalizedLine(line: BailmentReportingLineInput) {
  return [String(line.sourceLineNumber), ...fields.map(([field]) => {
    const value = line[field];
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return decimals.has(field) ? new Decimal(value).toFixed(6) : value;
  })];
}
function sqlHash(canonical: string, from: string, order: string) {
  return `SELECT encode(sha256(convert_to(string_agg(${canonical}, E'\\n' ORDER BY ${order}), 'UTF8')), 'hex') FROM ${from}`;
}

/** Compact, one-time transport for a locally validated report with no multiline
 * cells. Byte identity and the final raw/typed digests remain authoritative. */
function serverSourceRowsSql(payloadId: string, contentHash: string) {
  return `WITH stored_source AS MATERIALIZED (
    SELECT p."csvBytes" FROM "OhlqBailmentReportState" s
    JOIN "OhlqBailmentReportPayload" p ON p."organizationId"=s."organizationId" AND p.id=s."currentPayloadId"
    WHERE s."organizationId"=${sql(ORGANIZATION)} AND p.id=${sql(payloadId)}
      AND encode(sha256(p."csvBytes"),'hex')=${sql(contentHash)}
  ), source_text AS (
    SELECT convert_from("csvBytes", 'UTF8') AS csv FROM stored_source
  ), source_csv AS (
    SELECT regexp_replace(CASE WHEN left(csv,1)=chr(65279) THEN substring(csv FROM 2) ELSE csv END,
      E'[\\r\\n]+$', '') AS csv FROM source_text
  ), physical_records AS (
    SELECT (r.ordinality-1)::integer AS "sourceLineNumber", r.line
    FROM source_csv CROSS JOIN LATERAL regexp_split_to_table(csv, E'\\r\\n|\\n|\\r')
      WITH ORDINALITY AS r(line,ordinality) WHERE r.ordinality>1
  ), native_rows AS (
    SELECT r."sourceLineNumber", array_agg(CASE WHEN left(t.matches[1],1)='"'
      THEN replace(substring(t.matches[1] FROM 2 FOR char_length(t.matches[1])-2),'""','"')
      ELSE t.matches[1] END ORDER BY t.ordinality) AS "sourceValues"
    FROM physical_records r CROSS JOIN LATERAL regexp_matches(',' || r.line,
      ',("(?:[^"]|"")*"|[^",]*)', 'g') WITH ORDINALITY AS t(matches,ordinality)
    GROUP BY r."sourceLineNumber"
  )`;
}

function serverTypedValue(field: string, index: number) {
  const source = `"sourceValues"[${index + 1}]`;
  if (!dates.has(field) && !decimals.has(field)) return `NULLIF(${source},'')`;
  // The runtime parser has already checked all formats. Remove its accepted
  // whitespace before PostgreSQL's exact numeric/date conversion.
  const compact = `regexp_replace(${source},${sql('[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]')},'','g')`;
  if (dates.has(field)) return `NULLIF(${compact},'')::date`;
  return `NULLIF(replace(replace(replace(replace(${compact},'$',''),',',''),'(','-'),')',''),'')::numeric(24,6)`;
}

/** Offline preparation only. The output contains private financial SQL and must remain private. */
export function prepareBailmentReportingSeed(rawInput: unknown, expectedProject: string, expectedBranch: string, rehearsal: boolean, serverSource = false) {
  const input = record(rawInput);
  if (expectedProject !== PROJECT || input.projectId !== expectedProject || input.branchId !== expectedBranch
    || !/^br-[a-z0-9-]+$/.test(expectedBranch) || (rehearsal ? expectedBranch === TST_BRANCH : expectedBranch !== TST_BRANCH)) {
    stop('target-identity-mismatch');
  }
  const organization = record(input.organization);
  const payload = record(input.payload);
  const retrieval = record(input.retrieval);
  const scope = record(retrieval.parameterScope);
  if (organization.id !== ORGANIZATION || organization.active !== true || typeof organization.accountStatus !== 'string'
    || ['SUSPENDED', 'CANCELLED'].includes(organization.accountStatus)
    || !Array.isArray(organization.enabledStates) || !organization.enabledStates.includes('OH')
    || payload.organizationId !== ORGANIZATION || retrieval.organizationId !== ORGANIZATION
    || retrieval.status !== 'SUCCEEDED' || retrieval.reportIdentity !== REPORT
    || payload.schemaVersion !== 'ohlq-bailment-po-invoice-v1'
    || payload.contentHash !== retrieval.contentHash || payload.rowCount !== retrieval.rowCount
    || (scope.parameter !== 'Vendor' && scope.parameter !== 'Brand') || scope.values !== 'all') stop('source-provenance-mismatch');
  const payloadId = text(payload.id);
  const retrievalId = text(retrieval.retrievalId);
  const requestedAt = instant(retrieval.requestedAt);
  const acquiredAt = instant(retrieval.acquiredAt);
  const completedAt = instant(retrieval.completedAt);
  const requestedFrom = day(retrieval.requestedFrom);
  const requestedTo = day(retrieval.requestedTo);
  const timezone = text(retrieval.timezone);
  if (requestedAt > acquiredAt || acquiredAt > completedAt || requestedFrom > requestedTo
    || organization.timezone !== timezone || ohioSourceConfiguration(organization.settings).historyStart !== requestedFrom
    || formatDateInputValue(requestedAt, timezone) !== requestedTo) stop('source-clock-or-configuration-mismatch');
  const base64 = text(payload.csvBase64).replace(/\s/g, '');
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) stop('invalid-source-base64');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64 || bytes.length !== payload.byteCount) stop('source-byte-count-mismatch');
  const parsed = parseBailmentReportingCsv(bytes);
  if (parsed.contentHash !== payload.contentHash || parsed.rowCount !== payload.rowCount) stop('source-hash-or-row-count-mismatch');
  if (serverSource && parsed.lines.some(line => line.sourceValues.some(value => /[\r\n]/.test(value)))) {
    stop('server-source-multiline-unsupported');
  }
  const requestId = `retained-${hash(`${retrievalId}:${parsed.contentHash}`)}`;
  const parameterScope = { parameter: scope.parameter, values: 'all' };
  const requestFingerprint = hash(JSON.stringify({
    organizationId: ORGANIZATION, requestId, requestedAt: requestedAt.toISOString(), acquiredAt: acquiredAt.toISOString(),
    requestedFrom, requestedTo, timezone, reportIdentity: REPORT, parameterScope,
    contentHash: parsed.contentHash, schemaVersion: parsed.schemaVersion,
  }));
  const snapshotId = `brs_seed_${hash(`${ORGANIZATION}:${requestId}`).slice(0, 32)}`;
  const typedDigest = hash(parsed.lines.map(line => JSON.stringify(normalizedLine(line))).join('\n'));
  const rawDigest = hash(parsed.lines.map(line => JSON.stringify([String(line.sourceLineNumber), ...line.sourceValues])).join('\n'));
  const months = new Map<string, { rows: number; totalCount: number; total: Prisma.Decimal }>();
  for (const line of parsed.lines) {
    const key = line.invoiceDate?.toISOString().slice(0, 7) ?? 'unknown';
    const month = months.get(key) ?? { rows: 0, totalCount: 0, total: new Decimal(0) };
    month.rows++;
    if (line.total !== null) { month.totalCount++; month.total = month.total.plus(line.total); }
    months.set(key, month);
  }
  const monthlyDigest = hash([...months].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => JSON.stringify([key, String(value.rows), String(value.totalCount), value.total.toFixed(6)])).join('\n'));
  const viewArray = ['"Source_Row_Number"::text', ...fields.map(([field, alias]) => dates.has(field)
    ? `to_char("${alias}", 'YYYY-MM-DD')` : `"${alias}"::text`)];
  const typedHashSql = sqlHash(`array_to_json(ARRAY[${viewArray.join(',')}])::text`, 'public.echo_bailment_reporting', '"Source_Row_Number"');
  const rawHashSql = sqlHash('array_to_json(ARRAY["sourceLineNumber"::text] || "sourceValues")::text',
    `"OhlqBailmentReportingLine" WHERE "organizationId"=${sql(ORGANIZATION)} AND "snapshotId"=${sql(snapshotId)}`, '"sourceLineNumber"');
  const monthlyHashSql = sqlHash('array_to_json(ARRAY[month,rows::text,total_count::text,total::text])::text',
    `(SELECT COALESCE(to_char("Invoice_Date", 'YYYY-MM'), 'unknown') AS month, count(*) AS rows,
      count("Total") AS total_count, COALESCE(sum("Total"),0)::numeric(60,6) AS total
      FROM public.echo_bailment_reporting GROUP BY 1) monthly`, 'month COLLATE "C"');
  const exactSnapshot = `"organizationId"=${sql(ORGANIZATION)} AND "id"=${sql(snapshotId)} AND "requestId"=${sql(requestId)}
    AND "requestFingerprint"=${sql(requestFingerprint)} AND "contentHash"=${sql(parsed.contentHash)}
    AND "rowCount"=${parsed.rowCount} AND "schemaVersion"=${sql(parsed.schemaVersion)}
    AND "requestedAt"=${sql(requestedAt.toISOString())}::timestamptz AND "acquiredAt"=${sql(acquiredAt.toISOString())}::timestamptz
    AND "requestedFrom"=${sql(requestedFrom)}::date AND "requestedTo"=${sql(requestedTo)}::date
    AND "timezone"=${sql(timezone)} AND "reportIdentity"=${sql(REPORT)} AND "parameterScope"=${jsonSql(parameterScope)}
    AND "invoiceMonthCounts"=${jsonSql(parsed.invoiceMonthCounts)}`;
  const sourceGuard = `IF current_setting('neon.project_id', true) IS DISTINCT FROM ${sql(expectedProject)}
    OR current_setting('neon.branch_id', true) IS DISTINCT FROM ${sql(expectedBranch)} THEN
    RAISE EXCEPTION 'bailment-seed-target-mismatch'; END IF;
  PERFORM 1 FROM "OhlqBailmentReportState" s
    JOIN "OhlqBailmentReportPayload" p ON p."organizationId"=s."organizationId" AND p.id=s."currentPayloadId"
    JOIN "OhlqBailmentReportRetrieval" r ON r."organizationId"=s."organizationId" AND r."retrievalId"=s."currentRetrievalId"
    JOIN "Organization" o ON o.id=s."organizationId"
    WHERE s."organizationId"=${sql(ORGANIZATION)} AND p.id=${sql(payloadId)} AND r."retrievalId"=${sql(retrievalId)}
      AND p."contentHash"=${sql(parsed.contentHash)} AND encode(sha256(p."csvBytes"),'hex')=${sql(parsed.contentHash)}
      AND octet_length(p."csvBytes")=${bytes.length} AND p."byteCount"=${bytes.length} AND p."rowCount"=${parsed.rowCount}
      AND p."schemaVersion"='ohlq-bailment-po-invoice-v1' AND r."status"='SUCCEEDED'
      AND r."contentHash"=${sql(parsed.contentHash)} AND r."rowCount"=${parsed.rowCount}
      AND r."requestedAt"=${sql(requestedAt.toISOString())}::timestamp AND r."acquiredAt"=${sql(acquiredAt.toISOString())}::timestamp
      AND r."completedAt"=${sql(completedAt.toISOString())}::timestamp
      AND r."requestedFrom"=${sql(requestedFrom)}::date AND r."requestedTo"=${sql(requestedTo)}::date
      AND r."timezone"=${sql(timezone)} AND r."reportIdentity"=${sql(REPORT)} AND r."parameterScope"=${jsonSql(parameterScope)}
      AND o.active=true AND o."accountStatus" NOT IN ('SUSPENDED','CANCELLED') AND 'OH'=ANY(o."enabledStates")
      AND o.timezone=${sql(timezone)} AND o.settings->'productionForecasting'->'ohio'->>'historyStart'=${sql(requestedFrom)}
    FOR SHARE OF s,p,r,o;
  IF NOT FOUND THEN RAISE EXCEPTION 'bailment-seed-retained-source-changed'; END IF;
  IF EXISTS (SELECT 1 FROM "OhlqBailmentReportingSnapshot" WHERE "organizationId"=${sql(ORGANIZATION)} AND NOT (${exactSnapshot}))
    THEN RAISE EXCEPTION 'bailment-seed-existing-snapshot'; END IF;`;
  const statements = [
    'SET LOCAL standard_conforming_strings=on',
    "SET LOCAL statement_timeout='90s'",
    "SET LOCAL lock_timeout='15s'",
    `SELECT pg_advisory_xact_lock(hashtext(${sql(`bailment-reporting:${ORGANIZATION}`)}))`,
    block(sourceGuard),
    `INSERT INTO "OhlqBailmentReportingSnapshot"
      ("id","organizationId","requestId","requestFingerprint","requestedAt","acquiredAt","requestedFrom","requestedTo",
       "timezone","reportIdentity","parameterScope","contentHash","schemaVersion","rowCount","invoiceMonthCounts")
      VALUES (${sql(snapshotId)},${sql(ORGANIZATION)},${sql(requestId)},${sql(requestFingerprint)},
       ${sql(requestedAt.toISOString())}::timestamptz,${sql(acquiredAt.toISOString())}::timestamptz,${sql(requestedFrom)}::date,${sql(requestedTo)}::date,
       ${sql(timezone)},${sql(REPORT)},${jsonSql(parameterScope)},${sql(parsed.contentHash)},${sql(parsed.schemaVersion)},${parsed.rowCount},${jsonSql(parsed.invoiceMonthCounts)})
      ON CONFLICT ("id") DO NOTHING`,
  ];
  const columns = ['organizationId', 'snapshotId', 'sourceLineNumber', ...fields.map(([field]) => field), 'sourceValues'];
  const serverRowsSql = serverSource ? serverSourceRowsSql(payloadId, parsed.contentHash) : undefined;
  const serverSourcePreflightSql = serverRowsSql ? `${serverRowsSql}
    SELECT current_setting('neon.project_id',true)=${sql(expectedProject)}
      AND current_setting('neon.branch_id',true)=${sql(expectedBranch)} AS "targetMatches",
      count(*)::integer AS "rowCount", bool_and(cardinality("sourceValues")=21) AS "allRowsHave21Cells",
      encode(sha256(convert_to(string_agg(array_to_json(ARRAY["sourceLineNumber"::text] || "sourceValues")::text,
        E'\\n' ORDER BY "sourceLineNumber"),'UTF8')),'hex')=${sql(rawDigest)} AS "rawCellsMatch"
    FROM native_rows` : undefined;
  if (serverRowsSql) {
    statements.unshift("SET LOCAL DateStyle='ISO, MDY'");
    statements.push(`${serverRowsSql}
      INSERT INTO "OhlqBailmentReportingLine" (${columns.map(column => `"${column}"`).join(',')})
      SELECT ${sql(ORGANIZATION)},${sql(snapshotId)},"sourceLineNumber",
        ${fields.map(([field], index) => serverTypedValue(field, index)).join(',\n        ')},"sourceValues"
      FROM native_rows
      ON CONFLICT ("organizationId","snapshotId","sourceLineNumber") DO NOTHING`);
  } else for (let offset = 0; offset < parsed.lines.length; offset += 500) {
    const values = parsed.lines.slice(offset, offset + 500).map(line => `(${[
      sql(ORGANIZATION), sql(snapshotId), String(line.sourceLineNumber),
      ...fields.map(([field]) => { const value = line[field]; return sql(value instanceof Date ? value.toISOString().slice(0, 10) : value); }),
      `ARRAY[${line.sourceValues.map(sql).join(',')}]::text[]`,
    ].join(',')})`).join(',\n');
    statements.push(`INSERT INTO "OhlqBailmentReportingLine" (${columns.map(column => `"${column}"`).join(',')}) VALUES\n${values}\nON CONFLICT ("organizationId","snapshotId","sourceLineNumber") DO NOTHING`);
  }
  const verificationSql = `SELECT (SELECT count(*)::integer FROM public.echo_bailment_reporting) AS "rowCount",
    (${typedHashSql})=${sql(typedDigest)} AS "typedCellsMatch",
    (${rawHashSql})=${sql(rawDigest)} AS "rawCellsMatch",
    (${monthlyHashSql})=${sql(monthlyDigest)} AS "monthlyTotalsMatch",
    EXISTS (SELECT 1 FROM "OhlqBailmentReportingSnapshot" WHERE ${exactSnapshot}) AS "sourceMetadataMatch",
    NOT EXISTS (SELECT 1 FROM public.echo_bailment_reporting WHERE
      "Report_From" IS DISTINCT FROM ${sql(requestedFrom)}::date OR "Report_To" IS DISTINCT FROM ${sql(requestedTo)}::date
      OR "Report_Retrieved_At" IS DISTINCT FROM (${sql(acquiredAt.toISOString())}::timestamptz AT TIME ZONE ${sql(timezone)})) AS "viewMetadataMatch"`;
  statements.push(block(`IF NOT EXISTS (SELECT 1 FROM (${verificationSql}) verified
    WHERE "rowCount"=${parsed.rowCount} AND "typedCellsMatch" AND "rawCellsMatch" AND "monthlyTotalsMatch"
      AND "sourceMetadataMatch" AND "viewMetadataMatch") THEN RAISE EXCEPTION 'bailment-seed-reconciliation-failed'; END IF;`));
  return {
    projectId: expectedProject, branchId: expectedBranch, rehearsal,
    preparationOnly: true, runtimePublisherExecuted: false,
    snapshotId, requestId, requestFingerprint, contentHash: parsed.contentHash, rowCount: parsed.rowCount,
    sourceAcquiredAt: acquiredAt.toISOString(), requestedFrom, requestedTo, timezone,
    exactTypedCells: parsed.rowCount * fields.length, monthCount: months.size,
    expectedDigests: { typed: typedDigest, raw: rawDigest, monthly: monthlyDigest },
    transactionRequired: true, statements, verificationSql,
    ...(serverSource ? { serverSource: true, serverSourcePreflightSql } : {}),
  };
}

function main() {
  const inputPath = arg('input');
  const outputPath = arg('output');
  const project = arg('expected-project');
  const branch = arg('expected-branch');
  if (!inputPath || !outputPath || !project || !branch) stop('missing-arguments');
  const source = path.resolve(inputPath);
  const destination = path.resolve(outputPath);
  if (source === destination) stop('input-output-must-differ');
  const inputStat = lstatSync(source);
  if (!inputStat.isFile() || inputStat.isSymbolicLink() || (inputStat.mode & 0o077) !== 0 || inputStat.size > 64 * 1024 * 1024) stop('private-input-required');
  if (existsSync(destination) && (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink())) stop('invalid-output-path');
  const prepared = prepareBailmentReportingSeed(JSON.parse(readFileSync(source, 'utf8')), project, branch, process.argv.includes('--rehearsal'), process.argv.includes('--server-source'));
  const temporary = `${destination}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(prepared), { mode: 0o600, flag: 'wx' });
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
  console.log(JSON.stringify({
    prepared: true, runtimePublisherExecuted: false, projectId: prepared.projectId, branchId: prepared.branchId,
    rowCount: prepared.rowCount, contentHash: prepared.contentHash, sourceAcquiredAt: prepared.sourceAcquiredAt,
    requestedFrom: prepared.requestedFrom, requestedTo: prepared.requestedTo, statements: prepared.statements.length,
    exactTypedCells: prepared.exactTypedCells, months: prepared.monthCount,
  }));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/bailment-reporting-prepare.ts')) {
  try { main(); }
  catch (error) {
    const code = error instanceof PrepareError ? error.code : error && typeof error === 'object'
      && 'code' in error && typeof error.code === 'string'
      && ['empty-export','oversized-export','invalid-encoding','invalid-csv','schema-change','invalid-date','invalid-number'].includes(error.code)
      ? error.code : 'input-or-preparation-error';
    console.error(`Bailment reporting preparation stopped (${code}).`);
    process.exitCode = 1;
  }
}
