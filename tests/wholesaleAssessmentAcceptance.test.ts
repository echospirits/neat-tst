import assert from 'node:assert/strict';
import test from 'node:test';
import { assessWholesaleAccount, type AssessmentInput } from '../lib/wholesaleAssessment';
import { input, product, purchase, strongResearch } from './fixtures/wholesaleAssessment';

// All named cases are synthetic owner-reported archetypes, never exports or audited account histories.
const monthly = (bottles:number, code='OTHER', overrides:Parameters<typeof purchase>[1]={}) => purchase(bottles*3,{itemCode:code,...overrides});
const rate = (overrides:Partial<AssessmentInput>) => assessWholesaleAccount(input(overrides));
const research = (overrides:Partial<AssessmentInput>={}) => input({coverage:{mode:'RESEARCH_ONLY',through:null,expectedDays:0,completeDays:0,identity:'UNAVAILABLE',missingDates:[],verifiedZero:false,limitations:[]},purchases:[],researchSignals:strongResearch(),...overrides});

test('Denmark-like 36 monthly bottles, five-bottle leader and friendly menu context remain zero',()=>{
  const quantities=[5,3,3,3,3,3,3,3,3,3,2,2];
  const result=rate({purchases:quantities.map((n,i)=>monthly(n,String(i))),researchSignals:strongResearch(),plannedWork:true,lastVisitAt:'2026-09-28'});
  assert.equal(quantities.reduce((a,b)=>a+b),36);assert.equal(result.rating,0);
});
test('Giuseppe-like scattered backbar is weaker than the equal-volume recurring core',()=>{
  const broad=rate({purchases:Array.from({length:80},(_,i)=>monthly(3,String(i)))});
  const deep=rate({purchases:[monthly(120,'A'),monthly(120,'B')]});
  assert.equal(broad.commercial.compatible750Per30,deep.commercial.compatible750Per30);assert.equal(broad.rating,0);assert.equal(deep.rating,5);
});
test('a broad slow-moving assortment does not conceal or penalize its substantial core',()=>{
  const core=[monthly(120,'A'),monthly(120,'B')];
  assert.equal(rate({purchases:core}).rating,rate({purchases:[...core,...Array.from({length:100},(_,i)=>monthly(1,String(i)))]}).rating);
});
test('tiny concentration is tiny business, and frequent small orders do not rescue it',()=>{
  assert.equal(rate({purchases:[monthly(3,'A')]}).rating,0);
  assert.equal(rate({purchases:[monthly(3,'A',{orderDates:Array.from({length:20},(_,i)=>'2026-09-'+String(i+1).padStart(2,'0'))})]}).rating,0);
});
test('cheap high-volume account fits a value tenant but cannot fund a premium opportunity',()=>{
  const purchases=[monthly(300,'A',{price750:12})];
  assert.equal(rate({purchases,products:[product({price750:12})]}).rating,5);
  assert.equal(rate({purchases,products:[product({price750:30})]}).rating,0);
});
test('a substantial premium niche counts only its own compatible quantities',()=>{
  const result=rate({products:[product({price750:30})],purchases:[monthly(1000,'CHEAP',{price750:10}),monthly(60,'NICHE',{price750:30})]});
  assert.equal(result.rating,3);assert.equal(result.commercial.compatible750Per30,60);
});
test('established local customer and institutional seasonal venue retain high commercial stars',()=>{
  assert.equal(rate({purchases:[monthly(300,'R',{tenant:true,local:true})]}).rating,5);
  const zoo=rate({name:'Synthetic seasonal venue',nationalChain:true,buyerStructure:null,purchases:[monthly(300)]});
  assert.equal(zoo.rating,5);assert.match(zoo.limitations.join(' '),/not measured consumption, annual demand/);
});
test('excellent public research cannot override weak authoritative purchases',()=>{
  assert.equal(rate({purchases:[monthly(5)],researchSignals:strongResearch()}).rating,0);
});
test('research-only matching active program and strong individual-location scale can earn five',()=>{
  const result=assessWholesaleAccount(research());
  assert.equal(result.rating,5);assert.equal(result.commercial.compatible750,null);assert.deepEqual(result.candidates,[]);
  const noReservations=strongResearch();noReservations.evidence[0].claim += '; no reservations required and no patio.';
  assert.equal(assessWholesaleAccount(research({researchSignals:noReservations})).rating,5,'absence of optional amenities must not erase confirmed program evidence');
});
test('missing price attributes cannot turn potentially substantial business into zero, but known positive core remains useful',()=>{
  const unknown=monthly(9000,'UNKNOWN',{price750:null});
  assert.equal(rate({purchases:[monthly(2),unknown]}).rating,null);
  const lowerBound=rate({purchases:[monthly(60),unknown]});
  assert.equal(lowerBound.rating,3);assert.match(lowerBound.limitations.join(' '),/attributes/);
});
test('research-only missing price or location evidence is unrated; a confirmed dry venue is zero',()=>{
  assert.equal(assessWholesaleAccount(research({researchSignals:strongResearch({comparables:[]})})).rating,null);
  assert.equal(assessWholesaleAccount(research({researchIdentityValid:false})).rating,null);
  assert.equal(assessWholesaleAccount(research({researchAt:'2024-01-01'})).rating,null);
  const noSpirits=strongResearch({comparables:[],evidence:[{field:'beverage',claim:'This location does not serve spirits.',sourceUrl:'https://example.test',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:noSpirits})).rating,0);
});
test('local value vodka is not a transferable premium craft-affinity bonus',()=>{
  const signals=strongResearch({comparables:[{name:'Synthetic local value vodka',category:'VODKA',subtype:'plain',price750:12,source:'https://example.test/menu',observedAt:'2026-09-15',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({products:[product({category:'VODKA',subtype:'plain',price750:32})],researchSignals:signals})).rating,0);
});
test('correlated research mentions do not stack and platform reviews are not added',()=>{
  const baseline=strongResearch();
  assert.equal(assessWholesaleAccount(research({researchSignals:{...baseline,evidence:[...baseline.evidence,...baseline.evidence,...baseline.evidence]}})).rating,5);
  const signals=strongResearch({publicRatings:[{reviewCount:800,rating:4.6,sourceUrl:'https://example.test/a',observedAt:'2026-09-15'},{reviewCount:800,rating:4.6,sourceUrl:'https://example.test/b',observedAt:'2026-09-15'}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:signals})).rating,3);
});
test('group capacity and historic examples are not assigned to each location',()=>{
  const group=strongResearch({publicRatings:[],evidence:[{field:'capacity',claim:'The group has 1000 seats across all locations.',sourceUrl:'https://example.test',exactLocation:true},{field:'menu',claim:'A cocktail bar with an extensive rum program.',sourceUrl:'https://example.test',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:group})).rating,null);
  const ambiguousGroup=strongResearch({publicRatings:[],evidence:[{field:'menu',claim:'This cocktail bar is part of a successful restaurant group with 500 seats; active daily service and private dining with an extensive rum program.',sourceUrl:'https://example.test',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:ambiguousGroup})).commercial.researchScale,1);
  ambiguousGroup.evidence[0].claim = 'A successful restaurant group, 500 seats, with an extensive rum cocktail program and active daily service and private dining.';
  assert.equal(assessWholesaleAccount(research({researchSignals:ambiguousGroup})).commercial.researchScale,1);
  const explicitLocation=strongResearch({publicRatings:[],evidence:[{field:'menu',claim:'The group has 500 seats. This location has 100 seats with an extensive rum cocktail program and private dining.',sourceUrl:'https://example.test',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:explicitLocation})).commercial.researchScale,3);
  const historical=strongResearch({publicRatings:[],evidence:[{field:'menu',claim:'Previously in 2022 an extensive rum cocktail bar with 500 seats and daily happy hour.',sourceUrl:'https://example.test',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:historical})).rating,null);
});
test('one incidental compatible bottle does not inherit the entire venue scale',()=>{
  const signals=strongResearch({evidence:[{field:'menu',claim:'Cocktail bar with daily happy hour, private dining, recent reviews and a bottle of rum.',sourceUrl:'https://example.test/menu',exactLocation:true}]});
  assert.equal(assessWholesaleAccount(research({researchSignals:signals})).rating,2);
});
test('threshold sensitivity is explicit, deterministic and independent of previous result',()=>{
  for(const [volume,expected] of [[11.99,0],[12,1],[12.01,1],[23.99,1],[24,2],[59.99,2],[60,3],[119.99,3],[120,4],[239.99,4],[240,5]]) assert.equal(rate({purchases:[monthly(volume)]}).rating,expected,'monthly '+volume);
});
