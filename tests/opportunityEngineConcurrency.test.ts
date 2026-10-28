import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOpportunityIntelligence } from '../lib/opportunityEngine';
import { runWholesaleAssessmentSweep } from '../lib/wholesaleAssessmentService';
import { assessmentDb } from './fixtures/wholesaleAssessmentDb';
test('full refresh persists all accounts in bounded pages and reconciles actual write counts',async()=>{
  const f=assessmentDb(205);const r=await evaluateOpportunityIntelligence({db:f.db,organizationId:'org_echo_spirits'});
  assert.equal(r.expected,205);assert.equal(r.persisted,205);assert.equal(r.evaluated,205);assert.equal(r.failed,0);
  assert.ok(f.peak()<=4);assert.equal(f.assessments.size,205);assert.equal(f.runs[0].status,'COMPLETED');
  assert.equal(Object.values(r.evidenceCounts).reduce((a,b)=>a+b,0),205);
  for(const q of f.queries.filter(q=>q.name==='events')) {const where=(q.args as any).where;assert.equal(where.organizationId,'org_echo_spirits');assert.ok(where.wholesaleAccountId.in.length<=100);}
});
test('targeted refresh is bounded and duplicate account ids cannot duplicate assessment writes',async()=>{
  const f=assessmentDb(8);const r=await evaluateOpportunityIntelligence({db:f.db,organizationId:'org_echo_spirits',accountIds:['a0001','a0001']});
  assert.equal(r.persisted,1);assert.equal(f.rawQueries(),0);assert.equal(f.runs[0].fullSweep,false);
});
test('dry run performs no writes, and no research provider or timestamp updates are available to the engine',async()=>{
  const f=assessmentDb(4);const r=await evaluateOpportunityIntelligence({db:f.db,organizationId:'org_echo_spirits',dryRun:true});
  assert.equal(r.previews.length,4);assert.equal(f.assessments.size,0);assert.equal(f.runs.length,0);assert.equal(f.rawQueries(),0);
});
test('failed account is visible, remaining batches continue and full success is not claimed',async()=>{
  const f=assessmentDb(105,{failId:'a0002'});const r=await evaluateOpportunityIntelligence({db:f.db,organizationId:'org_echo_spirits'});
  assert.equal(r.failed,1);assert.equal(r.persisted,104);assert.equal(r.persisted+r.failed,r.expected);assert.equal(f.runs[0].status,'PARTIAL');
});
test('lost lease prevents current-state publication',async()=>{
  const f=assessmentDb(3,{loseLease:true});const r=await evaluateOpportunityIntelligence({db:f.db,organizationId:'org_echo_spirits'});
  assert.equal(r.persisted,0);assert.equal(r.failed,3);assert.equal(f.assessments.size,0);
});
test('inactive tenant fails closed',async()=>{
  const f=assessmentDb(2,{inactive:true});await assert.rejects(evaluateOpportunityIntelligence({db:f.db,organizationId:'org_echo_spirits'}),/unavailable/);assert.equal(f.runs.length,0);
});
test('Echo failure is visible while outside assessment tenants remain untouched',async()=>{
  const f=assessmentDb(1);f.raw.organization.findMany=async()=>[{id:'org_echo_spirits'},{id:'outside'}];
  const attempted:string[]=[];f.raw.organization.findFirst=async({where}:any)=>{attempted.push(where.id);throw new Error('failure');};
  await assert.rejects(runWholesaleAssessmentSweep({db:f.db}),/incomplete/);assert.deepEqual(attempted,['org_echo_spirits']);
});
