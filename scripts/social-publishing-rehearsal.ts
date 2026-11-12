import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient, type Prisma, type UserRole } from '@prisma/client';
import { parseEnvironmentFile } from '../lib/environmentFile';

const MIGRATION = '20261112170000_social_publishing_pilot';
// Pass the independently reviewed on-disk checksum explicitly for migration writes.
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const prohibitedHosts = ['ep-proud-recipe-amosj8m9', 'ep-noisy-dew-avchokwr', 'ep-dry-bird-avmcqwk5'];
const directHost = (host: string) => host.replace('-pooler.', '.');
type Actor = { organizationId: string; userId: string; role: UserRole };

async function main() {
  const file = argument('env-file');
  const expectedHost = argument('expected-host');
  if (!file || !expectedHost) throw Error('Provide an explicit ignored env file and independently verified isolated expected-host.');
  const entries = parseEnvironmentFile(readFileSync(file, 'utf8'));
  const env = Object.fromEntries(entries);
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw Error('Duplicate environment keys are forbidden.');
  const configured = new URL(env.DATABASE_URL);
  if (env.APP_ENV !== 'development' || env.DATABASE_ENVIRONMENT !== 'development' || env.DATABASE_TARGET_ID !== 'social-rehearsal' || env.EXPECTED_DATABASE_HOST !== expectedHost || configured.hostname !== expectedHost || !expectedHost.endsWith('.neon.tech') || prohibitedHosts.some(value => expectedHost.includes(value))) throw Error('Only the independently verified isolated social-rehearsal child branch is allowed.');
  if (!['postgres:', 'postgresql:'].includes(configured.protocol) || !configured.username || !configured.password || configured.searchParams.get('sslmode') === 'disable') throw Error('A secured Postgres rehearsal connection is required.');
  for (const [key, value] of entries) process.env[key] = value;
  // Synthetic rehearsal never inherits a live switch from the calling shell.
  process.env.SOCIAL_LIVE_PUBLISHING_ENABLED = 'false';
  process.env.SOCIAL_JOBS_ENABLED = 'false';
  process.env.EMAIL_SEND_ENABLED = 'false';
  process.env.CALENDAR_SYNC_ENABLED = 'false';
  process.env.FILE_UPLOADS_ENABLED = 'false';
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ||= randomBytes(32).toString('base64url');
  const connection = new URL(env.DIRECT_URL || env.DATABASE_URL);
  connection.hostname = directHost(connection.hostname);
  if (connection.hostname !== directHost(expectedHost) || connection.username !== configured.username || connection.password !== configured.password || connection.pathname !== configured.pathname) throw Error('The direct rehearsal connection does not match the verified pooled identity.');
  const db = new PrismaClient({ datasourceUrl: connection.toString() });
  const passed: string[] = [];
  const check = (label: string) => { passed.push(label); console.log(`PASS ${label}`); };
  const sql = readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const protectedTables = ['Organization', 'User', 'LoggedVisit', 'WorklistItem', 'SupplyOrder', 'SupplyNeed', 'TastingEvent'];
  const baseline = async () => Object.fromEntries(await Promise.all(protectedTables.map(async table => {
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*)::bigint AS count FROM "${table}"`);
    return [table, String(rows[0].count)];
  })));
  try {
    await db.$queryRaw`SELECT 1`;
    const before = await baseline();
    const ledger = await db.$queryRaw<Array<{ checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=${MIGRATION}`;
    assert.ok(ledger.length <= 1 && ledger.every(row => row.checksum === checksum && row.finished_at && !row.rolled_back_at), 'Own migration ledger must be absent or an exact finished match.');
    if (!ledger.length) {
      if (!process.argv.includes('--apply-migration') || argument('checksum') !== checksum) throw Error('Applying this isolated migration requires --apply-migration and the exact reviewed --checksum.');
      const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
      assert.ok(statements.length > 10 && statements.every(statement => /^(?:CREATE TABLE "Social|CREATE (?:UNIQUE )?INDEX "Social|ALTER TABLE "Social)/.test(statement)), 'Only additive Social tables, indexes and foreign keys are permitted. Review a changed migration explicitly.');
      await db.$transaction(async tx => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        await tx.$executeRaw`INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES (${randomUUID()},${checksum},NOW(),${MIGRATION},NOW(),1)`;
      }, { timeout: 60_000 });
    }
    assert.deepEqual(await baseline(), before, 'The additive migration must preserve every protected existing row count.');
    check('Exact additive social migration preserves existing organization, user, Visit, Worklist, Supplies and Tastings counts.');
    const constraints = await db.$queryRaw<Array<{ name: string; validated: boolean }>>`SELECT conname AS name,convalidated AS validated FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relname LIKE 'Social%')`;
    assert.ok(constraints.length >= 20 && constraints.every(value => value.validated));
    check('Social primary, unique and tenant foreign-key constraints are present and validated.');
    mkdirSync('output', { recursive: true });
    if (process.argv.includes('--migration-only')) {
      writeFileSync('output/social-publishing-migration.json', JSON.stringify({ synthetic: true, target: 'social-rehearsal', migration: MIGRATION, checksum, before, after: await baseline(), passed }, null, 2));
      console.log(JSON.stringify({ migration: MIGRATION, checksum, checks: passed.length, liveProviderChecks: false }));
      return;
    }

    const service = await import('../lib/socialPublishing/service');
    const { encryptCalendarToken } = await import('../lib/calendar/crypto');
    const run = randomUUID().slice(0, 8);
    const organizationId = 'org_echo_spirits';
    await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const fixtureUsers = [
      { id: `social_qa_admin_${run}`, role: 'ADMIN' as const, name: 'Social QA Administrator' },
      { id: `social_qa_contributor_${run}`, role: 'USER' as const, name: 'Social QA Contributor' },
      { id: `social_qa_unassigned_${run}`, role: 'USER' as const, name: 'Social QA Unassigned' },
      { id: `social_qa_excluded_${run}`, role: 'ADMIN' as const, name: 'Social QA Excluded Administrator' },
    ];
    await db.user.createMany({ data: fixtureUsers.map(user => ({ ...user, organizationId, email: `${user.id}@example.invalid`, isActive: true })) });
    process.env.SOCIAL_PILOT_USER_IDS = fixtureUsers.slice(0, 3).map(user => user.id).join(',');
    await db.organizationFeature.upsert({ where: { organizationId_featureKey: { organizationId, featureKey: 'SOCIAL_PUBLISHING' } }, create: { organizationId, featureKey: 'SOCIAL_PUBLISHING', enabled: true }, update: { enabled: true } });
    const actors = fixtureUsers.map(user => ({ organizationId, userId: user.id, role: user.role }));
    const [admin, contributor, unassigned, excluded] = actors;
    const transaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(work, { timeout: 20_000 });
    await transaction(tx => service.setupSocialGroups(tx, admin));
    await transaction(tx => service.setupSocialGroups(tx, admin));
    const groups = await db.socialGroup.findMany({ where: { organizationId }, orderBy: { key: 'asc' } });
    assert.equal(groups.length, 3);
    assert.equal(await db.socialGroupMember.count({ where: { organizationId, userId: { in: fixtureUsers.map(user => user.id) } } }), 0);
    check('Initial three group labels are idempotent and grant no contributor access.');
    const group = groups.find(value => value.key === 'echo-spirits')!;
    await transaction(tx => service.setSocialGroupAccess(tx, admin, { groupId: group.id, userId: contributor.userId, enabled: true }));
    await assert.rejects(() => transaction(tx => service.assertSocialGroup(tx, unassigned, group.id)), /access/);
    await assert.rejects(() => transaction(tx => service.assertSocialActor(tx, excluded, true)), /unavailable/);
    await assert.rejects(() => transaction(tx => service.assertSocialActor(tx, { ...admin, organizationId: `other_${run}` }, true)), /unavailable/);
    await assert.rejects(() => transaction(tx => service.setupSocialGroups(tx, contributor)), /Administrator/);
    check('Tenant identity, explicit tester enrollment, assigned-group access and administrator actions are enforced by services.');

    const credential = await db.socialCredential.create({ data: { organizationId, provider: 'FACEBOOK', authorizationOwnerId: admin.userId, credentialsEncrypted: encryptCalendarToken(JSON.stringify({ accessToken: 'SYNTHETIC_NO_PROVIDER_ACCESS', scopes: ['pages_manage_posts'] })), scopes: ['pages_manage_posts'] } });
    const destination = await db.socialDestination.create({ data: { organizationId, credentialId: credential.id, groupId: group.id, provider: 'FACEBOOK', externalId: `SYNTHETIC_PAGE_${run}`, displayName: 'Simulated Facebook Page — QA only', metadata: { synthetic: true } } });
    const destination2 = await db.socialDestination.create({ data: { organizationId, credentialId: credential.id, groupId: group.id, provider: 'FACEBOOK', externalId: `SYNTHETIC_SECOND_PAGE_${run}`, displayName: 'Simulated second Page — QA only', metadata: { synthetic: true } } });
    await assert.rejects(() => db.socialDestination.create({ data: { organizationId, credentialId: credential.id, provider: 'FACEBOOK', externalId: destination.externalId, displayName: 'Duplicate synthetic Page' } }), /Unique constraint/);
    check('The database rejects duplicate external provider destinations within a tenant.');
    const media = await db.socialMedia.create({ data: { organizationId, groupId: group.id, createdByUserId: contributor.userId, storageKey: `synthetic/${run}.jpg`, fileName: 'synthetic-photo.jpg', mimeType: 'image/jpeg', bytes: 100_000, width: 1080, height: 1080, sha256: createHash('sha256').update(`synthetic-photo-${run}`).digest('hex') } });
    const makeDraft = async (title: string, extra: Record<string, unknown> = {}, dests = [destination.id]) => transaction(tx => service.saveSocialDraft(tx, contributor, { groupId: group.id, title, caption: 'Simulated photo; no provider write authorized.', note: 'Synthetic persisted rehearsal evidence.', proposedAt: new Date(Date.now() + 120_000).toISOString(), destinations: dests.map(destinationId => ({ destinationId, caption: 'Simulated photo; no provider write authorized.', format: 'IMAGE', mediaIds: [media.id] })), ...extra }));
    const submit = async (actor: Actor, postId: string) => { const post = await db.socialPost.findUniqueOrThrow({ where: { id: postId } }); await transaction(tx => service.submitSocialPost(tx, actor, { id: post.id, version: post.version })); };
    const approve = async (postId: string, action: 'APPROVE_NOW' | 'APPROVE_SCHEDULE' = 'APPROVE_NOW', actor: Actor = admin) => { const post = await db.socialPost.findUniqueOrThrow({ where: { id: postId } }); await transaction(tx => service.reviewSocialPost(tx, actor, { id: post.id, version: post.version, action })); };
    if (process.argv.includes('--manual-worklist-privacy-only')) {
      const { socialWorklistDetail, socialWorklistPostHref } = await import('../lib/socialPublishing/worklist');
      const { buildWorklistCalendarInput } = await import('../lib/calendar/scheduling');
      const caption = `PRIVATE_SOCIAL_CAPTION_${run}`;
      const reviewerNote = `PRIVATE_REVIEWER_NOTE_${run}`;
      const finishingNote = `PRIVATE_NATIVE_INSTRUCTIONS_${run}: add the reviewed native location tag.`;
      const draft = await makeDraft(`PRIVATE_SOCIAL_TITLE_${run}`, {
        caption, note: reviewerNote,
        destinations: [{ destinationId: destination.id, caption, format: 'IMAGE', mediaIds: [media.id], options: { manualInstructions: finishingNote } }],
      });
      await approve(draft.id);
      const delivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: draft.id } });
      assert.equal(delivery.mode, 'MANUAL'); assert.equal(delivery.status, 'MANUAL_READY'); assert.ok(delivery.worklistItemId);
      const task = await db.worklistItem.findUniqueOrThrow({ where: { id: delivery.worklistItemId }, include: { assignedToUser: true, calendarEvents: { include: { connection: true } } } });
      assert.equal(task.title, 'Finish an approved social post');
      assert.equal(task.detail, socialWorklistDetail(draft.id));
      assert.equal(socialWorklistPostHref(task.detail), `/social/${draft.id}`);
      assert.equal(task.assignedToUserId, admin.userId); assert.equal(task.createdByUserId, admin.userId);
      const privateValues = [draft.title, caption, reviewerNote, finishingNote, group.label, group.id, destination.displayName, destination.externalId, media.id, media.fileName, media.storageKey];
      const worklistText = `${task.title}\n${task.detail}`;
      for (const value of privateValues) assert.ok(!worklistText.includes(value), `Team Worklist must not contain protected social data: ${value === caption ? 'caption' : 'private field'}`);
      const calendar = buildWorklistCalendarInput({ item: task });
      for (const value of privateValues) assert.ok(!JSON.stringify(calendar).includes(value), 'Calendar export must not copy protected social content.');
      assert.ok(calendar.description?.includes(`/social/${draft.id}`));
      await assert.rejects(() => transaction(tx => service.assertSocialGroup(tx, unassigned, group.id)), /access/);
      check('Persisted manual tasks and calendar exports contain only a generic title and exact protected Social link, with no private post, group, destination, caption, instructions or media data.');
      await transaction(tx => service.confirmSocialManual(tx, admin, { deliveryId: delivery.id, postUrl: 'https://example.invalid/private-manual-fixture', note: 'Synthetic manual confirmation; no actual social post.' }));
      assert.equal((await db.worklistItem.findUniqueOrThrow({ where: { id: task.id } })).status, 'COMPLETED');
      check('The privacy-preserving task remains assigned to the approving administrator and completes through explicit manual confirmation.');
      for (const action of ['RETURN', 'CANCEL', 'EDIT'] as const) {
        const pendingPost = await makeDraft(`PRIVATE_PENDING_${action}_${run}`, { destinations: [{ destinationId: destination.id, caption, format: 'IMAGE', mediaIds: [media.id], options: { manualInstructions: finishingNote } }] });
        await approve(pendingPost.id);
        const pending = await db.socialDelivery.findFirstOrThrow({ where: { postId: pendingPost.id } });
        const current = await db.socialPost.findUniqueOrThrow({ where: { id: pendingPost.id } });
        if (action === 'EDIT') await makeDraft(`PRIVATE_REVISED_${run}`, { id: current.id, version: current.version });
        else await transaction(tx => service.reviewSocialPost(tx, admin, { id: current.id, version: current.version, action }));
        assert.equal((await db.worklistItem.findUniqueOrThrow({ where: { id: pending.worklistItemId! } })).status, 'CANCELLED');
      }
      check('Return, cancellation and revision edits still cancel pending manual Worklist tasks after removing private content.');
      writeFileSync('output/social-publishing-manual-worklist-privacy.json', JSON.stringify({ synthetic: true, target: 'social-rehearsal', passed, livePublishing: false, providerRequests: 0, taskContainsProtectedContent: false, calendarContainsProtectedContent: false }, null, 2));
      console.log(JSON.stringify({ checks: passed.length, regression: 'manual-worklist-privacy', livePublishing: false, taskContainsProtectedContent: false, calendarContainsProtectedContent: false })); return;
    }
    const reapproveReturned = async () => {
      const returned = await makeDraft('Return and reapprove unchanged future revision', { proposedAt: new Date(Date.now() + 3_600_000).toISOString() }, [destination.id, destination2.id]);
      await approve(returned.id, 'APPROVE_SCHEDULE');
      const deliveries = await db.socialDelivery.findMany({ where: { postId: returned.id }, orderBy: { destinationId: 'asc' } });
      await db.socialDelivery.update({ where: { id: deliveries[0].id }, data: { status: 'SIMULATED', confirmedAt: new Date() } });
      const successRevision = await db.socialRevision.findUniqueOrThrow({ where: { id: deliveries[0].revisionId } });
      const current = await db.socialPost.findUniqueOrThrow({ where: { id: returned.id } });
      await transaction(tx => service.reviewSocialPost(tx, admin, { id: current.id, version: current.version, action: 'RETURN' }));
      await submit(contributor, returned.id); await approve(returned.id, 'APPROVE_SCHEDULE');
      const after = await db.socialDelivery.findMany({ where: { postId: returned.id } });
      assert.equal(after.length, 3); assert.equal(after.filter(value => value.status === 'SIMULATED').length, 1); assert.equal(after.filter(value => value.status === 'QUEUED').length, 1);
      assert.notEqual(after.find(value => value.status === 'QUEUED')!.revisionId, successRevision.id);
      assert.equal((await db.socialRevision.findUniqueOrThrow({ where: { id: successRevision.id } })).approvedAt?.toISOString(), successRevision.approvedAt?.toISOString());
      check('Return, unchanged resubmission and future reapproval create a fresh pending revision without changing or resending the earlier successful destination.');
    };
    if (process.argv.includes('--return-reapproval-only')) {
      await reapproveReturned();
      writeFileSync('output/social-publishing-reapproval-regression.json', JSON.stringify({ synthetic: true, target: 'social-rehearsal', passed, livePublishing: false }, null, 2));
      console.log(JSON.stringify({ checks: passed.length, regression: 'return-unchanged-reapprove', livePublishing: false })); return;
    }
    if (process.argv.includes('--canonical-worker-only')) {
      const draft = await makeDraft('Canonical JSONB hash fresh worker regression'); await approve(draft.id);
      const delivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: draft.id } });
      const { processSocialDelivery } = await import('../lib/socialPublishing/worker');
      const saved = globalThis.fetch; let requests = 0;
      globalThis.fetch = async () => { requests++; throw Error('Provider requests are forbidden in this canonical-hash regression.'); };
      try {
        assert.equal((await processSocialDelivery(db, delivery.id)).status, 'SIMULATED');
        assert.equal(requests, 0); assert.equal(await db.socialAttempt.count({ where: { deliveryId: delivery.id } }), 1);
      } finally { globalThis.fetch = saved; }
      check('A freshly approved persisted JSONB revision passes the canonical integrity guard and executes one simulated worker attempt without provider requests.');
      writeFileSync('output/social-publishing-canonical-worker-regression.json', JSON.stringify({ synthetic: true, target: 'social-rehearsal', passed, livePublishing: false }, null, 2));
      console.log(JSON.stringify({ checks: passed.length, regression: 'canonical-jsonb-worker', livePublishing: false })); return;
    }
    const draft = await makeDraft('Simulated photo lifecycle');
    await assert.rejects(() => approve(draft.id, 'APPROVE_NOW', contributor), /Administrator/);
    assert.equal(await db.socialDelivery.count({ where: { postId: draft.id } }), 0);
    await submit(contributor, draft.id);
    await approve(draft.id);
    const delivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: draft.id } });
    assert.equal(delivery.mode, 'SIMULATED');
    check('Contributor submission requires explicit administrator approval and defaults to an immutable simulated delivery mode.');

    const current = await db.socialPost.findUniqueOrThrow({ where: { id: draft.id } });
    await makeDraft('Revised simulated photo lifecycle', { id: current.id, version: current.version });
    assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status, 'SUPERSEDED');
    assert.ok((await db.socialRevision.findUniqueOrThrow({ where: { id: delivery.revisionId } })).invalidatedAt);
    check('Editing approved content preserves the old revision and supersedes its pending delivery.');

    const past = await makeDraft('Passed proposal requires new approval time', { proposedAt: new Date(Date.now() - 60_000).toISOString() });
    await submit(contributor, past.id);
    await assert.rejects(() => approve(past.id, 'APPROVE_SCHEDULE'), /time has passed/);
    check('A past proposed time cannot schedule itself without a new administrator timing decision.');

    const canceled = await makeDraft('Canceled before simulated dispatch');
    await approve(canceled.id);
    const canceledCurrent = await db.socialPost.findUniqueOrThrow({ where: { id: canceled.id } });
    await transaction(tx => service.reviewSocialPost(tx, admin, { id: canceled.id, version: canceledCurrent.version, action: 'CANCEL' }));
    assert.equal((await db.socialDelivery.findFirstOrThrow({ where: { postId: canceled.id } })).status, 'CANCELED');
    check('Cancellation withdraws approval and cancels queued sends durably.');

    const race = await makeDraft('Repeated approval race');
    const raceVersion = (await db.socialPost.findUniqueOrThrow({ where: { id: race.id } })).version;
    const approvals = await Promise.allSettled([1, 2].map(() => transaction(tx => service.reviewSocialPost(tx, admin, { id: race.id, version: raceVersion, action: 'APPROVE_NOW' }))));
    assert.equal(approvals.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await db.socialDelivery.count({ where: { postId: race.id } }), 1);
    check('Concurrent repeated approve-now requests create exactly one queued destination delivery.');

    const partial = await makeDraft('Partial publication preserves success', {}, [destination.id, destination2.id]);
    await approve(partial.id);
    const partialRows = await db.socialDelivery.findMany({ where: { postId: partial.id }, orderBy: { destinationId: 'asc' } });
    await db.socialDelivery.update({ where: { id: partialRows[0].id }, data: { status: 'SIMULATED', confirmedAt: new Date() } });
    await db.socialDelivery.update({ where: { id: partialRows[1].id }, data: { status: 'FAILED' } });
    await transaction(tx => service.retrySocialDelivery(tx, admin, partialRows[1].id));
    assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: partialRows[0].id } })).status, 'SIMULATED');
    assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: partialRows[1].id } })).status, 'QUEUED');
    await db.socialDelivery.update({ where: { id: partialRows[1].id }, data: { status: 'NEEDS_ATTENTION', externalIds: { publicationStarted: true } } });
    await assert.rejects(() => transaction(tx => service.retrySocialDelivery(tx, admin, partialRows[1].id)), /Reconcile/);
    check('Partial retry preserves success and refuses to resend an ambiguous accepted publication.');
    const uncertainPost = await db.socialPost.findUniqueOrThrow({ where: { id: partial.id } });
    await assert.rejects(() => makeDraft('Forbidden replacement of an uncertain public send', { id: partial.id, version: uncertainPost.version }, [partialRows[1].destinationId]), /in progress|Reconcile|reconcile/);
    assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: partialRows[1].id } })).status, 'NEEDS_ATTENTION');
    check('An ambiguous started publication cannot be replaced by a revised draft or resent before reconciliation.');

    const manualDraft = async (title: string) => makeDraft(title, { destinations: [{ destinationId: destination.id, caption: 'Synthetic native finishing only.', format: 'IMAGE', mediaIds: [media.id], options: { manualInstructions: 'Synthetic native finishing: download reviewed image, add a location in the native app, and record the post URL.' } }] });
    const manual = await manualDraft('Manual finishing creates one canonical Worklist task');
    await approve(manual.id);
    const manualDelivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: manual.id } });
    assert.equal(manualDelivery.mode, 'MANUAL'); assert.equal(manualDelivery.status, 'MANUAL_READY'); assert.ok(manualDelivery.worklistItemId);
    assert.equal((await db.worklistItem.findUniqueOrThrow({ where: { id: manualDelivery.worklistItemId } })).status, 'OPEN');
    await assert.rejects(() => transaction(tx => service.confirmSocialManual(tx, contributor, { deliveryId: manualDelivery.id, postUrl: 'https://example.invalid/synthetic-manual' })), /Administrator/);
    await transaction(tx => service.confirmSocialManual(tx, admin, { deliveryId: manualDelivery.id, postUrl: 'https://example.invalid/synthetic-manual', note: 'Synthetic manual confirmation; no real public post.' }));
    assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: manualDelivery.id } })).status, 'MANUALLY_CONFIRMED');
    assert.equal((await db.worklistItem.findUniqueOrThrow({ where: { id: manualDelivery.worklistItemId } })).status, 'COMPLETED');
    check('Manual approval creates one canonical Worklist task and only explicit administrator confirmation completes it.');
    for (const action of ['RETURN', 'CANCEL'] as const) {
      const draft = await manualDraft(`Manual ${action.toLowerCase()} cancels its pending task`); await approve(draft.id);
      const pending = await db.socialDelivery.findFirstOrThrow({ where: { postId: draft.id } });
      const post = await db.socialPost.findUniqueOrThrow({ where: { id: draft.id } });
      await transaction(tx => service.reviewSocialPost(tx, admin, { id: post.id, version: post.version, action }));
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: pending.id } })).status, 'CANCELED');
      assert.equal((await db.worklistItem.findUniqueOrThrow({ where: { id: pending.worklistItemId! } })).status, 'CANCELLED');
    }
    check('Return-for-edits and cancellation both cancel the pending native-finishing Worklist task.');
    await reapproveReturned();

    const { processSocialDelivery } = await import('../lib/socialPublishing/worker');
    const queuedRace = await db.socialDelivery.findFirstOrThrow({ where: { postId: race.id } });
    const savedFetch = globalThis.fetch;
    let outboundRequests = 0;
    globalThis.fetch = async () => { outboundRequests++; throw Error('Provider network writes are forbidden during this synthetic rehearsal.'); };
    try {
      const workers = await Promise.all([processSocialDelivery(db, queuedRace.id), processSocialDelivery(db, queuedRace.id)]);
      assert.equal(workers.filter(result => result.claimed).length, 1);
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: queuedRace.id } })).status, 'SIMULATED');
      assert.equal(await db.socialAttempt.count({ where: { deliveryId: queuedRace.id } }), 1);
      assert.equal(outboundRequests, 0);
      check('Concurrent database workers claim a queued simulated delivery once and create one attempt without a provider request.');

      const oldWorker = await processSocialDelivery(db, delivery.id);
      assert.equal(oldWorker.claimed, false);
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status, 'SUPERSEDED');
      assert.equal((await processSocialDelivery(db, (await db.socialDelivery.findFirstOrThrow({ where: { postId: canceled.id } })).id)).claimed, false);
      check('Canceled and superseded stale jobs cannot be claimed or sent.');

      const late = await makeDraft('More than fifteen minutes late');
      await approve(late.id);
      const lateDelivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: late.id } });
      await db.socialDelivery.update({ where: { id: lateDelivery.id }, data: { scheduledAt: new Date(Date.now() - 16 * 60_000), nextAttemptAt: new Date(Date.now() - 16 * 60_000) } });
      await processSocialDelivery(db, lateDelivery.id);
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: lateDelivery.id } })).status, 'NEEDS_ATTENTION');
      check('An excessively late queued job is held for administrator review instead of bulk-published.');

      const remapped = await makeDraft('Mapping changes cannot redirect an approval');
      await approve(remapped.id);
      const remappedDelivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: remapped.id } });
      await transaction(tx => service.assignSocialDestination(tx, admin, { destinationId: destination.id, groupId: groups.find(value => value.id !== group.id)!.id }));
      await processSocialDelivery(db, remappedDelivery.id);
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: remappedDelivery.id } })).status, 'NEEDS_ATTENTION');
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: remappedDelivery.id } })).externalId, destination.externalId);
      await transaction(tx => service.assignSocialDestination(tx, admin, { destinationId: destination.id, groupId: group.id }));
      check('Changing a group mapping blocks an old approval while preserving its exact external destination identity.');

      const revoked = await makeDraft('Approver pilot access revoked');
      await approve(revoked.id);
      const revokedDelivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: revoked.id } });
      process.env.SOCIAL_PILOT_USER_IDS = `${contributor.userId},${unassigned.userId}`;
      await processSocialDelivery(db, revokedDelivery.id);
      assert.equal((await db.socialDelivery.findUniqueOrThrow({ where: { id: revokedDelivery.id } })).status, 'NEEDS_ATTENTION');
      process.env.SOCIAL_PILOT_USER_IDS = fixtureUsers.slice(0, 3).map(user => user.id).join(',');
      check('The worker rechecks current approver enrollment immediately before a send.');

      const paused = await makeDraft('Current database live pause stops an old workflow'); await approve(paused.id);
      const pausedDelivery = await db.socialDelivery.findFirstOrThrow({ where: { postId: paused.id } });
      // Synthetic live-mode row with all environment gates allowed, but current DB pause.
      // The provider-fetch trap remains active and no actual account token exists.
      await db.socialDelivery.update({ where: { id: pausedDelivery.id }, data: { mode: 'LIVE' } });
      const liveEnvKeys = ['APP_ENV', 'SOCIAL_LIVE_PUBLISHING_ENABLED', 'SOCIAL_LIVE_ENVIRONMENT', 'SOCIAL_LIVE_ORGANIZATION_ID', 'SOCIAL_LIVE_DESTINATION_IDS', 'SOCIAL_LIVE_NOT_BEFORE'] as const;
      const priorLiveEnv = Object.fromEntries(liveEnvKeys.map(key => [key, process.env[key]]));
      try {
        process.env.APP_ENV = 'test'; process.env.SOCIAL_LIVE_PUBLISHING_ENABLED = 'true'; process.env.SOCIAL_LIVE_ENVIRONMENT = 'test';
        process.env.SOCIAL_LIVE_ORGANIZATION_ID = organizationId; process.env.SOCIAL_LIVE_DESTINATION_IDS = destination.id; process.env.SOCIAL_LIVE_NOT_BEFORE = new Date(Date.now() - 3_600_000).toISOString();
        await transaction(tx => service.setSocialLiveControl(tx, admin, true));
        await transaction(tx => service.setSocialLiveControl(tx, admin, false));
        await processSocialDelivery(db, pausedDelivery.id);
        const held = await db.socialDelivery.findUniqueOrThrow({ where: { id: pausedDelivery.id } });
        assert.equal(held.status, 'NEEDS_ATTENTION'); assert.match(held.detail ?? '', /tenant live-publishing control is paused/i);
      } finally { for (const key of liveEnvKeys) { if (priorLiveEnv[key] === undefined) delete process.env[key]; else process.env[key] = priorLiveEnv[key]; } }
      check('The worker reloads the current tenant database live pause even when all pinned environment live gates allow a send.');
      assert.equal(outboundRequests, 0);
    } finally { globalThis.fetch = savedFetch; }

    const contributorWorkspace = await service.getSocialWorkspace(db, contributor);
    const unassignedWorkspace = await service.getSocialWorkspace(db, unassigned);
    assert.equal(contributorWorkspace.groups.length, 1);
    assert.equal(contributorWorkspace.users.length, 0);
    assert.equal(unassignedWorkspace.groups.length, 0);
    assert.equal(unassignedWorkspace.posts.length, 0);
    assert.equal(unassignedWorkspace.destinations.length, 0);
    assert.ok(!JSON.stringify(contributorWorkspace).includes('credentialsEncrypted'));
    check('Workspace reads omit unassigned groups/posts/destinations, the administrator user roster and encrypted credentials.');
    const sessions = await Promise.all(fixtureUsers.map(async user => {
      const token = randomBytes(32).toString('base64url');
      await db.userSession.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 6 * 3_600_000) } });
      return { role: user.role === 'ADMIN' ? user.id === excluded.userId ? 'EXCLUDED_ADMIN' : 'ADMIN' : user.id === contributor.userId ? 'CONTRIBUTOR' : 'UNASSIGNED', token, userId: user.id };
    }));
    const updated = new Map(entries);
    updated.set('SOCIAL_PILOT_USER_IDS', process.env.SOCIAL_PILOT_USER_IDS);
    updated.set('CALENDAR_TOKEN_ENCRYPTION_KEY', process.env.CALENDAR_TOKEN_ENCRYPTION_KEY!);
    writeFileSync(file, [...updated].map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
    writeFileSync('output/social-publishing-qa.json', JSON.stringify({ synthetic: true, rehearsal: true, target: 'social-rehearsal', groupId: group.id, destinationId: destination.id, mediaId: media.id, sessions, passed }, null, 2));
    writeFileSync('output/social-publishing-rehearsal-results.json', JSON.stringify({ synthetic: true, target: 'social-rehearsal', migration: MIGRATION, checksum, passed, liveAccountDiscovery: false, livePublishing: false }, null, 2));
    console.log(JSON.stringify({ checks: passed.length, syntheticBrowserFixturesReady: true, liveAccountDiscovery: false, livePublishing: false }));
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  const message = (error instanceof Error ? error.message : 'Unknown failure.').replace(/postgres(?:ql)?:\/\/[^\s"'`]+/g, '[redacted database URL]').replace(/(?:accessToken|refreshToken|credentialsEncrypted)\s*[:=]\s*[^\s,}]+/g, '[redacted credential]');
  console.error(`Social rehearsal failed: ${message.slice(0, 3000)}`);
  process.exitCode = 1;
});
