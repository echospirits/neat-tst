import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getWholesaleMergeDestinationFallbacks,
  getWholesaleMergeLicenseeIds,
  type MergeAccountValues,
} from '../lib/wholesaleAccountMerge';

const account = ({
  licenseeId,
  licenseeIds = [],
  ...overrides
}: Omit<Partial<MergeAccountValues>, 'licenseeId' | 'licenseeIds'> & {
  licenseeId: string;
  licenseeIds?: string[];
}) => ({
  address: null,
  agencyId: null,
  city: null,
  county: null,
  deliveryDay: null,
  districtId: null,
  licenseeId,
  licenseeIds: licenseeIds.map((value) => ({ licenseeId: value })),
  name: 'Account',
  ownership: null,
  phone: null,
  state: 'OH',
  zip: null,
  ...overrides,
});

describe('getWholesaleMergeLicenseeIds', () => {
  it('keeps official IDs and transfers real aliases from the manual account', () => {
    const source = account({
      licenseeId: 'manual-new-bar-mbv71lfl',
      licenseeIds: ['manual-new-bar-mbv71lfl', '1234567'],
    });
    const destination = account({
      licenseeId: '00072045-1',
      licenseeIds: ['00072045-1', '00072045'],
    });

    assert.deepEqual(getWholesaleMergeLicenseeIds(source, destination), [
      '00072045-1',
      '00072045',
      '1234567',
    ]);
  });

  it('does not transfer generated manual identifiers', () => {
    const source = account({
      licenseeId: 'manual-new-bar-mbv71lfl',
      licenseeIds: ['manual-new-bar-mbv71lfl'],
    });
    const destination = account({ licenseeId: '00072045-1', licenseeIds: ['00072045-1'] });

    assert.deepEqual(getWholesaleMergeLicenseeIds(source, destination), ['00072045-1']);
  });
});

describe('getWholesaleMergeDestinationFallbacks', () => {
  it('preserves official values and fills blank operational fields from the manual account', () => {
    const source = account({
      licenseeId: 'manual-new-bar',
      address: '10 New Street',
      city: 'Columbus',
      phone: '614-555-0100',
      ownership: 'Independent',
    });
    const destination = account({
      licenseeId: '1234567',
      address: '10 Official Street',
      city: null,
      phone: null,
      ownership: 'Official ownership',
    });

    assert.deepEqual(getWholesaleMergeDestinationFallbacks(source, destination), {
      address: '10 Official Street',
      agencyId: null,
      city: 'Columbus',
      county: null,
      deliveryDay: null,
      districtId: null,
      ownership: 'Official ownership',
      phone: '614-555-0100',
      state: 'OH',
      zip: null,
    });
  });
});
