import assert from 'node:assert/strict';
import test from 'node:test';
import { bailmentMigrationConfiguration, BAILMENT_MIGRATION_CHECKSUM } from '../scripts/bailment-financial-migration';

const host = 'ep-late-scene-avs5lnse-pooler.c-11.us-east-1.aws.neon.tech';
const args = ['--env-file=.env.rehearsal.local', `--expected-host=${host}`, '--rehearsal', '--apply', `--checksum=${BAILMENT_MIGRATION_CHECKSUM}`];
const env = `APP_ENV=test\nDATABASE_ENVIRONMENT=test\nDATABASE_TARGET_ID=bailment-storage-rehearsal\nEXPECTED_DATABASE_HOST=${host}\nDATABASE_URL=postgresql://synthetic:fixture@${host}/neondb?sslmode=require`;
test('migration requires exact test identity, reviewed checksum and isolated endpoint', () => {
  assert.equal(bailmentMigrationConfiguration(args, env).connection.hostname, host.replace('-pooler.', '.'));
  for (const changed of [env.replace('APP_ENV=test', 'APP_ENV=production'), env.replace('DATABASE_TARGET_ID=bailment-storage-rehearsal', 'DATABASE_TARGET_ID=neon-neat-tst'), env.replaceAll(host, 'ep-unreviewed.c-11.us-east-1.aws.neon.tech'), env + '\nAPP_ENV=test']) {
    assert.throws(() => bailmentMigrationConfiguration(args, changed));
  }
  assert.throws(() => bailmentMigrationConfiguration(args.filter(value => !value.startsWith('--checksum=')), env));
  assert.throws(() => bailmentMigrationConfiguration(args.filter(value => value !== '--rehearsal'), env));
});
