import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  SOCIAL_RETIREMENT, SOCIAL_RETIREMENT_TABLES, socialRetirementConfiguration,
  socialRetirementReview, socialRetirementStatements,
} from '../scripts/retire-social-publishing';

const tstHost = 'ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech';
const qaHost = 'ep-raspy-water-avty6dw7-pooler.c-11.us-east-1.aws.neon.tech';
const now = Date.parse('2026-11-17T16:00:00Z');
function configuration(rehearsal = false, extra: string[] = []) {
  const host = rehearsal ? qaHost : tstHost;
  const target = rehearsal ? 'social-rehearsal' : 'neon-neat-tst';
  const environment = rehearsal ? 'development' : 'test';
  const env = `APP_ENV=${environment}\nDATABASE_ENVIRONMENT=${environment}\nDATABASE_TARGET_ID=${target}\nEXPECTED_DATABASE_HOST=${host}\nDATABASE_URL=postgresql://fixture:placeholder@${host}/neondb?sslmode=require\n`;
  const args = [`--env-file=ignored-fixture.env`, `--expected-host=${host}`, `--expected-target=${target}`, ...(rehearsal ? ['--rehearsal'] : []), ...extra];
  return { env, args, value: socialRetirementConfiguration(args, env) };
}
function inventory() {
  return {
    tables: [...SOCIAL_RETIREMENT_TABLES].sort(), enums: [],
    counts: Object.fromEntries(SOCIAL_RETIREMENT_TABLES.map(table => [table, table === 'SocialCredential' || table === 'SocialDestination' ? 6 : table === 'SocialGroup' ? 3 : 0])),
    tenants: [{ table: 'SocialGroup', organizationId: 'org_echo_spirits', count: 3 }],
    features: [{ organizationId: 'org_echo_spirits', enabled: false }],
    preferences: [{ organizationId: 'org_echo_spirits', liveEnabled: false }],
    media: { records: 0, bytes: 0 },
    deliveries: { pending: 0, activeLeases: 0, workflowRuns: 0, publicationStarted: 0, linkedWorklist: 0 },
    worklist: { records: 0, calendarRecords: 0, externalCalendarRecords: 0, originatingVisits: 0 },
    schemaFingerprint: 'fixture-reviewed-schema', outsideReferences: [],
  };
}
function review(current = inventory(), rehearsal = false) {
  const c = configuration(rehearsal).value;
  return { observedAt: new Date(now).toISOString(), target: c.target, host: c.host, environment: c.environment, rehearsal, apply: false, inventory: current, inventoryFingerprint: createHash('sha256').update(JSON.stringify(current)).digest('hex') };
}

describe('permanent Social retirement safety', () => {
  it('defaults to read-only inventory and derives the matching direct host without printing credentials', () => {
    const { value } = configuration();
    assert.equal(value.apply, false);
    assert.equal(value.rehearsal, false);
    assert.equal(value.direct.hostname, tstHost.replace('-pooler.', '.'));
  });

  it('rejects production, mislabeled, unknown QA and mismatched connection identities before a client is created', () => {
    const { args, env } = configuration();
    assert.throws(() => socialRetirementConfiguration(args.map(value => value.includes('--expected-host=') ? '--expected-host=ep-proud-recipe-amosj8m9-pooler.c-5.us-east-1.aws.neon.tech' : value), env));
    assert.throws(() => socialRetirementConfiguration(args, env.replace('APP_ENV=test', 'APP_ENV=production')));
    assert.throws(() => socialRetirementConfiguration(args, env.replace('DATABASE_TARGET_ID=neon-neat-tst', 'DATABASE_TARGET_ID=neon-production')));
    assert.throws(() => socialRetirementConfiguration([...args, '--rehearsal'], env));
    assert.throws(() => socialRetirementConfiguration(args, `${env}DIRECT_URL=postgresql://different:identity@${tstHost.replace('-pooler.', '.')}/neondb?sslmode=require\n`));
    assert.throws(() => socialRetirementConfiguration(args, env.replace('sslmode=require', 'sslmode=disable')));
    assert.throws(() => socialRetirementConfiguration([...args, '--receipt=../outside.json'], env));
  });

  it('requires explicit apply, pinned bytes, a reviewed inventory and recovery evidence', () => {
    const { args, env } = configuration();
    assert.throws(() => socialRetirementConfiguration([...args, '--apply'], env));
    assert.throws(() => socialRetirementConfiguration([...args, '--apply', '--checksum=unreviewed', '--reviewed-inventory=output/review.json', '--recovery-snapshot=snap-fixture'], env));
    assert.throws(() => socialRetirementConfiguration([...args, '--apply', `--checksum=${SOCIAL_RETIREMENT.checksum}`, '--reviewed-inventory=output/review.json'], env));
    assert.throws(() => socialRetirementConfiguration([...args, '--apply', '--apply'], env));
    const approved = configuration(false, ['--apply', `--checksum=${SOCIAL_RETIREMENT.checksum}`, '--reviewed-inventory=output/review.json', '--recovery-snapshot=snap-fixture']);
    assert.equal(approved.value.apply, true);
    const qa = configuration(true, ['--apply', `--checksum=${SOCIAL_RETIREMENT.checksum}`, '--reviewed-inventory=output/qa-review.json']);
    assert.equal(qa.value.rehearsal, true);
  });

  it('pins the migration and rejects whole-JSON replacement, unrelated feature deletion, CASCADE and changed table scope', () => {
    const sql = readFileSync(`prisma/migrations/${SOCIAL_RETIREMENT.name}/migration.sql`, 'utf8');
    const statements = socialRetirementStatements(sql);
    assert.equal(statements.length, 13);
    assert.equal(socialRetirementStatements(sql.replace(/\r?\n/g, '\r\n')).length, 13);
    assert.throws(() => socialRetirementStatements(sql.replace('"crmPreferences" - \'socialPublishing\'', "'{}'::jsonb")));
    assert.throws(() => socialRetirementStatements(sql.replace('WHERE "featureKey" = \'SOCIAL_PUBLISHING\'', '')));
    assert.throws(() => socialRetirementStatements(sql.replace('"SocialGroup";', '"SocialGroup" CASCADE;')));
    assert.throws(() => socialRetirementStatements(`${sql}\nDROP TABLE "User";\n`));
  });

  it('preserves the original applied Social migration bytes and removes only Social schema models', () => {
    const historical = [
      ['20261112170000_social_publishing_pilot', '0c2d2112f280c563da8e9f00538959e91884758ba42a8bd34d81153e3dcbb160'],
      ['20261112180000_social_workflow_dispatch', '6a250d31328b0876254477ccad876e072b80223633f6116ff8cf7ea0739bfee8'],
    ];
    for (const [name, checksum] of historical) assert.equal(createHash('sha256').update(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8').replace(/\r\n/g, '\n')).digest('hex'), checksum);
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    assert.doesNotMatch(schema, /model Social|SocialGroup\[\]|SocialCredential\[\]/);
    for (const retained of ['WorklistItem', 'OrganizationFeature', 'CalendarConnection', 'SupplyOrder', 'TastingEvent']) assert.ok(schema.includes(`model ${retained} {`));
  });

  it('rejects changed counts, schema, feature state or tampered review evidence', () => {
    const current = inventory(), c = configuration().value;
    socialRetirementReview(c, review(current), current, now);
    const changed = inventory(); changed.counts.SocialCredential += 1;
    assert.throws(() => socialRetirementReview(c, review(current), changed, now));
    changed.counts.SocialCredential -= 1; changed.schemaFingerprint = 'changed';
    assert.throws(() => socialRetirementReview(c, review(current), changed, now));
    assert.throws(() => socialRetirementReview(c, { ...review(current), inventoryFingerprint: 'tampered' }, current, now));
    assert.throws(() => socialRetirementReview(c, { ...review(current), target: 'production' }, current, now));
    assert.throws(() => socialRetirementReview(c, { ...review(current), apply: true }, current, now));
    assert.throws(() => socialRetirementReview(c, { ...review(current), observedAt: '2026-11-15T16:00:00Z' }, current, now));
  });

  it('refuses shared TST content, media, tasks, grants, live controls or unexpected tenants even when their counts were reviewed', () => {
    const mutations: Array<(value: ReturnType<typeof inventory>) => void> = [
      value => { value.counts.SocialPost = 1; },
      value => { value.media.records = 1; value.media.bytes = 5; },
      value => { value.worklist.records = 1; },
      value => { value.deliveries.workflowRuns = 1; },
      value => { value.features[0].enabled = true; },
      value => { value.preferences[0].liveEnabled = true; },
      value => { value.tenants[0].organizationId = 'other-tenant'; },
    ];
    for (const mutate of mutations) {
      const current = inventory(); mutate(current);
      assert.throws(() => socialRetirementReview(configuration().value, review(current), current, now));
    }
  });

  it('isolates the explicitly reviewed QA content exception and still refuses active workers, external calendar or Visit effects', () => {
    const current = inventory();
    current.counts.SocialPost = 32; current.counts.SocialRevision = 62;
    current.worklist.records = 8; current.deliveries.pending = 2;
    current.features[0].enabled = true;
    socialRetirementReview(configuration(true).value, review(current, true), current, now);
    assert.throws(() => socialRetirementReview(configuration().value, review(current, true), current, now));
    for (const key of ['externalCalendarRecords', 'originatingVisits'] as const) {
      current.worklist[key] = 1;
      assert.throws(() => socialRetirementReview(configuration(true).value, review(current, true), current, now));
      current.worklist[key] = 0;
    }
    current.deliveries.activeLeases = 1;
    assert.throws(() => socialRetirementReview(configuration(true).value, review(current, true), current, now));
  });
});
