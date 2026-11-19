import assert from 'node:assert/strict';
import test from 'node:test';
import { ohlqLoadVerificationInput, unverifiedOhlqProcessingStages, verifyOhlqLoadWithRetries } from '../lib/ohlqLoadVerification';

const environment = () => ({
  NODE_ENV: 'test' as const,
  APP_ENV: 'test', DATABASE_ENVIRONMENT: 'test', DATABASE_TARGET_ID: 'unit-test',
  DATABASE_URL: 'postgresql://user:password@test.example/neondb', EXPECTED_DATABASE_HOST: 'test.example',
  PRODUCTION_BASE_URL: 'https://production.example', GITHUB_REPOSITORY: 'echospirits/neat-tst',
  OHLQ_INPUTS_VALID: 'success', OHLQ_REPORT_DATES: '2026-11-17,2026-11-18', OHLQ_OBSERVATION_DATE: '2026-11-19',
});

test('verification uses the frozen manifest and rejects absent, invalid or misrouted targets', () => {
  assert.deepEqual(ohlqLoadVerificationInput(environment()), { reportDates: ['2026-11-17', '2026-11-18'], observationDate: '2026-11-19' });
  for (const patch of [
    { OHLQ_INPUTS_VALID: '' }, { OHLQ_REPORT_DATES: '' }, { OHLQ_REPORT_DATES: '2026-02-30' },
    { OHLQ_OBSERVATION_DATE: '' }, { OHLQ_OBSERVATION_DATE: '2026-11-19,2026-11-20' },
    { GITHUB_REPOSITORY: 'echospirits/ohlq-field-crm' }, { EXPECTED_DATABASE_HOST: 'other.example' },
    { DATABASE_ENVIRONMENT: 'production' }, { DATABASE_TARGET_ID: '' }, { APP_ENV: 'development' },
  ]) assert.throws(() => ohlqLoadVerificationInput({ ...environment(), ...patch }));
});

test('a failed attempt with independently current data passes; incomplete and unknown checks stay actionable', async () => {
  let attempts = 0;
  const waits: number[] = [];
  const options = { wait: async (ms: number) => { waits.push(ms); }, warn: () => {} };
  assert.deepEqual(await verifyOhlqLoadWithRetries(async () => ({ ready: ++attempts === 2 }), options), { ready: true });
  assert.equal(attempts, 2); assert.deepEqual(waits, [30000]);
  attempts = 0;
  assert.deepEqual(await verifyOhlqLoadWithRetries(async () => { attempts++; return { ready: false }; }, options), { ready: false });
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(verifyOhlqLoadWithRetries(async () => { attempts++; throw new Error('unavailable'); }, options));
  assert.equal(attempts, 3);
});

test('unrecorded downstream writes cannot be certified after an attempted failure, but setup-only failures can recover', () => {
  const env = { ...environment(), OHLQ_SALES_STAGE_STATUS: 'skipped', OHLQ_DISCOVERY_STAGE_STATUS: 'skipped' };
  assert.deepEqual(unverifiedOhlqProcessingStages(env), []);
  assert.deepEqual(unverifiedOhlqProcessingStages({ ...env, OHLQ_SALES_STAGE_STATUS: 'failure' }), ['ACCOUNT_SALES_RECONCILIATION']);
  assert.deepEqual(unverifiedOhlqProcessingStages({ ...env, OHLQ_DISCOVERY_STAGE_STATUS: 'failure' }), ['PRODUCT_DISCOVERY']);
  assert.deepEqual(unverifiedOhlqProcessingStages({ ...env, OHLQ_SALES_STAGE_STATUS: '' }), ['ACCOUNT_SALES_RECONCILIATION']);
});
