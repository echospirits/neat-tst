import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSupplyAccess, productionMemberIds, readSupplySettings, supplySettingsInput, supplyJobsEnabled } from '../lib/productionSupplies/config';
import { isSideEffectEnabled } from '../lib/appEnvironment';

test('the explicit supply scheduler opt-in cannot enable unrelated background jobs', () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', APP_ENV: 'test', CRON_JOBS_ENABLED: 'false', SUPPLY_JOBS_ENABLED: 'true' };
  assert.equal(supplyJobsEnabled(env), true);
  assert.equal(isSideEffectEnabled('cron', env), false);
  assert.equal(supplyJobsEnabled({ ...env, SUPPLY_JOBS_ENABLED: 'false' }), false);
  assert.equal(supplyJobsEnabled({ ...env, CRON_JOBS_ENABLED: 'true', SUPPLY_JOBS_ENABLED: 'false' }), false);
  assert.throws(() => supplyJobsEnabled({ ...env, SUPPLY_JOBS_ENABLED: 'invalid' }));
});

test('production membership never grants operational access or changes the existing role', () => {
  const preferences = { productionSupplies: { productionTeamId: 'b1ce650b-39cf-4b86-9045-29c8e8459c45' }, accountConfiguration: { version: 1, territories: [], fields: [], categories: [], teams: [{ id: 'b1ce650b-39cf-4b86-9045-29c8e8459c45', name: 'Production', memberIds: ['worker'] }] } };
  assert.deepEqual(productionMemberIds(preferences), ['worker']);
  assert.equal(hasSupplyAccess({ id: 'worker', role: 'USER' }, readSupplySettings(preferences)), false);
  assert.equal(hasSupplyAccess({ id: 'worker', role: 'TASTER' }, readSupplySettings(preferences), true), false);
});
test('viewer and manager grants are independent from production membership and role', () => {
  const settings = supplySettingsInput.parse({ viewerUserIds: ['viewer'], managerUserIds: ['manager'] });
  assert.equal(hasSupplyAccess({ id: 'viewer', role: 'USER' }, settings), true);
  assert.equal(hasSupplyAccess({ id: 'viewer', role: 'USER' }, settings, true), false);
  assert.equal(hasSupplyAccess({ id: 'manager', role: 'TASTER' }, settings), true);
  assert.equal(hasSupplyAccess({ id: 'manager', role: 'TASTER' }, settings, true), true);
  assert.equal(hasSupplyAccess({ id: 'other', role: 'USER' }, settings), false);
  assert.equal(hasSupplyAccess({ id: 'admin', role: 'ADMIN' }, settings, true), true);
});
test('bad or missing settings fail closed and backfill/polling bounds are enforced', () => {
  assert.equal(readSupplySettings(null).historyDays, 90);
  assert.equal(readSupplySettings({ productionSupplies: { viewerUserIds: ['viewer'], pollMinutes: 1 } }).viewerUserIds.length, 0);
  assert.equal(supplySettingsInput.safeParse({ pollMinutes: 1 }).success, false);
  assert.equal(supplySettingsInput.safeParse({ historyDays: 366 }).success, false);
  assert.deepEqual(productionMemberIds({ productionSupplies: { productionTeamId: 'unknown' } }), []);
});

test('legacy polling settings retain access configuration and enforce a six-hour floor', () => {
  const settings = readSupplySettings({ productionSupplies: { productionTeamId: 'production', viewerUserIds: ['viewer'], managerUserIds: ['manager'], historyDays: 120, pollMinutes: 15, includeSent: false } });
  assert.equal(settings.pollMinutes, 360);
  assert.equal(settings.productionTeamId, 'production');
  assert.deepEqual(settings.viewerUserIds, ['viewer']);
  assert.deepEqual(settings.managerUserIds, ['manager']);
  assert.equal(settings.historyDays, 120);
  assert.equal(settings.includeSent, false);
  assert.equal(readSupplySettings(null).pollMinutes, 360);
  assert.equal(supplySettingsInput.parse({ pollMinutes: 30 }).pollMinutes, 360);
  assert.equal(readSupplySettings({ productionSupplies: { pollMinutes: 720 } }).pollMinutes, 720);
});
