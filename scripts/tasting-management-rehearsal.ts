import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient, UserRole } from '@prisma/client';
import { tastingMigrationConfiguration } from './tasting-management';
import { saveTasting, transitionTasting, type TastingActor } from '../lib/tastings/service';
import { importTastings, previewTastingImport } from '../lib/tastings/import';
import { parseTastingSchedule, tastingDateKey } from '../lib/tastings/time';
import { completeTastingFromVisit, tastingScheduleFingerprint } from '../lib/tastings/execution';
import { refreshTastingSales } from '../lib/tastings/sales';

async function main() {
  const context = tastingMigrationConfiguration();
  if (!context.rehearsal || context.target !== 'tasting-phase1-rehearsal' || context.host !== 'ep-wispy-wave-ave26igj-pooler.c-11.us-east-1.aws.neon.tech') throw new Error('Acceptance fixtures are restricted to this explicitly identified isolated tasting rehearsal branch.');
  const db = new PrismaClient({ datasourceUrl: context.connection.toString() });
  const run = randomUUID().slice(0, 8);
  const organizationId = `tasting-rehearsal-${run}`;
  const checks: string[] = [];
  try {
    const organization = await db.organization.create({ data: { id: organizationId, name: `Tasting Rehearsal ${run}`, displayName: 'Tasting Rehearsal', slug: organizationId, accountStatus: 'ACTIVE', onboardingStatus: 'READY' } });
    await db.organizationFeature.create({ data: { organizationId, featureKey: 'TASTING_MANAGEMENT', enabled: true, source: 'isolated-rehearsal' } });
    const users = await Promise.all(['admin', 'taster', 'other'].map((kind, index) => db.user.create({ data: { organizationId, email: `${organizationId}-${kind}@example.invalid`, name: `Fixture ${kind}`, role: index === 0 ? UserRole.ADMIN : UserRole.TASTER } })));
    const admin: TastingActor = { organizationId, userId: users[0].id, role: UserRole.ADMIN };
    const taster: TastingActor = { organizationId, userId: users[1].id, role: UserRole.TASTER };
    const agency = await db.agency.create({ data: { agencyId: `TM-${run}`, name: 'Synthetic Tasting Rehearsal Retail', state: 'OH', address: '123 Fixture Street', city: 'Columbus', zip: '43215' } });
    const otherAgency = await db.agency.create({ data: { agencyId: `TM2-${run}`, name: 'Synthetic Other Retail', state: 'OH' } });
    const create = (date: string, extra: Record<string, unknown> = {}) => ({ agencyId: agency.id, assignedTasterUserId: taster.userId, date, startTime: '16:00', endTime: '18:00', submissionKey: randomUUID(), ...extra });
    let event = await db.$transaction(tx => saveTasting(tx, admin, create('2031-01-20')));
    checks.push('draft persistence');
    event = await db.$transaction(tx => transitionTasting(tx, taster, { id: event.id, version: event.version, action: 'TASTER_APPROVE' }));
    assert.equal((event.approvedAssignment as Record<string, unknown>).startsAt, event.startsAt.toISOString());
    for (const action of ['REQUEST_AGENCY_APPROVAL', 'AGENCY_APPROVE', 'SUBMIT_TO_STATE', 'STATE_APPROVE']) event = await db.$transaction(tx => transitionTasting(tx, admin, { id: event.id, version: event.version, action }));
    assert.equal(event.stateApproval, 'APPROVED'); checks.push('taster/Agency/state persisted milestones and approval fingerprint');
    event = await db.$transaction(tx => saveTasting(tx, admin, create('2031-01-21', { id: event.id, version: event.version })));
    assert.equal(event.tasterResponse, 'PENDING'); assert.equal(event.agencyApproval, 'NOT_REQUESTED'); assert.equal(event.stateApproval, 'NOT_SUBMITTED');
    assert.equal(await db.tastingWorkflowEvent.count({ where: { organizationId, tastingEventId: event.id, type: 'STATE_APPROVED' } }), 1); checks.push('reschedule resets current approvals and retains prior history');
    await assert.rejects(db.$transaction(tx => saveTasting(tx, admin, create('2031-01-25'))), /Allow 10 days/);
    await db.$transaction(tx => saveTasting(tx, admin, create('2031-01-25', { spacingOverrideReason: 'Synthetic admin override for spacing acceptance.' })));
    assert.equal(await db.tastingWorkflowEvent.count({ where: { organizationId, type: 'SPACING_OVERRIDE' } }), 1); checks.push('spacing blocked and reasoned admin override audited');
    const concurrent = await Promise.allSettled([
      db.$transaction(tx => saveTasting(tx, admin, create('2031-05-20'))),
      db.$transaction(tx => saveTasting(tx, admin, create('2031-05-20', { agencyId: otherAgency.id }))),
    ]);
    assert.equal(concurrent.filter(value => value.status === 'fulfilled').length, 1); checks.push('concurrent overlapping assignments serialize and allow only one');
    const foreignOrganization = await db.organization.create({ data: { id: `${organizationId}-foreign`, name: 'Synthetic Foreign Tenant', displayName: 'Synthetic Foreign', slug: `${organizationId}-foreign`, accountStatus: 'ACTIVE' } });
    const foreignUser = await db.user.create({ data: { organizationId: foreignOrganization.id, email: `${organizationId}-foreign@example.invalid`, name: 'Synthetic Foreign User' } });
    await assert.rejects(db.tastingEvent.create({ data: { organizationId, agencyId: agency.id, assignedTasterUserId: foreignUser.id, ...parseTastingSchedule('2031-08-15', '16:00', '18:00'), createdByUserId: admin.userId } }));
    await assert.rejects(db.$transaction(tx => transitionTasting(tx, { ...admin, organizationId: foreignOrganization.id }, { id: event.id, version: event.version, action: 'CANCEL', comment: 'Foreign edit must fail.' })), /unavailable/);
    checks.push('composite tenant FK and service isolation reject cross-tenant assignment/edit');
    const row = { date: '2031-09-20', startTime: '16:00', endTime: '18:00', agencyId: agency.agencyId, assignedTaster: users[1].email, status: 'Agency Approved' };
    const imported = await db.$transaction(tx => importTastings(tx, admin, [row], `${organizationId}-source`));
    const replay = await db.$transaction(tx => importTastings(tx, admin, [row], `${organizationId}-source`));
    assert.equal(imported.created, 1); assert.equal(replay.skipped, 1); assert.equal(imported.events[0].tasterResponse, 'PENDING'); assert.equal(imported.events[0].agencyApproval, 'APPROVED');
    const unmatched = await previewTastingImport(db, admin, [{ ...row, assignedTaster: 'Original Unmatched Person' }]);
    assert.equal(unmatched[0].assignedTasterUserId, null); assert.equal(unmatched[0].needsReview, true); checks.push('spreadsheet observed milestone mapping, unmatched-name review and add-only replay');

    const executionNow = new Date();
    const today = tastingDateKey(executionNow);
    const execution = await db.$transaction(tx => saveTasting(tx, admin, create(today)));
    const visit = await db.loggedVisit.create({ data: { organizationId, tastingEventId: execution.id, agencyId: agency.id, locationType: 'agency', createdByUserId: taster.userId, visitAt: executionNow, summary: 'Synthetic persisted proof rehearsal' } });
    await assert.rejects(db.$transaction(tx => completeTastingFromVisit(tx, taster, { tastingId: execution.id, visitId: visit.id, fingerprint: tastingScheduleFingerprint(execution), now: executionNow })), /verified photo/);
    assert.equal((await db.tastingEvent.findUniqueOrThrow({ where: { id: execution.id } })).completedAt, null);
    await db.visitPhoto.create({ data: { organizationId, loggedVisitId: visit.id, type: 'OTHER', url: 'https://example.invalid/synthetic-proof.jpg', storageKey: `rehearsal/${run}/proof.jpg`, contentType: 'image/jpeg', sizeBytes: 32, createdByUserId: taster.userId } });
    const completed = await db.$transaction(tx => completeTastingFromVisit(tx, taster, { tastingId: execution.id, visitId: visit.id, fingerprint: tastingScheduleFingerprint(execution), now: executionNow }));
    assert.equal(completed.completedVisitId, visit.id);
    await db.$transaction(tx => completeTastingFromVisit(tx, taster, { tastingId: execution.id, visitId: visit.id, fingerprint: tastingScheduleFingerprint(execution), now: executionNow }));
    assert.equal(await db.tastingWorkflowEvent.count({ where: { organizationId, tastingEventId: execution.id, type: 'TASTING_COMPLETED' } }), 1);
    checks.push('completion requires persisted photo metadata and links exactly one same-day canonical Visit; replay idempotent');

    const productRun = run.toUpperCase();
    const salesDay = new Date(Date.UTC(2035, 0, 1 + parseInt(run.slice(0, 4), 16))).toISOString().slice(0, 10);
    if (await db.ohlqReportImportStatus.findUnique({ where: { dataSource_reportDate: { dataSource: 'ANNUAL_SALES_SUMMARY', reportDate: new Date(salesDay) } } })) throw new Error('Synthetic report date is already occupied; choose a new fixture date.');
    await db.organizationProduct.createMany({ data: [{ organizationId, externalItemCode: `QAOWN-${productRun}`, status: 'OWNED' }, { organizationId, externalItemCode: `QAREP-${productRun}`, status: 'REPRESENTED' }, { organizationId, externalItemCode: `QAOUT-${productRun}`, status: 'EXCLUDED' }] });
    const salesEvent = await db.$transaction(tx => saveTasting(tx, admin, create(salesDay)));
    await db.ohlqAnnualSalesRow.createMany({ data: [{ reportDate: new Date(salesDay), agencyId: agency.agencyId, vendor: run, brand: `QAOWN-${productRun}`, retailBottlesSold: 5 }, { reportDate: new Date(salesDay), agencyId: agency.agencyId, vendor: run, brand: `QAREP-${productRun}`, retailBottlesSold: 2 }, { reportDate: new Date(salesDay), agencyId: agency.agencyId, vendor: run, brand: `QAOUT-${productRun}`, retailBottlesSold: 100 }] });
    await db.ohlqReportImportStatus.create({ data: { dataSource: 'ANNUAL_SALES_SUMMARY', reportDate: new Date(salesDay), status: 'COMPLETED', rowCount: 3, parsedRows: 3, skippedRows: 0 } });
    await refreshTastingSales(db, organizationId, salesEvent.id);
    assert.equal((await db.tastingEvent.findUniqueOrThrow({ where: { id: salesEvent.id } })).retailBottlesSold, 7);
    await refreshTastingSales(db, organizationId, salesEvent.id);
    assert.equal(await db.tastingWorkflowEvent.count({ where: { organizationId, tastingEventId: salesEvent.id, type: 'SALES_OUTCOME_UPDATED' } }), 1);
    await db.ohlqAnnualSalesRow.update({ where: { reportDate_agencyId_vendor_brand: { reportDate: new Date(salesDay), agencyId: agency.agencyId, vendor: run, brand: `QAOWN-${productRun}` } }, data: { retailBottlesSold: 8 } });
    await db.ohlqReportImportStatus.update({ where: { dataSource_reportDate: { dataSource: 'ANNUAL_SALES_SUMMARY', reportDate: new Date(salesDay) } }, data: { updatedAt: new Date(Date.now() + 1000) } });
    await refreshTastingSales(db, organizationId, salesEvent.id);
    assert.equal((await db.tastingEvent.findUniqueOrThrow({ where: { id: salesEvent.id } })).retailBottlesSold, 10);
    const missingDay = new Date(`${salesDay}T00:00Z`); missingDay.setUTCDate(missingDay.getUTCDate() + 30);
    const missing = await db.$transaction(tx => saveTasting(tx, admin, create(missingDay.toISOString().slice(0, 10))));
    assert.equal((await refreshTastingSales(db, organizationId, missing.id)).available, false);
    assert.equal((await db.tastingEvent.findUniqueOrThrow({ where: { id: missing.id } })).retailBottlesSold, null);
    checks.push('retail sales include only owned/represented products; replay no-ops, correction recalculates, missing stays unknown');

    // Dedicated, passwordless users/sessions are created only on this isolated branch.
    // Session secrets are written only to ignored local QA output and never printed.
    const echoId = 'org_echo_spirits';
    await db.organization.findUniqueOrThrow({ where: { id: echoId } });
    const qaUsers = await Promise.all([{ role: UserRole.ADMIN, name: 'Tasting QA Coordinator' }, { role: UserRole.TASTER, name: 'Tasting QA Taster' }].map((value, index) => db.user.create({ data: { organizationId: echoId, email: `tasting-qa-${run}-${index}@example.invalid`, role: value.role, name: value.name } })));
    const sessions = await Promise.all(qaUsers.map(async user => {
      const token = randomBytes(32).toString('base64url');
      await db.userSession.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 2 * 86_400_000) } });
      return { userId: user.id, role: user.role, token };
    }));
    const qaActor: TastingActor = { organizationId: echoId, userId: qaUsers[0].id, role: UserRole.ADMIN };
    const uiAgency = await db.agency.create({ data: { agencyId: `QA-${run}`, name: 'Tasting QA Market — synthetic', state: 'OH', address: '3510 Clark-Shaw Road', city: 'Powell', zip: '43065', latitude: 40.1709, longitude: -83.1127 } });
    const uiCreate = (date: string, extra: Record<string, unknown> = {}) => ({ agencyId: uiAgency.id, assignedTasterUserId: qaUsers[1].id, date, startTime: '16:00', endTime: '18:00', tasterNotes: 'Synthetic QA: ask for the manager, set up at the tasting table, and upload the required photo.', internalNotes: 'Synthetic coordinator notes; should be hidden from the assigned taster.', submissionKey: randomUUID(), ...extra });
    const uiTasting = await db.$transaction(tx => saveTasting(tx, qaActor, uiCreate(today)));
    const futureDay = new Date(`${today}T00:00Z`); futureDay.setUTCDate(futureDay.getUTCDate() + 14);
    const uiFuture = await db.$transaction(tx => saveTasting(tx, qaActor, uiCreate(futureDay.toISOString().slice(0, 10))));
    mkdirSync('output', { recursive: true });
    writeFileSync('output/tasting-qa.json', JSON.stringify({ rehearsal: true, synthetic: true, run, target: context.target, host: context.host, organizationId: echoId, agencyId: uiAgency.id, tastingId: uiTasting.id, futureTastingId: uiFuture.id, sessions, checks }, null, 2));
    writeFileSync('output/tasting-rehearsal-evidence.json', JSON.stringify({ rehearsal: true, run, target: context.target, host: context.host, fixtureOrganizationId: organization.id, checks, syntheticPhotoMetadataOnly: true, liveProviderUploadVerified: false, existingRowsDeleted: 0 }, null, 2));
    console.log(JSON.stringify({ target: context.target, host: context.host, checks: checks.length, allPassed: true, uiFixtureReady: true, qaFile: 'output/tasting-qa.json', evidenceFile: 'output/tasting-rehearsal-evidence.json', existingRowsDeleted: 0 }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Tasting rehearsal failed.'); process.exitCode = 1; });
