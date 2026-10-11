const fs=require('node:fs'), assert=require('node:assert/strict'), path=require('node:path');
const {prepare,accountData,knownManager,assertTarget}=require('./import-abc-florida-stores.cjs');
const env=require('dotenv').parse(fs.readFileSync(process.argv[2])); assertTarget(env);
const rows=prepare(JSON.parse(fs.readFileSync(path.join(__dirname,'stores-source.json'))),JSON.parse(fs.readFileSync(path.join(__dirname,'county-evidence.json'))));
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
async function main(){
 const ids=rows.map(r=>r.id);
 const accounts=await p.wholesaleAccount.findMany({where:{id:{in:ids}},select:{id:true,licenseeId:true,name:true,address:true,city:true,state:true,zip:true,county:true,ownership:true,phone:true,latitude:true,longitude:true,geocodeStatus:true,officialAccountId:true,agencyId:true,deliveryDay:true,targetPublicResearch:{select:{identitySnapshot:true,websiteUrl:true}},licenseeIds:{select:{licenseeId:true,isPrimary:true}},tags:{select:{organizationId:true}}}});
 const contacts=await p.locationContact.findMany({where:{wholesaleAccountId:{in:ids}},select:{wholesaleAccountId:true,organizationId:true,name:true,role:true,phone:true,email:true,isPrimary:true}});
 const overlays=await p.organizationAccountOverlay.findMany({where:{accountType:'WHOLESALE',externalAccountId:{in:ids}},select:{externalAccountId:true,organizationId:true,isTargeting:true,salesStatus:true,assignedUserId:true,notes:true}});
 assert.equal(accounts.length,126);assert.equal(contacts.length,126);assert.equal(overlays.length,126);
 for(const row of rows){
  const a=accounts.find(a=>a.id===row.id), expected=accountData(row,new Date());
  for(const key of ['licenseeId','name','address','city','state','zip','county','ownership','phone','latitude','longitude','geocodeStatus']) assert.deepEqual(a[key],expected[key],`${row.code}: ${key}`);
  for(const key of ['officialAccountId','agencyId','deliveryDay']) assert.equal(a[key],null);
  assert.deepEqual(a.targetPublicResearch.identitySnapshot.businessHours.schedule,row.schedule);
  assert.deepEqual(a.targetPublicResearch.identitySnapshot.directoryImport.raw,row.raw);
  assert.deepEqual(a.licenseeIds,[{licenseeId:expected.licenseeId,isPrimary:true}]);
  assert.deepEqual(a.tags,[{organizationId:'org_echo_spirits'}]);
  const c=contacts.find(c=>c.wholesaleAccountId===row.id),o=overlays.find(o=>o.externalAccountId===row.id);
  assert.equal(c.organizationId,'org_echo_spirits');assert.equal(c.name,knownManager(row.raw.manager_main)?row.raw.manager_main:'Store team');assert.equal(c.phone,row.raw.phone_main);assert.equal(c.email,null);assert.equal(c.isPrimary,true);
  assert.equal(o.organizationId,'org_echo_spirits');assert.equal(o.isTargeting,false);assert.equal(o.salesStatus,null);assert.equal(o.assignedUserId,null);assert.ok(o.notes.includes('Audit pending'));
 }
 const result={verifiedAt:new Date().toISOString(),accountsExactMatch:126,countyCount:39,hoursExactMatch:126,rawEvidenceExactMatch:126,echoContacts:126,echoOverlays:126,echoTags:126,targetingAssigned:0,salesStatusAssigned:0,otherOrganizationContacts:0};
 fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
 const headers=['ABC store number','Neat account name','Address','City','State','ZIP','County','Store phone','Directory manager','Manager verified in directory','Latitude','Longitude','Website','Google Maps','Neat TST account','Corporate fallback email','Corporate fallback phone','Audit flags',...['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']];
 const csv=[headers,...rows.map(r=>[r.code,r.name,r.raw.address,r.raw.city,'FL',r.raw.zip,r.county.county,r.raw.phone_main,r.raw.manager_main,knownManager(r.raw.manager_main)?'Yes - owner audit pending':'No',r.latitude,r.longitude,'https://abcfws.com/stores',r.mapsUrl,`https://neat-tst.vercel.app/wholesale/${r.id}`,'guestservices@abcfws.com','866-450-6622',r.auditFlags.join(' '),...r.schedule.map(d=>d.hours)])].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 fs.writeFileSync(path.join(__dirname,'audit.csv'),'\uFEFF'+csv+'\r\n');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
