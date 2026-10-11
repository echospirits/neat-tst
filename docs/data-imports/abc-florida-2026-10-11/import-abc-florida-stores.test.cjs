const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertTarget, prepare, accountData, researchData, overlayData, knownManager } = require('./import-abc-florida-stores.cjs');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname,'stores-source.json')));
const counties = JSON.parse(fs.readFileSync(path.join(__dirname,'county-evidence.json')));
const safe = { APP_ENV:'test',DATABASE_TARGET_ID:'neon-neat-tst',EXPECTED_DATABASE_HOST:'ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech',DATABASE_URL:'postgresql://user:placeholder@ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech/neondb' };
test('refuses production, mislabeled environments and other database hosts',()=>{
  assert.doesNotThrow(()=>assertTarget(safe));
  for (const change of [{APP_ENV:'production'},{DATABASE_TARGET_ID:'production'},{DATABASE_URL:'postgresql://user:placeholder@localhost/neondb'},{EXPECTED_DATABASE_HOST:'other'},{DATABASE_URL:safe.DATABASE_URL.replace('/neondb','/other')}]) assert.throws(()=>assertTarget({...safe,...change}));
});
test('snapshot is complete and county coordinates match source records',()=>{
  const prepared = prepare(rows,counties);
  assert.equal(prepared.length,126);
  assert.equal(new Set(prepared.map(r=>r.county.county)).size,39);
  assert.equal(prepared.filter(r=>knownManager(r.raw.manager_main)).length,123);
  assert.equal(prepared.find(r=>r.code==='105').county.county,'Manatee');
  assert.equal(prepared.find(r=>r.code==='107').county.county,'Pasco');
});
test('rejects duplicate stores, missing rows and false county matches',()=>{
  assert.throws(()=>prepare(rows.slice(1),counties));
  assert.throws(()=>prepare([rows[0],...rows.slice(0,-1)],counties));
  const bad=structuredClone(counties); bad[rows[0].store_code].raw.result.input.location.x=0;
  assert.throws(()=>prepare(rows,bad));
});
test('does not fabricate licenses, purchase history, buyer authority or targeting',()=>{
  for(const row of prepare(rows,counties)) {
    const data=accountData(row,new Date('2026-10-11T00:00:00Z'));
    assert.match(data.licenseeId,/^MANUAL-ABC-FL-/);
    for(const field of ['officialAccountId','agencyId','deliveryDay','ohlqLastEchoPurchaseDate']) assert.equal(data[field],undefined);
    const overlay=overlayData(row);
    assert.equal(overlay.organizationId,'org_echo_spirits'); assert.equal(overlay.isTargeting,false); assert.equal(overlay.salesStatus,undefined);
    const research=researchData(row,new Date());
    assert.equal(research.identitySnapshot.businessHours.schedule.length,7);
    assert.equal(research.completedAt,undefined); assert.equal(research.refreshStatus,undefined);
    assert.equal(research.identitySnapshot.directoryImport.raw,row.raw);
  }
});
test('unknown manager values never become person names',()=>{
  for(const value of ['Unknown','UNKNOWN','vacant','TBD','N/A','']) assert.equal(knownManager(value),false);
  assert.equal(knownManager('Guy Long'),true);
});
