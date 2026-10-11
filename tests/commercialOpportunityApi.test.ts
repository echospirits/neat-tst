import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import Papa from 'papaparse';
import * as commercial from '../lib/commercialOpportunity';
import * as model from '../lib/wholesaleAssessment';
import { input } from './fixtures/wholesaleAssessment';

function row(rating: number | null, id = 'account') {
  const assessment = model.assessWholesaleAccount(input({ purchases: [], ...(rating === null ? { products: [] } : {}) }));
  assessment.coverage = { ...assessment.coverage, representedFrom: '2026-09-09', through: '2026-09-26', representedDays: 18, latestSourceDate: '2026-10-09' };
  return { wholesaleAccountId: id, rating, assessmentStatus: rating === null ? 'UNRATED' : 'READY', assessmentReason: assessment.ratingReason,
    evidenceMode: 'SALES_BACKED', calculatedAt: new Date('2026-10-10T18:00:00Z'), researchAt: new Date('2026-09-15T12:00:00Z'),
    asOfDate: new Date('2026-10-09T00:00:00Z'), modelVersion: model.ASSESSMENT_VERSION, refreshRequestedAt: null,
    wholesaleAccount: { name: id }, assessment };
}
function fixture(rows = [row(0), row(null, 'unrated')], denied?: 'auth' | 'feature') {
  const calls: Array<{ name: string; query: any }> = [];
  const modules: Record<string, unknown> = {
    papaparse: { __esModule: true, default: Papa },
    '../../../../lib/wholesaleAssessment': model,
    '../../../../lib/commercialOpportunity': commercial,
    '../../../../lib/auth': { requireUser: async () => { if (denied === 'auth') throw new Error('unauthenticated'); return { id: 'rep', organizationId: 'tenant' }; } },
    '../../../../lib/organizations': { requireFeatureForUser: async (user: any, feature: string) => { assert.equal(user.id, 'rep'); assert.equal(feature, 'WHOLESALE_OPPORTUNITIES'); if (denied === 'feature') throw new Error('feature unavailable'); return { organizationId: 'tenant' }; } },
    '../../../../lib/prisma': { prisma: {
      organizationAccountOverlay: { findMany: async (query: any) => { calls.push({ name: 'overlays', query }); return [{ externalAccountId: 'suppressed' }]; } },
      wholesaleAccountAssessment: { findMany: async (query: any) => { calls.push({ name: 'assessments', query }); return rows; } },
    } },
  };
  const module = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  const code = ts.transpileModule(readFileSync('app/api/wholesale/assessments/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)((name: string) => { if (!(name in modules)) throw new Error('Unexpected import: ' + name); return modules[name]; }, module, module.exports);
  return { calls, get: (query = '') => module.exports.GET(new Request('https://example.test/api/wholesale/assessments' + query)) };
}

test('commercial API requires authenticated entitled tenant and never accepts a query-string tenant override', async () => {
  for (const denied of ['auth','feature'] as const) {
    const f = fixture(undefined, denied); await assert.rejects(f.get()); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); const response = await f.get('?organizationId=other');
  assert.equal(response.status,200);
  const query = f.calls.find(c => c.name === 'assessments')!.query;
  assert.equal(query.where.organizationId,'tenant');
  assert.deepEqual(query.orderBy, [{ rating: { sort:'desc', nulls:'last' } }, { wholesaleAccountId:'asc' }]);
  assert.equal(query.take,501); assert.equal(query.skip,0);
  assert.equal(query.select.rating,true); assert.equal(query.select.productionScore,undefined); assert.equal(query.select.priority,undefined);
});
test('commercial API serializes zero/null and exact model, source and calculation provenance',async()=>{
  const f = fixture(); const response = await f.get(); const { data } = await response.json();
  assert.equal(data[0].commercial_rating,0); assert.equal(data[1].commercial_rating,null);
  assert.equal(data[0].assessment_status,'READY'); assert.equal(data[1].assessment_status,'UNRATED');
  assert.equal(data[0].model_version,model.ASSESSMENT_VERSION);
  assert.equal(data[0].calibration_version,model.CALIBRATION_VERSION);
  assert.equal(data[0].effective_assessment_date,'2026-10-09');
  assert.equal(data[0].sales_period_from,'2026-09-09'); assert.equal(data[0].sales_period_through,'2026-09-26');
  assert.equal(data[0].represented_days,18); assert.equal(data[0].latest_source_date,'2026-10-09');
  assert.equal(data[0].calculated_at,'2026-10-10T18:00:00.000Z'); assert.equal(data[0].researched_at,'2026-09-15T12:00:00.000Z');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('API high-star discovery excludes stale, pending, snoozed, dismissed, inactive and tenant-suppressed accounts',async()=>{
  const f=fixture();await f.get('?rating=high');
  const overlays=f.calls.find(c=>c.name==='overlays')!.query;
  assert.equal(overlays.where.organizationId,'tenant');assert.equal(overlays.where.accountType,'WHOLESALE');
  const query=f.calls.find(c=>c.name==='assessments')!.query;
  assert.deepEqual(query.where.rating,{gte:3});assert.equal(query.where.assessmentStatus,'READY');assert.equal(query.where.refreshRequestedAt,null);assert.equal(query.where.dismissedKey,null);
  assert.ok(query.where.OR.some((where:any)=>where.snoozedUntil?.lte instanceof Date));
  assert.equal(query.where.wholesaleAccount.isActive,true);
  assert.deepEqual(query.where.wholesaleAccount.id,{notIn:['suppressed']});
  assert.equal(query.where.wholesaleAccount.tags.none.organizationId,'tenant');
});
test('API explicit zero/unrated filters preserve machine semantics, research has no fabricated sales dates',async()=>{
  for (const [filter,expected] of [['zero',0],['unrated',null]] as const) {
    const f=fixture();await f.get('?rating='+filter);
    assert.equal(f.calls.find(c=>c.name==='assessments')!.query.where.rating,expected);
  }
  const research={...row(5),evidenceMode:'RESEARCH_ONLY'};
  const f=fixture([research]);const {data}=await (await f.get()).json();
  for(const field of ['sales_period_from','sales_period_through','represented_days','latest_source_date']) assert.equal(data[0][field],null,field);
});
test('CSV preserves zero versus empty unrated, escapes formulas, and returns bounded continuation metadata',async()=>{
  const rows=[row(0,'=1+1'),row(null,'missing'),...Array.from({length:499},(_,i)=>row(0,'a'+i))];
  const f=fixture(rows);const response=await f.get('?format=csv&page=2');
  assert.equal(response.headers.get('X-Next-Page'),'3');
  const values=Papa.parse(await response.text(),{header:true}).data as Array<Record<string,string>>;
  assert.equal(values.length,500);assert.equal(values[0].commercial_rating,'0');assert.equal(values[1].commercial_rating,'');
  assert.equal(values[0].account_name,"'=1+1");assert.equal(values[0].sales_period_through,'2026-09-26');
  assert.equal(f.calls.find(c=>c.name==='assessments')!.query.skip,500);
});
