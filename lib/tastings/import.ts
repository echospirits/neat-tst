import { createHash } from 'crypto';
import { Prisma, type TastingEvent } from '@prisma/client';
import { z } from 'zod';
import { parseTastingSchedule } from './time';
import { tastingMinimumDays } from './model';
import { assertTastingActor, assertTastingSchedule, lockTastings, tastingAssignment, TastingError, writeTastingHistory, type TastingActor, type TastingDb } from './service';

export const TASTING_IMPORT_STATUSES = ['DRAFT', 'Taster Approved', 'Taster Needs Edit', 'Requested Agency Approval', 'Agency Approved', 'Agency Denied', 'Submitted to State', 'State Approved', 'State Denied', 'Cancelled'] as const;
export type ImportedTastingStatus = typeof TASTING_IMPORT_STATUSES[number];
const statusKey = (value: string) => value.trim().replace(/[_\s]+/g, ' ').toLowerCase();
export function mapTastingImportStatus(value: string) {
  const known = TASTING_IMPORT_STATUSES.find(status => statusKey(status) === statusKey(value));
  if (!known) throw new TastingError(`Unknown spreadsheet status: ${value || '(empty)'}.`);
  const milestones: Pick<Prisma.TastingEventUncheckedCreateInput, 'tasterResponse' | 'agencyApproval' | 'stateApproval'> = { tasterResponse: 'PENDING', agencyApproval: 'NOT_REQUESTED', stateApproval: 'NOT_SUBMITTED' };
  // A later visible status proves only that observed milestone. Earlier approvals remain unverified.
  if (known === 'Taster Approved') milestones.tasterResponse = 'APPROVED';
  if (known === 'Taster Needs Edit') milestones.tasterResponse = 'NEEDS_EDIT';
  if (known === 'Requested Agency Approval') milestones.agencyApproval = 'REQUESTED';
  if (known === 'Agency Approved') milestones.agencyApproval = 'APPROVED';
  if (known === 'Agency Denied') milestones.agencyApproval = 'DENIED';
  if (known === 'Submitted to State') milestones.stateApproval = 'SUBMITTED';
  if (known === 'State Approved') milestones.stateApproval = 'APPROVED';
  if (known === 'State Denied') milestones.stateApproval = 'DENIED';
  return { status: known, milestones, cancelled: known === 'Cancelled' };
}
export const tastingImportRowInput = z.object({
  rowKey: z.string().trim().max(200).optional(), date: z.string(), startTime: z.string(), endTime: z.string(),
  agencyId: z.string().trim().min(1).max(100), assignedTaster: z.string().trim().max(200), status: z.string().trim().max(100),
  tasterNotes: z.string().trim().max(6000).default(''), internalNotes: z.string().trim().max(6000).default(''),
  responseComment: z.string().trim().max(6000).default(''), cancellationReason: z.string().trim().max(6000).default(''),
  historicalBottles: z.preprocess(value => value === '' || value === null || value === undefined ? null : Number(value), z.number().finite().min(0).max(1000000).nullable()),
  originalApprover: z.string().trim().max(500).default(''), sourceEventKey: z.string().trim().max(500).default(''),
  historicalSalesNote: z.string().trim().max(1000).default(''),
  emailsGathered: z.preprocess(value => value === '' || value === null || value === undefined ? null : Number(value), z.number().int().min(0).max(100000).nullable()),
});
export type TastingImportRow = z.input<typeof tastingImportRowInput>;
export type TastingImportPreview = {
  row: number;
  input: z.output<typeof tastingImportRowInput> | null;
  agencyId: string | null;
  agencyName: string | null;
  assignedTasterUserId: string | null;
  assignedTasterName: string | null;
  status: ImportedTastingStatus | null;
  needsReview: boolean;
  warnings: string[];
  errors: string[];
};
export async function previewTastingImport(db: TastingDb, actor: TastingActor, rows: readonly unknown[]): Promise<TastingImportPreview[]> {
  await assertTastingActor(db, actor, true);
  if (!rows.length || rows.length > 500) throw new TastingError('Import between 1 and 500 rows at a time.');
  const result: TastingImportPreview[] = [];
  for (const [index, raw] of rows.entries()) {
    const preview: TastingImportPreview = { row: index + 1, input: null, agencyId: null, agencyName: null, assignedTasterUserId: null, assignedTasterName: null, status: null, needsReview: false, warnings: [], errors: [] };
    const parsed = tastingImportRowInput.safeParse(raw);
    if (!parsed.success) { preview.errors.push(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')); result.push(preview); continue; }
    const row = preview.input = parsed.data;
    try { parseTastingSchedule(row.date, row.startTime, row.endTime); } catch (error) { preview.errors.push(error instanceof Error ? error.message : 'Invalid schedule.'); }
    try { preview.status = mapTastingImportStatus(row.status).status; } catch (error) { preview.errors.push(error instanceof Error ? error.message : 'Unknown status.'); }
    const agency = await db.agency.findMany({ where: { state: 'OH', OR: [{ id: row.agencyId }, { agencyId: row.agencyId }] }, select: { id: true, name: true }, take: 2 });
    if (agency.length !== 1) preview.errors.push('Agency ID must identify exactly one Ohio Retail account.');
    else { preview.agencyId = agency[0].id; preview.agencyName = agency[0].name; }
    const user = row.assignedTaster ? await db.user.findMany({ where: { organizationId: actor.organizationId, isActive: true, role: { not: 'PLATFORM_ADMIN' }, OR: [{ id: row.assignedTaster }, { email: { equals: row.assignedTaster, mode: 'insensitive' } }] }, select: { id: true, name: true, email: true }, take: 2 }) : [];
    if (user.length === 1) { preview.assignedTasterUserId = user[0].id; preview.assignedTasterName = user[0].name || user[0].email; }
    else { preview.needsReview = true; preview.warnings.push('Unmatched taster retained as import metadata. An administrator must assign an actual Neat user.'); }
    if (preview.status === 'Taster Needs Edit' && !row.responseComment) { preview.needsReview = true; preview.warnings.push('The spreadsheet does not include the required explanation. Review before continuing.'); }
    if (row.historicalBottles !== null) preview.warnings.push('Historical bottle count is retained as unverified spreadsheet metadata; imported retail sales determine the displayed outcome.');
    if (row.historicalSalesNote) preview.warnings.push('The original sales note is retained as metadata and does not establish a bottle count.');
    if (row.originalApprover) preview.warnings.push('Free-text approver is retained as metadata; no Neat Contact is guessed.');
    if (preview.status !== 'DRAFT') preview.warnings.push('Only the observed milestone is imported. Earlier approvals and their actors/timestamps are not assumed.');
    result.push(preview);
  }
  return result;
}

export function tastingImportKey(sourceKey: string, row: z.output<typeof tastingImportRowInput>) {
  const identity = row.rowKey || [row.date, row.startTime, row.endTime, row.agencyId, row.assignedTaster.toLowerCase()].join('|');
  return createHash('sha256').update(`${sourceKey.trim()}\n${identity}`).digest('hex');
}

/** Add-only import. A stable source key and row key preserve replay safety without rewriting Neat. */
export async function importTastings(db: TastingDb, actor: TastingActor, rows: readonly unknown[], sourceKey: string, now = new Date()) {
  const { organization } = await assertTastingActor(db, actor, true);
  if (!sourceKey.trim() || sourceKey.length > 200) throw new TastingError('Supply a stable import source key.');
  const preview = await previewTastingImport(db, actor, rows);
  if (preview.some(row => row.errors.length)) throw new TastingError('Resolve all import errors before importing.');
  await lockTastings(db, actor.organizationId);
  const created: TastingEvent[] = [];
  let skipped = 0;
  for (const row of preview) {
    const input = row.input!;
    const importKey = tastingImportKey(sourceKey, input);
    if (await db.tastingEvent.findUnique({ where: { organizationId_importKey: { organizationId: actor.organizationId, importKey } } })) { skipped++; continue; }
    const mapped = mapTastingImportStatus(input.status);
    const schedule = parseTastingSchedule(input.date, input.startTime, input.endTime);
    const data = { organizationId: actor.organizationId, agencyId: row.agencyId!, assignedTasterUserId: row.assignedTasterUserId, ...schedule, tasterNotes: input.tasterNotes, internalNotes: input.internalNotes, emailsGathered: input.emailsGathered, ...mapped.milestones, importNeedsReview: row.needsReview, importKey, createdByUserId: actor.userId, createdAt: now, importMetadata: { sourceKey: sourceKey.trim(), originalTaster: input.assignedTaster, originalAgencyId: input.agencyId, originalApprover: input.originalApprover || null, sourceEventKey: input.sourceEventKey || null, visibleStatus: mapped.status, historicalBottles: input.historicalBottles, historicalSalesNote: input.historicalSalesNote || null, sourceRowKey: input.rowKey || null, warnings: row.warnings, importedAt: now.toISOString(), milestoneActorsAndTimesUnverified: mapped.status !== 'DRAFT' } };
    if (!mapped.cancelled && mapped.milestones.agencyApproval !== 'DENIED' && mapped.milestones.stateApproval !== 'DENIED') await assertTastingSchedule(db, actor, data, tastingMinimumDays(organization.settings));
    const event = await db.tastingEvent.create({ data: { ...data,
      ...(mapped.milestones.tasterResponse === 'APPROVED' ? { approvedAssignment: { agencyId: data.agencyId, date: input.date, startsAt: schedule.startsAt.toISOString(), endsAt: schedule.endsAt.toISOString(), assignedTasterUserId: data.assignedTasterUserId } } : {}),
      ...(input.responseComment ? { tasterResponseComment: input.responseComment } : {}),
      // Import actor/time describes the imported cancellation observation, not a fabricated historical actor.
      ...(mapped.cancelled ? { cancelledAt: now, cancelledByUserId: actor.userId, cancellationReason: input.cancellationReason || 'Imported cancellation; historical cancellation details were not supplied.' } : {}),
    } });
    await writeTastingHistory(db, actor, event.id, 'SPREADSHEET_IMPORTED', null, { assignment: tastingAssignment(event), sourceKey: sourceKey.trim(), visibleStatus: mapped.status, observedMilestones: mapped.milestones as Prisma.InputJsonObject, historicalEvidenceUnverified: true }, 'Spreadsheet observation imported. Historical approvers and transition timestamps are unverified.', now);
    created.push(event);
  }
  return { created: created.length, skipped, review: created.filter(row => row.importNeedsReview).length, events: created, preview };
}
