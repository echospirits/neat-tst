import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SOCIAL_MIGRATIONS, SOCIAL_TST_HOST, socialMigrationConfiguration, socialMigrationStatements } from '../scripts/social-publishing-migration';

const tstArgs = ['--env-file=.env.social.tst.local', `--expected-host=${SOCIAL_TST_HOST}`, '--expected-target=neon-neat-tst'];
const environment = (host = SOCIAL_TST_HOST, target = 'neon-neat-tst', app = 'test') => [
  `APP_ENV=${app}`, `DATABASE_ENVIRONMENT=${app}`, `DATABASE_TARGET_ID=${target}`, `EXPECTED_DATABASE_HOST=${host}`,
  `DATABASE_URL=postgresql://synthetic:synthetic@${host}/neondb?sslmode=require`,
].join('\n');

describe('Selected Social migrations — target and exact-SQL safety', () => {
  it('defaults to read-only verified TST and requires exact checksums for writes', () => {
    const value = socialMigrationConfiguration(tstArgs, environment());
    assert.equal(value.apply, false);
    assert.equal(value.direct.hostname, SOCIAL_TST_HOST.replace('-pooler.', '.'));
    assert.throws(() => socialMigrationConfiguration([...tstArgs, '--apply'], environment()), /both exact/);
    const apply = socialMigrationConfiguration([...tstArgs, '--apply', `--checksums=${SOCIAL_MIGRATIONS.map(value => value.checksum).join(',')}`], environment());
    assert.equal(apply.apply, true);
  });

  it('rejects production, mismatched database identities and duplicate configuration', () => {
    assert.throws(() => socialMigrationConfiguration(tstArgs, environment(SOCIAL_TST_HOST, 'neon-neat-tst', 'production')), /resource labels/);
    assert.throws(() => socialMigrationConfiguration([...tstArgs.filter(value => !value.startsWith('--expected-target=')), '--expected-target=neon-ohlq-field-crm-prod'], environment()), /Production is forbidden/);
    assert.throws(() => socialMigrationConfiguration(tstArgs, environment() + '\nDATABASE_URL=postgresql://synthetic:synthetic@other.neon.tech/neondb'), /Duplicate environment/);
    assert.throws(() => socialMigrationConfiguration(tstArgs, environment().replace(`synthetic@${SOCIAL_TST_HOST}`, 'synthetic@other.neon.tech')), /Matching secured/);
    assert.throws(() => socialMigrationConfiguration([...tstArgs, `--expected-host=${SOCIAL_TST_HOST}`], environment()), /Duplicate migration/);
  });

  it('requires explicit isolated rehearsal identity and rejects shared/live/predecessor endpoints', () => {
    const host = 'ep-synthetic-social-branch-pooler.c-11.us-east-1.aws.neon.tech';
    const args = ['--env-file=.env.social.local', `--expected-host=${host}`, '--expected-target=social-rehearsal', '--rehearsal'];
    assert.equal(socialMigrationConfiguration(args, environment(host, 'social-rehearsal', 'development')).rehearsal, true);
    assert.throws(() => socialMigrationConfiguration(args.filter(value => value !== '--rehearsal'), environment(host, 'social-rehearsal', 'development')), /Only verified/);
    assert.throws(() => socialMigrationConfiguration([...args.filter(value => !value.startsWith('--expected-host=')), `--expected-host=${SOCIAL_TST_HOST}`], environment(SOCIAL_TST_HOST, 'social-rehearsal', 'development')), /Only verified/);
  });

  it('accepts only the independently reviewed additive SQL with stable LF checksums', () => {
    for (const migration of SOCIAL_MIGRATIONS) {
      const sql = readFileSync(`prisma/migrations/${migration.name}/migration.sql`, 'utf8').replace(/\r\n/g, '\n');
      assert.ok(socialMigrationStatements(sql, migration).length >= 1);
      assert.deepEqual(socialMigrationStatements(sql.replace(/\n/g, '\r\n'), migration), socialMigrationStatements(sql, migration));
      assert.throws(() => socialMigrationStatements(sql + '\nDROP TABLE "User";', migration), /reviewed/);
    }
  });
});
