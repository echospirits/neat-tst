// Server-only trusted service. Callers must resolve organization and authorize
// the initiating user/job; this module never accepts browser authorization.
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Prisma, type PrismaClient, type OhlqBailmentReportRetrieval } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { formatDateInputValue } from './dateTime';
import { ohioSourceConfiguration } from './productionForecasting/sourceConfiguration';

export const BAILMENT_REPORT_ID = 'bdf38254-b332-4d12-b689-1113a2644a40';
export const BAILMENT_SCHEMA_VERSION = 'ohlq-bailment-po-invoice-v1';
export const BAILMENT_HEADERS = ['Vendor_Name', 'Broker_Name', 'Invoice_Date', 'Invoice_Number', 'PO_Create_Date', 'PO_Number', 'Transfer_Order_Number', 'Agency', 'Transfer_Order_Ship_Date', 'UPC_Code', 'Brand', 'Name', 'Category', 'DC_Name', 'Cases', 'Odd_Bottles', 'Cases_Bottles', 'Quoted_Case_Price', 'Discount', 'Total', 'Date_Paid'] as const;
export const BAILMENT_RUN_RETENTION = 500;
export const BAILMENT_MAX_BYTES = 32 * 1024 * 1024;
const reasons = ['credentials', 'configuration', 'download', 'provenance', 'invalid-csv', 'empty-export', 'schema-change', 'incomplete-export', 'scope-mismatch', 'persistence'] as const;
export type BailmentFailureReason = typeof reasons[number];
export type BailmentParameterScope = { parameter: 'Vendor' | 'Brand'; values: 'all' };
export type BailmentRequest = {
  organizationId: string; retrievalId: string; requestedAt: Date; acquiredAt?: Date;
  requestedFrom: string | null; requestedTo: string | null; timezone: string;
  reportIdentity: string; parameterScope: BailmentParameterScope;
};
export type BailmentCaptureInput = BailmentRequest & {
  acquiredAt: Date; requestedFrom: string; requestedTo: string;
  csvBuffer: Buffer; exportCompleted: boolean; expectedSizeBytes?: number;
};
export type BailmentCaptureResult = { status: 'SUCCEEDED' | 'FAILED'; replay: boolean; published: boolean; reason: BailmentFailureReason | null; contentHash: string | null; rowCount: number | null };
const requestSchema = z.object({
  organizationId: z.string().min(1).max(128), retrievalId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  requestedAt: z.date(), acquiredAt: z.date().optional(), requestedFrom: z.string().nullable(), requestedTo: z.string().nullable(),
  timezone: z.string().min(1).max(100), reportIdentity: z.string().max(100),
  parameterScope: z.object({ parameter: z.enum(['Vendor', 'Brand']), values: z.literal('all') }).strict(),
});
const hash = (value: string | Buffer) => createHash('sha256').update(typeof value === 'string' ? value : new Uint8Array(value)).digest('hex');
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
function validDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
class InvalidExport extends Error {
  constructor(readonly reason: BailmentFailureReason) { super(reason); }
}

/** Strict CSV syntax only: no eligibility, quantity, status or financial filters.
 * Array rows keep duplicate-looking lines; original bytes are never serialized. */
export function validateNativeBailmentCsv(csvBuffer: Buffer, expectedSizeBytes?: number) {
  if (!csvBuffer.length) throw new InvalidExport('empty-export');
  if (csvBuffer.length > BAILMENT_MAX_BYTES || (expectedSizeBytes !== undefined && expectedSizeBytes !== csvBuffer.length)) throw new InvalidExport('incomplete-export');
  let csv: string;
  try { csv = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(csvBuffer)); }
  catch { throw new InvalidExport('invalid-csv'); }
  if (/^\s*</.test(csv) || csv.includes('\u0000')) throw new InvalidExport('invalid-csv');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false, started = false;
  for (let index = 0; index < csv.length; index++) {
    const c = csv[index];
    if (quoted) {
      if (c === '"') { if (csv[index + 1] === '"') { field += '"'; index++; } else { quoted = false; closed = true; } }
      else field += c;
      continue;
    }
    if (c === '"') {
      if (started || closed) throw new InvalidExport('invalid-csv');
      quoted = true; started = true;
    } else if (c === ',') {
      row.push(field); field = ''; started = false; closed = false;
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && csv[index + 1] === '\n') index++;
      row.push(field); rows.push(row); row = []; field = ''; started = false; closed = false;
    } else {
      if (closed) throw new InvalidExport('invalid-csv');
      field += c; started = true;
    }
  }
  if (quoted) throw new InvalidExport('incomplete-export');
  if (row.length || started || closed || field.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  if (!headers || headers.length !== BAILMENT_HEADERS.length || headers.some((header, index) => header !== BAILMENT_HEADERS[index])) throw new InvalidExport('schema-change');
  if (!rows.length || rows.every(value => value.every(field => !field.trim()))) throw new InvalidExport('empty-export');
  if (rows.some(value => value.length !== headers.length)) throw new InvalidExport('incomplete-export');
  return { rows, rowCount: rows.length, byteCount: csvBuffer.length, contentHash: hash(csvBuffer), schemaVersion: BAILMENT_SCHEMA_VERSION };
}

export function validateBailmentContinuity(currentRows: string[][], previousRows: string[][]) {
  if (previousRows.length < 10 || currentRows.length >= previousRows.length * 0.5) return;
  const month = (value: string) => {
    const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(value);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const us = /^(\d{1,2})\/\d{1,2}\/(\d{4})/.exec(value);
    return us ? `${us[2]}-${us[1].padStart(2, '0')}` : null;
  };
  const months = (rows: string[][]) => [...new Set(rows.map(row => month(row[2])).filter((value): value is string => !!value))].sort();
  const priorMonths = months(previousRows), incomingMonths = new Set(months(currentRows));
  // Require independently observable historical coverage loss as well as a
  // catastrophic count drop. Payment/amount corrections and a modest decline
  // are accepted. A short, well-formed upstream file within one month cannot
  // be proven incomplete by these checks and remains an explicit limitation.
  const oldestMonthLost = priorMonths.length >= 2 && !incomingMonths.has(priorMonths[0]);
  const lostMonths = priorMonths.filter(value => !incomingMonths.has(value)).length;
  if (oldestMonthLost || (priorMonths.length >= 2 && lostMonths >= priorMonths.length * 0.5)) throw new InvalidExport('incomplete-export');
}

function serialize(row: OhlqBailmentReportRetrieval) {
  return {
    retrievalId: row.retrievalId, requestedAt: row.requestedAt.toISOString(), acquiredAt: row.acquiredAt?.toISOString() ?? null,
    completedAt: row.completedAt.toISOString(), requestedFrom: day(row.requestedFrom), requestedTo: day(row.requestedTo),
    timezone: row.timezone, reportIdentity: row.reportIdentity, parameterScope: row.parameterScope,
    status: row.status as 'SUCCEEDED' | 'FAILED', reason: row.reason, contentHash: row.contentHash, rowCount: row.rowCount, validation: row.validation,
  };
}
export type BailmentReportMetadata = ReturnType<typeof serialize>;
function result(row: OhlqBailmentReportRetrieval, replay: boolean, published: boolean): BailmentCaptureResult {
  return { status: row.status as BailmentCaptureResult['status'], replay, published, reason: row.reason as BailmentFailureReason | null, contentHash: row.contentHash, rowCount: row.rowCount };
}
async function organizationForStorage(organizationId: string, db: Prisma.TransactionClient | PrismaClient) {
  const organization = await db.organization.findFirst({ where: { id: organizationId, active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] }, enabledStates: { has: 'OH' } }, select: { id: true, timezone: true, settings: true } });
  if (!organization) throw new Error('OHLQ financial report storage is unavailable for this organization.');
  return organization;
}
const newer = (input: BailmentRequest, prior: OhlqBailmentReportRetrieval) => input.requestedAt.getTime() > prior.requestedAt.getTime() || (input.requestedAt.getTime() === prior.requestedAt.getTime() && input.retrievalId > prior.retrievalId);

async function prune(tx: Prisma.TransactionClient, organizationId: string) {
  const state = await tx.ohlqBailmentReportState.findUnique({ where: { organizationId } });
  const protectedPayloads = state ? [state.currentPayloadId, state.previousPayloadId].filter((id): id is string => !!id) : [];
  await tx.ohlqBailmentReportPayload.deleteMany({ where: { organizationId, id: { notIn: protectedPayloads } } });
  const newest = await tx.ohlqBailmentReportRetrieval.findMany({ where: { organizationId }, select: { retrievalId: true }, orderBy: [{ requestedAt: 'desc' }, { retrievalId: 'desc' }], take: BAILMENT_RUN_RETENTION });
  const protectedRuns = newest.map(row => row.retrievalId);
  if (state) protectedRuns.push(state.currentRetrievalId);
  await tx.ohlqBailmentReportRetrieval.deleteMany({ where: { organizationId, retrievalId: { notIn: protectedRuns } } });
}

async function persist(input: BailmentRequest, payload: { csvBuffer: Buffer; exportCompleted: boolean; expectedSizeBytes?: number } | null, failureReason: BailmentFailureReason | null, db: PrismaClient) {
  const checked = requestSchema.parse(input);
  const contentHash = payload ? hash(payload.csvBuffer) : null;
  const fingerprint = hash(JSON.stringify({ ...checked, contentHash, failureReason, exportCompleted: payload?.exportCompleted ?? null, expectedSizeBytes: payload?.expectedSizeBytes ?? null }));
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ohlq-bailment-financial:${checked.organizationId}`}))`;
    const organization = await organizationForStorage(checked.organizationId, tx);
    const key = { organizationId_retrievalId: { organizationId: checked.organizationId, retrievalId: checked.retrievalId } };
    const replay = await tx.ohlqBailmentReportRetrieval.findUnique({ where: key });
    const state = await tx.ohlqBailmentReportState.findUnique({ where: { organizationId: checked.organizationId }, include: { currentRetrieval: true } });
    if (replay) {
      if (replay.requestFingerprint !== fingerprint) throw new Error('Bailment retrieval identity was reused with different input.');
      return result(replay, true, state?.currentRetrievalId === replay.retrievalId);
    }
    let reason = failureReason, parsed: ReturnType<typeof validateNativeBailmentCsv> | null = null;
    let continuity = 'not-evaluated';
    if (payload) {
      try {
        if (!payload.exportCompleted || !checked.acquiredAt || checked.acquiredAt < checked.requestedAt) throw new InvalidExport('provenance');
        const configured = ohioSourceConfiguration(organization.settings);
        if (checked.reportIdentity !== BAILMENT_REPORT_ID || checked.timezone !== organization.timezone || !validDay(checked.requestedFrom) || !validDay(checked.requestedTo) || checked.requestedFrom > checked.requestedTo || checked.requestedFrom !== configured.historyStart || checked.requestedTo !== formatDateInputValue(checked.requestedAt, checked.timezone) || checked.requestedTo > formatDateInputValue(checked.acquiredAt, checked.timezone)) throw new InvalidExport('scope-mismatch');
        parsed = validateNativeBailmentCsv(payload.csvBuffer, payload.expectedSizeBytes);
        continuity = 'initial';
        if (state) {
          const previous = state.currentRetrieval;
          const previousScope = requestSchema.shape.parameterScope.safeParse(previous.parameterScope);
          const comparable = previous.reportIdentity === checked.reportIdentity && previous.timezone === checked.timezone && day(previous.requestedFrom) === checked.requestedFrom && day(previous.requestedTo)! <= checked.requestedTo && previousScope.success && previousScope.data.parameter === checked.parameterScope.parameter && previousScope.data.values === checked.parameterScope.values;
          if (comparable) {
            const priorPayload = await tx.ohlqBailmentReportPayload.findUniqueOrThrow({ where: { organizationId_id: { organizationId: checked.organizationId, id: state.currentPayloadId } }, select: { csvBytes: true } });
            validateBailmentContinuity(parsed.rows, validateNativeBailmentCsv(Buffer.from(priorPayload.csvBytes)).rows);
            continuity = 'catastrophic-loss-check-passed';
          } else continuity = 'scope-changed-not-comparable';
        }
      } catch (error) {
        if (!(error instanceof InvalidExport)) throw error;
        reason = error.reason; parsed = null;
      }
    }
    const validation = parsed ? { schemaVersion: parsed.schemaVersion, headers: [...BAILMENT_HEADERS], columnCount: BAILMENT_HEADERS.length, byteCount: parsed.byteCount, structure: 'valid', nativeExport: 'download-completed', continuity, upstreamCompleteness: 'not-independently-verifiable' } : { schemaVersion: BAILMENT_SCHEMA_VERSION, result: 'rejected', reason, parameterScopeEvidence: payload ? 'download-returned' : 'configured-not-confirmed' };
    const run = await tx.ohlqBailmentReportRetrieval.create({ data: {
      ...checked, acquiredAt: checked.acquiredAt ?? null, requestedFrom: validDay(checked.requestedFrom) ? new Date(checked.requestedFrom) : null, requestedTo: validDay(checked.requestedTo) ? new Date(checked.requestedTo) : null,
      parameterScope: checked.parameterScope, status: parsed ? 'SUCCEEDED' : 'FAILED', reason, contentHash, rowCount: parsed?.rowCount ?? null,
      requestFingerprint: fingerprint, validation,
    } });
    let published = false;
    const advanceCurrent = !state || newer(checked, state.currentRetrieval);
    const retainFirstPrevious = !!state && !state.previousPayloadId && parsed?.contentHash !== state.currentRetrieval.contentHash;
    if (parsed && payload && (advanceCurrent || retainFirstPrevious)) {
      const saved = await tx.ohlqBailmentReportPayload.upsert({ where: { organizationId_contentHash: { organizationId: checked.organizationId, contentHash: parsed.contentHash } }, create: {
        organizationId: checked.organizationId, contentHash: parsed.contentHash, csvBytes: new Uint8Array(payload.csvBuffer), rowCount: parsed.rowCount, byteCount: parsed.byteCount, schemaVersion: parsed.schemaVersion, validation,
      }, update: {}, select: { id: true } });
      if (advanceCurrent) {
        const previousPayloadId = state && state.currentPayloadId !== saved.id ? state.currentPayloadId : state?.previousPayloadId ?? null;
        const current = { currentRetrievalId: checked.retrievalId, currentPayloadId: saved.id, previousPayloadId };
        await tx.ohlqBailmentReportState.upsert({ where: { organizationId: checked.organizationId }, create: { organizationId: checked.organizationId, ...current }, update: current });
        published = true;
      } else await tx.ohlqBailmentReportState.update({ where: { organizationId: checked.organizationId }, data: { previousPayloadId: saved.id } });
    }
    await prune(tx, checked.organizationId);
    return result(run, false, published);
  }, { timeout: 30000 });
}

export async function captureOhlqBailmentReport(input: BailmentCaptureInput, db: PrismaClient = prisma) {
  return persist(input, input, null, db);
}
export async function recordOhlqBailmentFailure(input: BailmentRequest & { reason: BailmentFailureReason }, db: PrismaClient = prisma) {
  return persist(input, null, z.enum(reasons).parse(input.reason), db);
}

/** No provider request and no payload overfetch in the Admin status surface. */
export async function getOhlqBailmentReportStatus(organizationId: string, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await organizationForStorage(organizationId, tx);
    const state = await tx.ohlqBailmentReportState.findUnique({ where: { organizationId }, select: { currentRetrieval: true } });
    const latest = await tx.ohlqBailmentReportRetrieval.findFirst({ where: { organizationId }, orderBy: [{ requestedAt: 'desc' }, { retrievalId: 'desc' }] });
    return { current: state ? serialize(state.currentRetrieval) : null, latestAttempt: latest ? serialize(latest) : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/** Trusted internal publisher entry point. Tenant-scoped snapshot isolation
 * returns one saved version and its matching successful retrieval metadata. */
export async function getCurrentOhlqBailmentReport(organizationId: string, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await organizationForStorage(organizationId, tx);
    const state = await tx.ohlqBailmentReportState.findUnique({ where: { organizationId }, include: { currentRetrieval: true, currentPayload: { select: { csvBytes: true, contentHash: true } } } });
    if (!state) return null;
    const csvBuffer = Buffer.from(state.currentPayload.csvBytes);
    if (hash(csvBuffer) !== state.currentPayload.contentHash || state.currentRetrieval.contentHash !== state.currentPayload.contentHash || state.currentRetrieval.status !== 'SUCCEEDED') throw new Error('Saved OHLQ financial report integrity check failed.');
    return { csvBuffer, metadata: serialize(state.currentRetrieval) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
