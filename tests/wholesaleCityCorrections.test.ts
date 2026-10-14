import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountResearchJobStatus } from '@prisma/client';
import { OHIO_WHOLESALE_CITY_CORRECTIONS, normalizeOhioWholesaleCity } from '../lib/ohioWholesaleCities';
import { parseAccountMasterCsv } from '../lib/ohlqAccountMasterImport';
import { getWholesaleAddressValuesForImport } from '../lib/wholesaleAddressProtection';
import { areOhlqAddressesSame } from '../lib/ohlqWholesaleMatching';
import { ACCOUNT_RESEARCH_CITY_RETRY_PREFIX, isActionableAccountResearchFailure } from '../lib/accountResearchFailures';
import { classifyResearchNeed, shouldDeferResearchRetry, type ResearchQueueCandidate } from '../lib/accountResearchQueue';

test('imports every recovered and owner-added city rule for new accounts, with stable repeated normalization', () => {
  const pairs = Object.entries(OHIO_WHOLESALE_CITY_CORRECTIONS);
  assert.equal(pairs.length, 31);
  const csv = [
    'LicenseeID,AgencyID,Ownership,DBA,Address,City,County,ZipCode,DistrictId,DeliveryDay,PhoneNumber',
    ...pairs.map(([alias], i) => `${i + 1},100,Example ${i},,${i + 1} Main St,${alias},Franklin,43215,1,,`),
  ].join('\n');
  const rows = parseAccountMasterCsv(csv).selected;
  for (const [i, [alias, city]] of pairs.entries()) {
    assert.equal(rows.find((row) => row.licenseeId === String(i + 1))?.city, city);
    assert.equal(normalizeOhioWholesaleCity(`  ${alias.toLowerCase().replaceAll(' ', '  ')}  `), city);
    assert.equal(normalizeOhioWholesaleCity(city), city);
  }
  assert.equal(normalizeOhioWholesaleCity('St. Henry'), 'Saint Henry');
  assert.equal(normalizeOhioWholesaleCity('Black Lick'), 'Blacklick');
  assert.equal(normalizeOhioWholesaleCity('WASHINGTON CH'), 'Washington Court House');
  assert.equal(normalizeOhioWholesaleCity('WESTCHESTER'), 'West Chester');
});

test('Ohio city normalization leaves other states, unknown cities and missing values alone', () => {
  assert.equal(normalizeOhioWholesaleCity('W CHESTER', 'PA'), 'W CHESTER');
  assert.equal(normalizeOhioWholesaleCity('W CHESTER', 'Ohio'), 'West Chester');
  assert.equal(normalizeOhioWholesaleCity('W CHESTER', null), 'West Chester');
  assert.equal(normalizeOhioWholesaleCity('Unlisted City'), 'Unlisted City');
  assert.equal(normalizeOhioWholesaleCity(null), null);
});

test('import corrections preserve protected manual cities and other address fields', () => {
  const current = { address: '1 Manual St', city: 'Custom locality', zip: '43215' };
  const source = { address: null, city: 'LEWIS CTR', zip: null, state: 'OH' };
  assert.deepEqual(getWholesaleAddressValuesForImport(current, source), { ...current, city: 'Lewis Center' });
  assert.deepEqual(getWholesaleAddressValuesForImport({ ...current, cityImportProtected: true }, source), current);
  assert.deepEqual(getWholesaleAddressValuesForImport({ ...current, city: null, cityImportProtected: true }, source), { ...current, city: null });
  assert.equal(getWholesaleAddressValuesForImport(current, { ...source, state: 'PA' }).city, 'LEWIS CTR');
});

test('city aliases still match the existing Ohio account when ZIP is absent', () => {
  const identity = { address: '1 Main St', state: 'OH', zip: null };
  assert.equal(areOhlqAddressesSame({ ...identity, city: 'GRANDVIEW HGTS' }, { ...identity, city: 'Grandview Heights' }), true);
  assert.equal(areOhlqAddressesSame({ ...identity, city: 'STONE CRK' }, { ...identity, city: 'Stone Creek' }), true);
  assert.equal(areOhlqAddressesSame({ ...identity, state: 'PA', city: 'GRANDVIEW HGTS' }, { ...identity, state: 'PA', city: 'Grandview Heights' }), false);
});

const now = new Date('2026-10-14T14:00:00Z');
const candidate = (status: AccountResearchJobStatus): ResearchQueueCandidate => ({
  id: 'account', licenseeId: '1', name: 'Example', address: '1 Main St', city: 'Lewis Center', state: 'OH', zip: '43035', county: 'Delaware',
  createdAt: now, opportunities: [], upcomingWork: [],
  targetPublicResearch: { lastRefreshedAt: new Date('2026-10-14T13:00:00Z'), identitySnapshot: { accountName: 'Example', address: '1 Main St', city: 'Lewis Center', state: 'OH', zip: '43035' } },
  accountResearchJobs: [{ status, createdAt: now, updatedAt: now, submittedAt: now, error: 'An unrelated error',
    reviewNote: `${ACCOUNT_RESEARCH_CITY_RETRY_PREFIX}\nPrevious review: Any failure reason`, inputSnapshot: {} }],
});

test('corrected failures reenter research regardless of error, missing input or otherwise fresh research', () => {
  for (const status of [AccountResearchJobStatus.REJECTED, AccountResearchJobStatus.FAILED, AccountResearchJobStatus.BLOCKED_BUDGET]) {
    const account = candidate(status);
    assert.equal(isActionableAccountResearchFailure(account.accountResearchJobs![0]), false);
    assert.equal(shouldDeferResearchRetry(account, now), false);
    assert.equal(classifyResearchNeed(account, now)?.researchReason, 'City corrected; retry account research');
    account.targetPublicResearch!.lastRefreshedAt = new Date(now.getTime() + 1000);
    assert.equal(classifyResearchNeed(account, now), null);
  }
});
