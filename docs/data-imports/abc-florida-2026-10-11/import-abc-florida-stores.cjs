/* Explicit, insert-only TST data operation. Never loaded by the application or migrations. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const BATCH = 'abc-florida-2026-10-11';
const ORGANIZATION = 'org_echo_spirits';
const ACTOR = 'cmtj135gl0000upa4zz3rwf8m';
const HOST = 'ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech';
const DIRECTORY = 'https://abcfws.com/stores';
const API = 'https://abc.irishtitan.cloud/api/retail-locations/active';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PANHANDLE = new Set([199, 200, 203, 210, 215, 217, 218]);
const normalize = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const knownManager = value => Boolean(value?.trim()) && !/^(unknown|vacant|tbd|n\/a)$/i.test(value.trim());

function assertTarget(env) {
  assert.equal(env.APP_ENV, 'test', 'Only APP_ENV=test is permitted');
  assert.equal(env.DATABASE_TARGET_ID, 'neon-neat-tst', 'Only neat-tst is permitted');
  assert.equal(env.EXPECTED_DATABASE_HOST, HOST);
  assert.equal(new URL(env.DATABASE_URL).hostname, HOST, 'Database host must match verified TST endpoint');
  assert.equal(new URL(env.DATABASE_URL).pathname, '/neondb');
}

function prepare(rows, counties) {
  assert.equal(rows.length, 126, 'This reviewed snapshot must contain 126 stores');
  const codes = new Set(), addresses = new Set();
  return rows.map(raw => {
    const code = String(raw.store_code).padStart(3, '0');
    assert.ok(Number.isInteger(raw.store_code) && raw.store_code > 0);
    assert.ok(!codes.has(code), `Duplicate store ${code}`); codes.add(code);
    assert.equal(raw.state, 'FL'); assert.equal(raw.country, 'US'); assert.equal(raw.is_active, true);
    assert.ok(raw.name.startsWith(`ABC #${code} - `));
    assert.ok(raw.address && raw.city && /^\d{5}$/.test(raw.zip));
    assert.equal(raw.phone_main.replace(/\D/g, '').length, 10);
    const latitude = Number(raw.latitude), longitude = Number(raw.longitude);
    assert.ok(latitude > 24 && latitude < 31.1 && longitude > -88 && longitude < -79);
    const county = counties[raw.store_code];
    assert.ok(county?.county && /^12\d{3}$/.test(county.fips));
    assert.equal(county.raw.result.geographies.Counties[0].BASENAME, county.county);
    assert.equal(Number(county.raw.result.input.location.x), longitude);
    assert.equal(Number(county.raw.result.input.location.y), latitude);
    const addressKey = normalize(`${raw.address} ${raw.city} ${raw.zip}`);
    assert.ok(!addresses.has(addressKey), `Duplicate address ${code}`); addresses.add(addressKey);
    const schedule = DAYS.map(day => {
      const open = raw[`${day.toLowerCase()}_open`], close = raw[`${day.toLowerCase()}_close`];
      assert.ok(open && close, `Incomplete hours ${code} ${day}`);
      assert.ok(/^(closed|\d{1,2}(:\d{2})?\s*[ap]m)$/i.test(open));
      return { day, hours: /^closed$/i.test(open) ? 'Closed' : `${open} - ${close}` };
    });
    const name = `ABC Fine Wine & Spirits #${code} - ${raw.name.split(' - ').slice(1).join(' - ')}`;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ABC Fine Wine & Spirits ${raw.address}, ${raw.city}, FL ${raw.zip}`)}`;
    const auditFlags = ['Store-specific email and liquor license not verified.', 'Buying authority, delivery day, sales history and account owner unknown.'];
    if (!knownManager(raw.manager_main)) auditFlags.push('ABC lists the store manager as Unknown; Google search did not establish a current manager.');
    if (PANHANDLE.has(raw.store_code)) auditFlags.push('ABC directory carries a Panhandle severe-weather hours advisory. These are regular published hours; confirm temporary changes with the store or Google before visiting.');
    return { id: `abc-fws-fl-${code}`, code, name, raw, county, latitude, longitude, schedule, mapsUrl, auditFlags, addressKey };
  });
}

function accountData(row, now) {
  const raw = row.raw;
  return {
    id: row.id, licenseeId: `MANUAL-ABC-FL-${row.code}`, name: row.name,
    state: 'FL', address: raw.address, city: raw.city, county: row.county.county, zip: raw.zip,
    phone: raw.phone_main, ownership: 'ABC Fine Wine & Spirits', isActive: true,
    latitude: row.latitude, longitude: row.longitude, geocodedAt: now, geocodeStatus: 'SUCCESS',
    normalizedGeocodeAddress: [raw.address, raw.city, 'FL', raw.zip].join(', ').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
    createdByUserId: ACTOR,
  };
}

function researchData(row, now) {
  return {
    id: `${row.id}-research`, websiteUrl: DIRECTORY,
    researchStatus: 'Official directory import - owner audit pending',
    researchConfidence: 'High for directory fields; unverified fields omitted',
    openStatus: 'Listed active in official directory',
    ownershipVerification: 'ABC official directory',
    notes: `Public directory snapshot from 2026-10-11. ${row.auditFlags.join(' ')} Coordinates are ABC-provided; county is Census-derived.`,
    sourceUrls: [DIRECTORY, API, row.county.sourceUrl, 'https://abcfws.com/faq'],
    researcher: BATCH, lastAttemptedAt: now,
    identitySnapshot: {
      accountName: row.name, address: row.raw.address, city: row.raw.city, state: 'FL', zip: row.raw.zip,
      businessHours: { sourceName: 'ABC Fine Wine & Spirits official directory (regular hours)', sourceUrl: DIRECTORY, schedule: row.schedule },
      researchEvidence: [
        { field: 'identity', claim: row.raw.name, sourceUrl: DIRECTORY, exactLocation: true },
        { field: 'county', claim: `${row.county.county} County (${row.county.fips}), derived from ABC coordinates`, sourceUrl: row.county.sourceUrl, exactLocation: true },
      ],
      directoryImport: { batch: BATCH, observedOn: '2026-10-11', sourceUrl: API, storeCode: row.code, raw: row.raw, countyEvidence: { county: row.county.county, fips: row.county.fips, sourceUrl: row.county.sourceUrl }, googleMapsUrl: row.mapsUrl, auditFlags: row.auditFlags },
    },
  };
}

function overlayData(row) {
  return {
    id: `${row.id}-echo`, organizationId: ORGANIZATION, accountType: 'WHOLESALE', externalAccountId: row.id,
    active: true, isTargeting: false,
    notes: [
      `ABC Florida directory import | ${BATCH} | Audit pending`,
      `ABC store #${row.code}. ${DIRECTORY}`,
      `Google Maps: ${row.mapsUrl}`,
      `Directory manager: ${row.raw.manager_main}. Store phone (not a direct personal line): ${row.raw.phone_main}.`,
      `Additional source fields retained without inferring their meaning: phone_secondary=${row.raw.phone_secondary}; manager_secondary=${row.raw.manager_secondary}; location_zone=${row.raw.location_zone}.`,
      'Corporate fallback only: ABC Guest Services, guestservices@abcfws.com, 866-450-6622 (https://abcfws.com/faq). No verified store or buyer email.',
      `County: ${row.county.county}; Census FIPS ${row.county.fips}.`,
      ...row.auditFlags,
      'The MANUAL account ID is a Neat placeholder, not a Florida liquor license. No targeting, sales status, visit, Worklist item, deal, or purchase history was assigned.',
    ].join('\n'),
  };
}

async function run() {
  const args = process.argv.slice(2);
  const value = key => args[args.indexOf(key) + 1];
  assert.ok(args.includes('--env-file') && value('--env-file'), 'An explicit --env-file is required; never loads .env implicitly');
  assert.ok(args.includes('--data-dir') && value('--data-dir'), 'An explicit --data-dir is required');
  assert.ok(args.includes('--report') && value('--report'), 'An explicit --report is required');
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(value('--env-file'))));
  assertTarget(env);
  const sourceBytes = fs.readFileSync(path.join(value('--data-dir'), 'stores-source.json'));
  const countyBytes = fs.readFileSync(path.join(value('--data-dir'), 'county-evidence.json'));
  const rows = prepare(JSON.parse(sourceBytes), JSON.parse(countyBytes));
  const health = await fetch('https://neat-tst.vercel.app/api/health', { signal: AbortSignal.timeout(15000) }).then(r => r.json());
  assert.equal(health.ok, true); assert.equal(health.environment, 'test'); assert.equal(health.databaseTarget, 'neon-neat-tst');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const report = { batch: BATCH, mode: args.includes('--apply') ? 'apply' : 'dry-run', startedAt: new Date().toISOString(), databaseTarget: 'neon-neat-tst', databaseHost: HOST, organizationId: ORGANIZATION, actorUserId: ACTOR, health, sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'), countyEvidenceSha256: crypto.createHash('sha256').update(countyBytes).digest('hex'), sourceCount: rows.length, namedManagers: rows.filter(r => knownManager(r.raw.manager_main)).length, unknownManagerStores: rows.filter(r => !knownManager(r.raw.manager_main)).map(r=>r.code), panhandleAdvisoryStores: [...PANHANDLE], stores: [] };
  try {
    const actor = await prisma.user.findUnique({ where: { id: ACTOR }, select: { role: true, isActive: true } });
    assert.equal(actor?.role, 'PLATFORM_ADMIN'); assert.equal(actor?.isActive, true);
    assert.equal((await prisma.organization.findUnique({where:{id:ORGANIZATION},select:{name:true}}))?.name, 'Echo Spirits Distilling Co.');
    report.before = { allAccounts: await prisma.wholesaleAccount.count(), floridaAccounts: await prisma.wholesaleAccount.count({where:{state:'FL'}}) };
    await prisma.$transaction(async tx => {
      const existing = await tx.wholesaleAccount.findMany({ where: { OR: [{ state: 'FL' }, { id: { in: rows.map(r=>r.id) } }, { licenseeId: { in: rows.map(r=>`MANUAL-ABC-FL-${r.code}`) } }] }, select: {id:true,licenseeId:true,address:true,city:true,zip:true,state:true,targetPublicResearch:{select:{identitySnapshot:true}}} });
      for (const row of rows) {
        const sameId = existing.find(r => r.id === row.id);
        const collision = existing.find(r => r.id !== row.id && (r.licenseeId === `MANUAL-ABC-FL-${row.code}` || normalize(`${r.address} ${r.city} ${r.zip}`) === row.addressKey));
        assert.ok(!collision, `Existing account collision for ABC ${row.code}; manual review required`);
        if (sameId) {
          assert.equal(sameId.state, 'FL');
          assert.equal(sameId.targetPublicResearch?.identitySnapshot?.directoryImport?.batch, BATCH, 'Refuse to adopt an unrecognized existing account');
          assert.equal(await tx.organizationAccountOverlay.count({where:{organizationId:ORGANIZATION,accountType:'WHOLESALE',externalAccountId:row.id}}), 1, 'Incomplete previous import');
          report.stores.push({code:row.code,id:row.id,result:'preserved-existing'});
        } else report.stores.push({code:row.code,id:row.id,result:args.includes('--apply')?'created':'would-create'});
      }
      if (!args.includes('--apply')) return;
      const newRows = rows.filter(row => !existing.some(r => r.id === row.id));
      if (!newRows.length) return;
      const now = new Date();
      const tag = await tx.tag.upsert({where:{organizationId_name:{organizationId:ORGANIZATION,name:'ABC Fine Wine & Spirits'}},update:{},create:{organizationId:ORGANIZATION,name:'ABC Fine Wine & Spirits',description:'ABC Florida locations imported from the official directory; owner audit pending.',createdByUserId:ACTOR}});
      for (const row of newRows) {
        await tx.wholesaleAccount.create({ data: { ...accountData(row, now),
          licenseeIds:{create:{id:`${row.id}-licensee`,licenseeId:`MANUAL-ABC-FL-${row.code}`,isPrimary:true}},
          targetPublicResearch:{create:researchData(row,now)},
          tags:{create:{id:`${row.id}-tag`,organizationId:ORGANIZATION,tagId:tag.id,note:BATCH,createdByUserId:ACTOR}},
        }, select: {id:true} });
        await tx.organizationAccountOverlay.create({data:overlayData(row),select:{id:true}});
        await tx.locationContact.create({data:{id:`${row.id}-manager`,organizationId:ORGANIZATION,wholesaleAccountId:row.id,name:knownManager(row.raw.manager_main)?row.raw.manager_main:'Store team',role:knownManager(row.raw.manager_main)?'Store manager':'Store main line - manager unknown',phone:row.raw.phone_main,email:null,isPrimary:true,active:true,source:'ABC_OFFICIAL_DIRECTORY',externalSourceId:`abc-fws-fl-${row.code}:manager`,createdByUserId:ACTOR,notes:`Source: ${DIRECTORY}; observed 2026-10-11. Public store telephone, not a personal or direct number. ${knownManager(row.raw.manager_main)?'Named by the ABC directory; current role awaits owner audit.':'The source manager field is Unknown; no person identity was inferred.'}`},select:{id:true}});
      }
    }, { isolationLevel: 'Serializable', maxWait: 15000, timeout: 180000 });
    report.after = { allAccounts: await prisma.wholesaleAccount.count(), floridaAccounts: await prisma.wholesaleAccount.count({where:{state:'FL'}}), importedAccounts:await prisma.wholesaleAccount.count({where:{id:{in:rows.map(r=>r.id)}}}), echoContacts:await prisma.locationContact.count({where:{organizationId:ORGANIZATION,wholesaleAccountId:{in:rows.map(r=>r.id)}}}), echoOverlays:await prisma.organizationAccountOverlay.count({where:{organizationId:ORGANIZATION,accountType:'WHOLESALE',externalAccountId:{in:rows.map(r=>r.id)}}}), otherOrganizationContacts:await prisma.locationContact.count({where:{organizationId:{not:ORGANIZATION},wholesaleAccountId:{in:rows.map(r=>r.id)}}}) };
    if (args.includes('--apply')) { assert.equal(report.after.importedAccounts,126); assert.equal(report.after.echoContacts,126); assert.equal(report.after.echoOverlays,126); assert.equal(report.after.otherOrganizationContacts,0); }
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.resolve(value('--report')), JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({...report,stores:undefined},null,2));
  } finally { await prisma.$disconnect(); }
}

module.exports = { assertTarget, prepare, accountData, researchData, overlayData, knownManager };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
