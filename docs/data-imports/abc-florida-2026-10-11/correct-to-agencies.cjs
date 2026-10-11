/* One-time, reversible TST correction. Archived wholesale rows retain original evidence. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { assertTarget } = require('./import-abc-florida-stores.cjs');
const BATCH = 'abc-florida-2026-10-11';
const CORRECTION = `${BATCH}-retail-correction`;
const ORG = 'org_echo_spirits';
const FIELDS = ['name','address','city','county','state','zip','phone','latitude','longitude','geocodedAt','geocodeStatus','normalizedGeocodeAddress','geocodeError'];
const json = x => JSON.parse(JSON.stringify(x));
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const omit = (x, fields) => Object.fromEntries(Object.entries(json(x)).filter(([k])=>!fields.includes(k)));
function agencyData(account, now) {
 const snapshot = account.targetPublicResearch.identitySnapshot;
 return {id:account.id, agencyId:`ABC-FL-${snapshot.directoryImport.storeCode}`,
  ...Object.fromEntries(FIELDS.map(k=>[k,account[k]])),
  businessHours:{...snapshot.businessHours,directoryImport:snapshot.directoryImport,researchEvidence:snapshot.researchEvidence,
   retailCorrection:{batch:CORRECTION,correctedAt:now,archivedWholesaleId:account.id}},
 };
}
function storeContext(now) {
 const source={name:'',url:'',observedOn:''};
 return {version:1,savedAt:now,savedBy:'cmtj135gl0000upa4zz3rwf8m',
 store:{ownership:'Chain',chainName:'ABC Fine Wine & Spirits',format:'Liquor / beverage store',buying:'Unknown',notes:'ABC-FL identifiers are directory identifiers, not OHLQ agency numbers or Florida liquor licenses.',source:{name:'ABC official store directory',url:'https://abcfws.com/stores',observedOn:'2026-10-11'}},
 area:{setting:'Unknown',neighborhood:'',nearby:[],notes:'',source},
 demographics:{geography:'',year:null,medianHouseholdIncome:null,adultPopulation:null,source}};
}
async function snapshot(db, ids) {
 const accounts=await db.wholesaleAccount.findMany({where:{id:{in:ids}},include:{targetPublicResearch:true},orderBy:{id:'asc'}});
 const agencies=await db.agency.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}});
 const contacts=await db.locationContact.findMany({where:{OR:[{wholesaleAccountId:{in:ids}},{agencyId:{in:ids}}]},orderBy:{id:'asc'}});
 const overlays=await db.organizationAccountOverlay.findMany({where:{externalAccountId:{in:ids}},orderBy:{id:'asc'}});
 const tags=await db.locationTag.findMany({where:{OR:[{wholesaleAccountId:{in:ids}},{agencyId:{in:ids}}]},orderBy:{id:'asc'}});
 return {accounts,agencies,contacts,overlays,tags};
}
async function assertNoUnexpectedLinks(db,ids) {
 const cols=await db.$queryRawUnsafe(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('wholesaleAccountId','externalAccountId','accountId') ORDER BY table_name,column_name`);
 const allowed=new Set(['LocationContact','LocationTag','OrganizationAccountOverlay','TargetPublicResearch','WholesaleLicenseeId']);
 for(const c of cols) {
  if(allowed.has(c.table_name)) continue;
  const rows=await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}" = ANY($1::text[])`,ids);
  assert.equal(rows[0].n,0,`New activity in ${c.table_name}; review migration before proceeding`);
 }
}
function verify(before, after) {
 assert.equal(after.agencies.length,126);
 assert.equal(after.accounts.filter(a=>a.isActive).length,0);
 for(const account of before.accounts) {
  const agency=after.agencies.find(a=>a.id===account.id);
  for(const k of FIELDS) assert.deepEqual(json(agency[k]),json(account[k]),`${account.id}:${k}`);
  assert.deepEqual(agency.businessHours.schedule,account.targetPublicResearch.identitySnapshot.businessHours.schedule);
  assert.deepEqual(agency.businessHours.directoryImport,account.targetPublicResearch.identitySnapshot.directoryImport);
  assert.deepEqual(json(after.accounts.find(a=>a.id===account.id).targetPublicResearch),json(account.targetPublicResearch));
 }
 for(const group of ['contacts','tags','overlays']) {
  assert.equal(after[group].length,before[group].length);
  for(const original of before[group]) {
   const next=after[group].find(x=>x.id===original.id);
   const excluded=group==='overlays'?['accountType','storeContext','updatedAt']:['agencyId','wholesaleAccountId','updatedAt'];
   assert.deepEqual(omit(next,excluded),omit(original,excluded),`${group}:${original.id}`);
   if(group==='overlays') { assert.equal(next.accountType,'AGENCY'); if(original.storeContext) assert.deepEqual(next.storeContext,original.storeContext); }
   else { assert.equal(next.agencyId,original.wholesaleAccountId || original.agencyId); assert.equal(next.wholesaleAccountId,null); }
  }
 }
}
async function run() {
 const args=process.argv.slice(2), arg=k=>args[args.indexOf(k)+1];
 for(const k of ['--env-file','--data-dir','--report'])assert.ok(args.includes(k)&&arg(k),`${k} required`);
 const env=require('dotenv').parse(fs.readFileSync(arg('--env-file')));assertTarget(env);
 const health=await fetch('https://neat-tst.vercel.app/api/health').then(r=>r.json());
 assert.equal(health.environment,'test');assert.equal(health.databaseTarget,'neon-neat-tst');assert.equal(health.ok,true);
 const raw=JSON.parse(fs.readFileSync(require('node:path').join(arg('--data-dir'),'stores-source.json')));
 const ids=raw.map(r=>`abc-fws-fl-${String(r.store_code).padStart(3,'0')}`);assert.equal(new Set(ids).size,126);
 const db=new(require('@prisma/client').PrismaClient)({datasources:{db:{url:env.DATABASE_URL}}});
 const report={correction:CORRECTION,mode:args.includes('--apply')?'apply':'dry-run',health,startedAt:new Date().toISOString()};
 try {
  await db.$transaction(async tx=>{
   await assertNoUnexpectedLinks(tx,ids);
   const before=await snapshot(tx,ids);assert.equal(before.accounts.length,126);
   for(const a of before.accounts)assert.equal(a.targetPublicResearch?.identitySnapshot?.directoryImport?.batch,BATCH);
   for(const group of ['contacts','overlays','tags']){ assert.equal(before[group].length,126);assert.ok(before[group].every(x=>x.organizationId===ORG)); }
   if(before.agencies.length===126){
    assert.ok(before.agencies.every(a=>a.businessHours?.retailCorrection?.batch===CORRECTION));
    verify(before,before);report.result='already-corrected-preserved';return;
   }
   assert.equal(before.agencies.length,0,'Partial correction requires review');
   assert.ok(before.accounts.every(a=>a.isActive));
   assert.ok(before.overlays.every(a=>a.accountType==='WHOLESALE'));
   const candidates=await tx.agency.findMany({where:{OR:[{state:'FL'},{agencyId:{in:ids.map(id=>`ABC-FL-${id.slice(-3)}`)}}]}});
   const norm=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
   for(const a of before.accounts)assert.ok(!candidates.some(c=>c.agencyId===`ABC-FL-${a.id.slice(-3)}` || norm(`${a.address} ${a.city} ${a.zip}`)===norm(`${c.address} ${c.city} ${c.zip}`)),`Existing agency collision ${a.id}`);
   report.beforeHash=hash(json(before));report.counts={agencies:126,contacts:126,notesAndOverlays:126,tags:126,hours:126,activeWholesaleAfter:0};
   if(!args.includes('--apply')){report.result='ready';return;}
   assert.ok(args.includes('--backup'),'A private --backup path is required');
   fs.writeFileSync(arg('--backup'),JSON.stringify(json(before),null,2),{flag:'wx'});
   const now=new Date().toISOString();
   await tx.agency.createMany({data:before.accounts.map(a=>agencyData(a,now))});
   for(const a of before.accounts){
    await tx.locationContact.updateMany({where:{wholesaleAccountId:a.id},data:{agencyId:a.id,wholesaleAccountId:null}});
    await tx.locationTag.updateMany({where:{wholesaleAccountId:a.id},data:{agencyId:a.id,wholesaleAccountId:null}});
   }
   for(const o of before.overlays)await tx.organizationAccountOverlay.update({where:{id:o.id},data:{accountType:'AGENCY',...(o.storeContext?{}:{storeContext:storeContext(now)})}});
   await tx.wholesaleAccount.updateMany({where:{id:{in:ids}},data:{isActive:false}});
   const after=await snapshot(tx,ids);verify(before,after);
   report.afterHash=hash(json(after));report.result='corrected-and-verified';
  },{isolationLevel:'Serializable',maxWait:15000,timeout:180000});
  report.completedAt=new Date().toISOString();fs.writeFileSync(arg('--report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await db.$disconnect();}
}
module.exports={agencyData,verify};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
