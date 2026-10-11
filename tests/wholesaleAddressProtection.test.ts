import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextAccountMasterWholesaleValues, type AccountMasterRow, type AccountMasterWholesaleValues } from '../lib/ohlqAccountMasterImport';
import type { WholesaleAddressProtection } from '../lib/wholesaleAddressProtection';
import { getWholesaleAddressProtectionForEdit, getWholesaleAddressValuesForImport, getWholesaleAddressValuesForMerge } from '../lib/wholesaleAddressProtection';

const current = {
  address: '1 Public St', city: 'Columbus', zip: '43215', agencyId: '10', county: 'Franklin',
  deliveryDay: 'Monday', districtId: '1', isActive: false, name: 'Public Name',
  officialAccountId: 'official', ownership: null, phone: '614-555-0000', state: 'OH',
};
const source: AccountMasterRow = {
  licenseeId: '0001234', agencyId: '20', ownership: 'Official owner', dba: 'Official name', name: 'Official name',
  address: '99 OHLQ St', city: 'Dublin', zip: '43017', county: 'Delaware', state: 'OH',
  districtId: '2', deliveryDay: 'Tuesday', phone: '614-555-1111',
};

test('active, inactive and reactivated accounts retain their existing names while operational fields refresh', () => {
  for (const isActive of [true, false]) {
    const next = getNextAccountMasterWholesaleValues({ ...current, isActive }, source, 'official');
    assert.equal(next.name, current.name);
    assert.equal(next.isActive, true);
    for (const field of ['agencyId', 'county', 'ownership', 'districtId', 'deliveryDay', 'phone'] as const) assert.equal(next[field], source[field]);
  }
});

test('each manually corrected field survives repeated imports while untouched fields still refresh', () => {
  for (const field of ['address', 'city', 'zip'] as const) {
    const submitted = { ...current, [field]: 'Public correction' };
    const protection = getWholesaleAddressProtectionForEdit(current, submitted);
    let saved: AccountMasterWholesaleValues & WholesaleAddressProtection = { ...submitted, ...protection };
    for (let importNumber = 0; importNumber < 3; importNumber++) {
      saved = { ...saved, ...getNextAccountMasterWholesaleValues(saved, source, 'official') };
      assert.equal(saved[field], 'Public correction');
      for (const other of ['address', 'city', 'zip'] as const) if (other !== field) assert.equal(saved[other], source[other]);
    }
  }
});

test('saving unchanged fields leaves their import protection unset and never sends a false flag', () => {
  assert.deepEqual(getWholesaleAddressProtectionForEdit(current, current), {
    addressImportProtected: undefined, cityImportProtected: undefined, zipImportProtected: undefined,
  });
  assert.equal(getWholesaleAddressProtectionForEdit({ ...current, addressImportProtected: true }, current).addressImportProtected, true);
});

test('intentional clearing is protected and a later manual correction keeps the protection', () => {
  const cleared = { ...current, address: null };
  const saved = { ...cleared, ...getWholesaleAddressProtectionForEdit(current, cleared) };
  assert.equal(getWholesaleAddressValuesForImport(saved, source).address, null);
  const changedAgain = { ...saved, address: '2 Better St' };
  assert.equal(getWholesaleAddressProtectionForEdit(saved, changedAgain).addressImportProtected, true);
});

test('new manual accounts protect entered values and leave missing values available for OHLQ', () => {
  const submitted = { address: '1 Public St', city: 'Columbus', zip: null };
  const protection = getWholesaleAddressProtectionForEdit(null, submitted);
  assert.equal(protection.addressImportProtected, true);
  assert.equal(protection.cityImportProtected, true);
  assert.equal(protection.zipImportProtected, undefined);
});

test('blank imported values preserve existing unprotected values', () => {
  assert.deepEqual(getWholesaleAddressValuesForImport(current, { address: null, city: null, zip: null }), {
    address: current.address, city: current.city, zip: current.zip,
  });
});

test('merging keeps destination corrections, transfers source corrections and preserves protected blanks', () => {
  const merged = getWholesaleAddressValuesForMerge(
    { ...source, addressImportProtected: true, zipImportProtected: true, zip: null },
    { ...current, cityImportProtected: true },
  );
  assert.deepEqual(merged, {
    address: source.address, city: current.city, zip: null,
    addressImportProtected: true, cityImportProtected: true, zipImportProtected: true,
  });
  assert.equal(getWholesaleAddressValuesForMerge(
    { ...source, addressImportProtected: true },
    { ...current, addressImportProtected: true, address: null },
  ).address, null);
});
