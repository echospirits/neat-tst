import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseEnvironmentFile } from '../lib/environmentFile';

export const SOCIAL_RETIREMENT = {
  name: '20261117120000_retire_social_publishing',
  checksum: '499b2481aa5c99f956c4dc47200514092fcdc007171819bcbcd85bf84c477ac5',
} as const;
export const SOCIAL_RETIREMENT_TABLES = [
  'SocialAttempt', 'SocialAudit', 'SocialDelivery', 'SocialRevision', 'SocialPost',
  'SocialMedia', 'SocialDestination', 'SocialOAuthState', 'SocialCredential',
  'SocialGroupMember', 'SocialGroup',
] as const;
const tstHost = 'ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech';
const rehearsalHost = 'ep-raspy-water-avty6dw7-pooler.c-11.us-east-1.aws.neon.tech';
const directHost = (host: string) => host.replace('-pooler.', '.');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function socialRetirementConfiguration(args: readonly string[], contents: string) {
  if (args.some(value => !['--apply', '--rehearsal'].includes(value) && !/^--(?:env-file|expected-host|expected-target|checksum|reviewed-inventory|recovery-snapshot|receipt)=.+$/.test(value))) throw Error('Unknown retirement argument.');
  const read = (name: string) => {
    const matches = args.filter(value => value.startsWith(`--${name}=`));
    if (matches.length > 1) throw Error('Duplicate retirement argument.');
    return matches[0]?.slice(name.length + 3);
  };
  if (args.filter(value => value === '--apply').length > 1 || args.filter(value => value === '--rehearsal').length > 1) throw Error('Duplicate retirement flag.');
  const file = read('env-file'), host = read('expected-host'), target = read('expected-target');
  if (!file || !host || !target) throw Error('Explicit environment file, host and target are required.');
  const entries = parseEnvironmentFile(contents), env = Object.fromEntries(entries);
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw Error('Duplicate environment keys are forbidden.');
  const rehearsal = args.includes('--rehearsal'), environment = rehearsal ? 'development' : 'test';
  if (host !== (rehearsal ? rehearsalHost : tstHost) || target !== (rehearsal ? 'social-rehearsal' : 'neon-neat-tst')) throw Error('Only exact reviewed Social QA or shared TST is allowed. Production is forbidden.');
  if (env.APP_ENV !== environment || env.DATABASE_ENVIRONMENT !== environment || env.DATABASE_TARGET_ID !== target || env.EXPECTED_DATABASE_HOST !== host) throw Error('Environment resource labels do not match the reviewed target.');
  const pooled = new URL(env.DATABASE_URL), direct = new URL(env.DIRECT_URL || env.DATABASE_URL);
  direct.hostname = directHost(direct.hostname);
  if (!['postgres:', 'postgresql:'].includes(pooled.protocol) || !['postgres:', 'postgresql:'].includes(direct.protocol) || pooled.hostname !== host || direct.hostname !== directHost(host) || !pooled.username || !pooled.password || direct.username !== pooled.username || direct.password !== pooled.password || direct.pathname !== pooled.pathname || !['require', 'verify-full'].includes(pooled.searchParams.get('sslmode') ?? '') || !['require', 'verify-full'].includes(direct.searchParams.get('sslmode') ?? '')) throw Error('Matching secured pooled/direct database identities are required.');
  const apply = args.includes('--apply'), checksum = read('checksum'), reviewedInventory = read('reviewed-inventory'), recoverySnapshot = read('recovery-snapshot');
  if (checksum && checksum !== SOCIAL_RETIREMENT.checksum) throw Error('Unexpected retirement checksum.');
  if (apply && (checksum !== SOCIAL_RETIREMENT.checksum || !/^[0-9a-f]{64}$/.test(SOCIAL_RETIREMENT.checksum) || !reviewedInventory || (!rehearsal && !/^snap-[a-z0-9-]+$/.test(recoverySnapshot ?? '')))) throw Error('Apply requires the reviewed checksum, inventory receipt and a shared-TST recovery snapshot.');
  const receipt = read('receipt') ?? 'output/social-retirement-inventory.json';
  assert.ok(path.resolve(receipt).startsWith(`${path.resolve('output')}${path.sep}`), 'Receipt must stay inside ignored workspace output.');
  return { file, host, target, environment, rehearsal, apply, direct, reviewedInventory, recoverySnapshot, receipt };
}

type Sql = Pick<Prisma.TransactionClient, '$queryRaw' | '$queryRawUnsafe'>;
export async function socialRetirementInventory(db: Sql) {
  const tables = await db.$queryRaw<Array<{ name: string }>>`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Social%' ORDER BY tablename`;
  const enums = await db.$queryRaw<Array<{ name: string }>>`SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' AND t.typname LIKE 'Social%' ORDER BY t.typname`;
  const allowed = new Set<string>(SOCIAL_RETIREMENT_TABLES);
  assert.ok(tables.every(table => allowed.has(table.name)), 'Unexpected Social table requires a separate review.');
  const counts: Record<string, number> = {};
  const tenants: Array<{ table: string; organizationId: string; count: number }> = [];
  for (const { name } of tables) {
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*)::bigint AS count FROM "${name}"`);
    counts[name] = Number(rows[0].count);
    if (name !== 'SocialAttempt') {
      const rows = await db.$queryRawUnsafe<Array<{ organizationId: string; count: bigint }>>(`SELECT "organizationId",count(*)::bigint AS count FROM "${name}" GROUP BY "organizationId" ORDER BY "organizationId"`);
      tenants.push(...rows.map(row => ({ table: name, organizationId: row.organizationId, count: Number(row.count) })));
    }
  }
  const features = await db.$queryRaw<Array<{ organizationId: string; enabled: boolean }>>`SELECT "organizationId",enabled FROM "OrganizationFeature" WHERE "featureKey"='SOCIAL_PUBLISHING' ORDER BY "organizationId"`;
  const preferences = await db.$queryRaw<Array<{ organizationId: string; liveEnabled: boolean }>>`SELECT id AS "organizationId",COALESCE("crmPreferences"->'socialPublishing'->>'liveEnabled','false')='true' AS "liveEnabled" FROM "Organization" WHERE "crmPreferences" ? 'socialPublishing' ORDER BY id`;
  let media = { records: 0, bytes: 0 };
  let deliveries = { pending: 0, activeLeases: 0, workflowRuns: 0, publicationStarted: 0, linkedWorklist: 0 };
  let worklist = { records: 0, calendarRecords: 0, externalCalendarRecords: 0, originatingVisits: 0 };
  if (tables.some(table => table.name === 'SocialMedia')) {
    const rows = await db.$queryRaw<Array<{ records: bigint; bytes: bigint }>>`SELECT count(*)::bigint AS records,COALESCE(sum(bytes),0)::bigint AS bytes FROM "SocialMedia"`;
    media = { records: Number(rows[0].records), bytes: Number(rows[0].bytes) };
  }
  if (tables.some(table => table.name === 'SocialDelivery')) {
    const rows = await db.$queryRaw<Array<{ pending: bigint; activeLeases: bigint; workflowRuns: bigint; publicationStarted: bigint; linkedWorklist: bigint }>>`SELECT count(*) FILTER(WHERE status IN ('QUEUED','RETRY','PROCESSING','MANUAL_READY'))::bigint AS pending,count(*) FILTER(WHERE "leaseUntil">NOW())::bigint AS "activeLeases",count(*) FILTER(WHERE "workflowRunId" IS NOT NULL)::bigint AS "workflowRuns",count(*) FILTER(WHERE "externalIds"->>'publicationStarted'='true')::bigint AS "publicationStarted",count(*) FILTER(WHERE "worklistItemId" IS NOT NULL)::bigint AS "linkedWorklist" FROM "SocialDelivery"`;
    deliveries = Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)])) as typeof deliveries;
  }
  const deliveryLink = tables.some(table => table.name === 'SocialDelivery') ? ' OR EXISTS(SELECT 1 FROM "SocialDelivery" d WHERE d."organizationId"=w."organizationId" AND d."worklistItemId"=w.id)' : '';
  const sideEffects = await db.$queryRawUnsafe<Array<{ records: bigint; calendarRecords: bigint; externalCalendarRecords: bigint; originatingVisits: bigint }>>(`WITH social_worklist AS (SELECT w.id FROM "WorklistItem" w WHERE w."submissionKey" LIKE 'social-manual:%' OR w.detail LIKE 'Reviewed social post: /social/%'${deliveryLink}) SELECT (SELECT count(*) FROM social_worklist)::bigint AS records,(SELECT count(*) FROM "WorklistCalendarEvent" c JOIN social_worklist w ON w.id=c."worklistItemId")::bigint AS "calendarRecords",(SELECT count(*) FROM "WorklistCalendarEvent" c JOIN social_worklist w ON w.id=c."worklistItemId" WHERE c."externalEventId" IS NOT NULL)::bigint AS "externalCalendarRecords",(SELECT count(*) FROM "LoggedVisit" v JOIN social_worklist w ON w.id=v."originatingWorklistItemId")::bigint AS "originatingVisits"`);
  worklist = Object.fromEntries(Object.entries(sideEffects[0]).map(([key, value]) => [key, Number(value)])) as typeof worklist;
  const schemaRows = await db.$queryRaw<Array<{ name: string; definition: string }>>`SELECT c.relname||'.'||a.attname AS name,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||COALESCE(pg_get_expr(d.adbin,d.adrelid),'') AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'Social%' AND a.attnum>0 AND NOT a.attisdropped ORDER BY name`;
  const outsideReferences = await db.$queryRaw<Array<{ table: string; name: string }>>`SELECT c.conrelid::regclass::text AS "table",c.conname AS name FROM pg_constraint c JOIN pg_class referenced ON referenced.oid=c.confrelid WHERE c.contype='f' AND referenced.relname LIKE 'Social%' AND c.conrelid NOT IN(SELECT oid FROM pg_class WHERE relname LIKE 'Social%' AND relnamespace='public'::regnamespace) ORDER BY "table",name`;
  return { tables: tables.map(table => table.name), enums: enums.map(value => value.name), counts, tenants, features, preferences, media, deliveries, worklist, schemaFingerprint: digest(schemaRows), outsideReferences };
}

type Configuration = ReturnType<typeof socialRetirementConfiguration>;
type Inventory = Awaited<ReturnType<typeof socialRetirementInventory>>;
export function socialRetirementStatements(sql: string) {
  const normalized = sql.replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'), SOCIAL_RETIREMENT.checksum, 'Retirement migration bytes differ from the reviewed checksum.');
  const statements = normalized.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
  const expected = [
    'DELETE FROM "public"."OrganizationFeature" WHERE "featureKey" = \'SOCIAL_PUBLISHING\'',
    'UPDATE "public"."Organization" SET "crmPreferences" = "crmPreferences" - \'socialPublishing\' WHERE "crmPreferences" ? \'socialPublishing\'',
    ...SOCIAL_RETIREMENT_TABLES.map(table => `DROP TABLE "public"."${table}"`),
  ];
  assert.deepEqual(statements.map(statement => statement.replace(/\s+/g, ' ')), expected, 'Only the exact Social feature/settings deletion and dependency-ordered table drops are allowed.');
  return statements;
}

export function socialRetirementReview(configuration: Configuration, review: unknown, current: Inventory, now = Date.now()) {
  assert.ok(review && typeof review === 'object', 'A reviewed dry-run receipt is required.');
  const value = review as Record<string, unknown>;
  assert.equal(value.target, configuration.target, 'Reviewed target differs.');
  assert.equal(value.host, configuration.host, 'Reviewed host differs.');
  assert.equal(value.environment, configuration.environment, 'Reviewed environment differs.');
  assert.equal(value.rehearsal, configuration.rehearsal, 'Reviewed rehearsal mode differs.');
  assert.equal(value.apply, false, 'Only a read-only inventory is a review receipt.');
  assert.ok(typeof value.observedAt === 'string', 'Inventory timestamp is required.');
  const observedAt = Date.parse(value.observedAt);
  assert.ok(Number.isFinite(observedAt) && observedAt <= now + 60_000 && now - observedAt <= 24 * 60 * 60_000, 'Reviewed inventory is stale or future-dated.');
  assert.equal(value.inventoryFingerprint, digest(value.inventory), 'Reviewed inventory was altered.');
  assert.equal(value.inventoryFingerprint, digest(current), 'Social records, settings or schema changed after review.');
  assert.deepEqual(current.tables, [...SOCIAL_RETIREMENT_TABLES].sort(), 'All eleven expected Social tables must exist.');
  assert.equal(current.enums.length, 0, 'Unexpected Social enums require a new migration review.');
  assert.equal(current.outsideReferences.length, 0, 'Unrelated foreign keys prevent retirement.');
  assert.ok(current.tenants.every(value => value.organizationId === 'org_echo_spirits') && current.features.every(value => value.organizationId === 'org_echo_spirits') && current.preferences.every(value => value.organizationId === 'org_echo_spirits'), 'Unexpected tenant data requires separate review.');
  assert.ok(current.preferences.every(value => !value.liveEnabled), 'Tenant live publishing must be paused.');
  assert.equal(current.deliveries.activeLeases, 0, 'An active worker prevents retirement.');
  assert.equal(current.worklist.externalCalendarRecords, 0, 'External calendar events require separate cleanup.');
  assert.equal(current.worklist.originatingVisits, 0, 'Originating Visits require separate review.');
  if (!configuration.rehearsal) {
    assert.ok(current.features.every(value => !value.enabled), 'Disable Social access before shared-TST retirement.');
    for (const table of SOCIAL_RETIREMENT_TABLES) if (!['SocialGroup', 'SocialCredential', 'SocialDestination'].includes(table)) assert.equal(current.counts[table], 0, 'Shared TST content or task data requires separate review.');
    assert.deepEqual(current.media, { records: 0, bytes: 0 });
    assert.deepEqual(current.deliveries, { pending: 0, activeLeases: 0, workflowRuns: 0, publicationStarted: 0, linkedWorklist: 0 });
    assert.deepEqual(current.worklist, { records: 0, calendarRecords: 0, externalCalendarRecords: 0, originatingVisits: 0 });
  }
}

export async function socialRetirementProtectedSnapshot(db: Sql) {
  const protectedTables = ['Organization', 'OrganizationFeature', 'User', 'WorklistItem', 'WorklistCalendarEvent', 'LoggedVisit', 'CalendarConnection', 'CalendarOAuthState', 'SupplyOrder', 'SupplyNeed', 'SupplySource', 'SupplyShipment', 'TastingEvent', 'AccountActivity', '_prisma_migrations'];
  const rows: Array<{ table: string; count: number; fingerprint: string }> = [];
  for (const table of protectedTables) {
    const expression = table === 'Organization' ? `to_jsonb(t)||jsonb_build_object('crmPreferences',t."crmPreferences"-'socialPublishing')` : 'to_jsonb(t)';
    const filter = table === 'OrganizationFeature' ? `WHERE "featureKey"<>'SOCIAL_PUBLISHING'` : table === '_prisma_migrations' ? `WHERE migration_name<>'${SOCIAL_RETIREMENT.name}'` : '';
    const values = await db.$queryRawUnsafe<Array<{ count: bigint; fingerprint: string }>>(`SELECT count(*)::bigint AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS fingerprint FROM(SELECT md5((${expression})::text) AS row_hash FROM "public"."${table}" t ${filter}) protected_rows`);
    rows.push({ table, count: Number(values[0].count), fingerprint: values[0].fingerprint });
  }
  const structure = await db.$queryRaw<Array<{ name: string; definition: string }>>`SELECT c.relname||'.'||a.attname AS name,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||COALESCE(pg_get_expr(d.adbin,d.adrelid),'') AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT LIKE 'Social%' AND a.attnum>0 AND NOT a.attisdropped ORDER BY name`;
  return { rows, nonSocialStructureFingerprint: digest(structure) };
}

async function applyRetirement(db: PrismaClient, configuration: Configuration) {
  assert.ok(configuration.reviewedInventory);
  const review: unknown = JSON.parse(readFileSync(configuration.reviewedInventory, 'utf8'));
  const statements = socialRetirementStatements(readFileSync(path.join('prisma', 'migrations', SOCIAL_RETIREMENT.name, 'migration.sql'), 'utf8'));
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
    await tx.$executeRaw`SET LOCAL statement_timeout='60s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('social-publishing-retirement',0))`;
    await tx.$executeRawUnsafe(`LOCK TABLE ${SOCIAL_RETIREMENT_TABLES.map(table => `"public"."${table}"`).join(',')} IN ACCESS EXCLUSIVE MODE`);
    await tx.$executeRaw`LOCK TABLE "public"."Organization","public"."OrganizationFeature","public"."_prisma_migrations" IN SHARE ROW EXCLUSIVE MODE`;
    const ownLedger = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE migration_name=${SOCIAL_RETIREMENT.name}`;
    assert.equal(Number(ownLedger[0].count), 0, 'Retirement is already recorded; do not reapply.');
    const sourceLedger = await tx.$queryRaw<Array<{ migration_name: string; checksum: string; finished: boolean; rolledBack: boolean }>>`SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" WHERE migration_name IN ('20261112170000_social_publishing_pilot','20261112180000_social_workflow_dispatch') ORDER BY migration_name`;
    assert.deepEqual(sourceLedger, [
      { migration_name: '20261112170000_social_publishing_pilot', checksum: '0c2d2112f280c563da8e9f00538959e91884758ba42a8bd34d81153e3dcbb160', finished: true, rolledBack: false },
      { migration_name: '20261112180000_social_workflow_dispatch', checksum: '6a250d31328b0876254477ccad876e072b80223633f6116ff8cf7ea0739bfee8', finished: true, rolledBack: false },
    ], 'Historical Social migration identity must be intact.');
    const before = await socialRetirementInventory(tx);
    socialRetirementReview(configuration, review, before);
    const protectedBefore = await socialRetirementProtectedSnapshot(tx);
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    await tx.$executeRaw`INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES(${randomUUID()},${SOCIAL_RETIREMENT.checksum},NOW(),${SOCIAL_RETIREMENT.name},NOW(),1)`;
    const after = await socialRetirementInventory(tx);
    assert.equal(after.tables.length, 0);
    assert.equal(after.enums.length, 0);
    assert.equal(after.features.length, 0);
    assert.equal(after.preferences.length, 0);
    assert.deepEqual(after.worklist, before.worklist, 'Existing Worklist/calendar/Visit references must be unchanged.');
    const protectedAfter = await socialRetirementProtectedSnapshot(tx);
    assert.deepEqual(protectedAfter, protectedBefore, 'Unrelated rows, other JSON settings, feature grants, schema or historical migration ledger changed.');
    return { before, after, reviewedInventoryFingerprint: digest(before), protectedRecords: protectedAfter, unrelatedRecordsUnchanged: true, nonSocialSchemaUnchanged: true, historicalMigrationsUnchanged: true };
  }, { isolationLevel: 'Serializable', timeout: 120_000 });
}

async function main() {
  const args = process.argv.slice(2), file = args.find(value => value.startsWith('--env-file='))?.slice(11);
  if (!file) throw Error('An explicit ignored environment file is required.');
  const configuration = socialRetirementConfiguration(args, readFileSync(file, 'utf8'));
  mkdirSync(path.dirname(path.resolve(configuration.receipt)), { recursive: true });
  const db = new PrismaClient({ datasourceUrl: configuration.direct.toString() });
  try {
    if (configuration.apply) {
      const result = await applyRetirement(db, configuration);
      const receipt = { observedAt: new Date().toISOString(), target: configuration.target, host: configuration.host, environment: configuration.environment, rehearsal: configuration.rehearsal, apply: true, migration: SOCIAL_RETIREMENT, recoverySnapshot: configuration.recoverySnapshot, ...result };
      saveReceipt(configuration.receipt, receipt);
      console.log(JSON.stringify(receipt));
      return;
    }
    const inventory = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return socialRetirementInventory(tx);
    }, { isolationLevel: 'RepeatableRead', timeout: 60_000 });
    const receipt = { observedAt: new Date().toISOString(), target: configuration.target, host: configuration.host, environment: configuration.environment, rehearsal: configuration.rehearsal, apply: false, inventory, inventoryFingerprint: digest(inventory) };
    saveReceipt(configuration.receipt, receipt);
    console.log(JSON.stringify(receipt));
  } finally { await db.$disconnect(); }
}

function saveReceipt(file: string, receipt: unknown) {
  const receiptPath = path.resolve(file);
  assert.ok(receiptPath.startsWith(`${path.resolve('output')}${path.sep}`), 'Receipt must stay inside ignored workspace output.');
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/retire-social-publishing.ts')) {
  main().catch((error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const meta = error && typeof error === 'object' && 'meta' in error && error.meta && typeof error.meta === 'object' ? error.meta : {};
    const sqlState = 'code' in meta ? String(meta.code) : '';
    console.error(JSON.stringify({ status: 'Social retirement stopped; no secret data logged.', code: /^P\d{4}$/.test(code) ? code : 'GUARD_OR_CONFIGURATION', sqlState: /^[A-Z0-9]{5}$/.test(sqlState) ? sqlState : undefined }));
    process.exitCode = 1;
  });
}
