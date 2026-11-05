import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as enums from '@prisma/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { getVisitContinueTarget } from '../lib/visitConfirmation';

function actionHarness(role: enums.UserRole) {
  let writes = 0;
  const saved: any[] = [], photos: any[] = [];
  const source = readFileSync('app/visits/actions.ts', 'utf8');
  const ast = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  const diagnostics = { mark: () => {}, failure: () => {}, bestEffort: async (_name: string, work: () => Promise<unknown>) => work() };
  const tasting = { id: 'tasting-a', agencyId: 'agency-a', startsAt: new Date(), endsAt: new Date() };
  const db: any = { $executeRaw: async () => 1, loggedVisit: { findUnique: async () => null, create: async ({ data }: any) => { writes++; saved.push(data); return { id: 'visit-a', visitAt: new Date(), ...data }; } }, agency: { findUnique: async () => ({ id: 'agency-a' }) }, worklistItem: { findMany: async () => [] }, visitPhoto: { create: async ({ data }: any) => { photos.push(data); } } };
  db.$transaction = async (work: (db: unknown) => Promise<unknown>) => work(db);
  const context: any = {
    ...enums, URLSearchParams, File, FormData, console,
    createVisitDiagnostics: () => diagnostics,
    requireUser: async () => ({ id: 'taster-a', organizationId: 'org-a', role }),
    requireOrganizationContext: async () => ({ organizationId: 'org-a', organization: {} }),
    getUserDisplayName: () => 'Taster', getSelectedVoiceFollowUps: () => [],
    getRequestedWorklistCompletionIds: () => [], parseSalesStatus: () => null,
    getOutcomeLabels: () => [], sanitizeOutcomeCodes: () => [], normalizeFollowUpMode: () => 'none', shouldCreateVisitTask: () => false,
    randomUUID: () => 'request-key', hasFeature: async () => true,
    redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, unstable_rethrow: (error: unknown) => { throw error; },
    prisma: db, revalidatePath: () => {}, syncWorklistItemCalendar: async () => {},
    requireTastingExecutionContext: async () => tasting, tastingScheduleFingerprint: () => 'snapshot',
    completeTastingFromVisit: async () => { throw new Error('Assignment changed during upload'); }, refreshTastingSales: async () => ({}),
    verifyClientUploadedVisitPhoto: async () => ({ url: 'https://example.com/proof.jpg', storageKey: 'visit-photos/pending/proof.jpg', contentType: 'image/jpeg', sizeBytes: 20 }),
    captureVisitGuide: () => ({}),
  };
  runInNewContext(ts.transpileModule(`${declarations}\nglobalThis.runAction = createVisit;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { run: context.runAction as (form: FormData) => Promise<void>, writes: () => writes, saved, photos };
}

test('a reassignment during photo upload preserves the Visit and returns its creator to canonical review confirmation', async () => {
  const h = actionHarness(enums.UserRole.TASTER); const form = new FormData();
  for (const [name, value] of Object.entries({ agencyId: 'agency-a', tastingId: 'tasting-a', tastingFingerprint: 'snapshot', submissionKey: 'request-key', summary: 'Tasting notes', photoUrl: 'https://example.com/proof.jpg', photoStorageKey: 'visit-photos/pending/proof.jpg', photoUploadSessionId: 'session', returnTo: '/tastings/tasting-a' })) form.set(name, value);
  await assert.rejects(h.run(form), /REDIRECT:\/visits\/confirmed\?visitId=visit-a&origin=visits&status=tasting-needs-review/);
  assert.equal(h.saved.length, 1); assert.equal(h.saved[0].tastingEventId, 'tasting-a'); assert.equal(h.photos.length, 1);
});

test('former assigned taster sees a saved-evidence review notice and a usable return to their schedule', async () => {
  const visit = { id: 'visit-a', agencyId: 'agency-a', locationType: 'agency', wholesaleAccountId: null, actionReturnTo: '/tastings/tasting-a', originatingWorklistItemId: null, tastingEventId: 'tasting-a', tastingEvent: { assignedTasterUserId: 'new-taster' } };
  const module = { exports: {} as any };
  const dependencies: any = {
    'react/jsx-runtime': jsxRuntime, '@prisma/client': enums,
    'next/link': { __esModule: true, default: (props: any) => jsxRuntime.jsx('a', props) },
    'next/navigation': { redirect: () => { throw Error('Unexpected redirect'); } },
    '../../../lib/appBrand': { buildPageMetadata: () => ({}) },
    '../../../lib/auth': { requireUser: async () => ({ id: 'taster-a', role: enums.UserRole.TASTER }) },
    '../../../lib/organizations': { requireOrganizationContext: async () => ({ organizationId: 'org-a' }) },
    '../../../lib/prisma': { prisma: { loggedVisit: { findFirst: async ({ where }: any) => { assert.equal(where.organizationId, 'org-a'); assert.equal(where.createdByUserId, 'taster-a'); return visit; } } } },
    '../../../lib/userAccess': { getSignedInHomePath: () => '/visits/new' }, '../../../lib/visitConfirmation': { getVisitContinueTarget },
    './actions': {}, './RelatedWorkPrompt': {}, '../../../lib/visitRelatedWork': {},
  };
  const source = ts.transpileModule(readFileSync('app/visits/confirmed/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module, exports: module.exports, require: (name: string) => { if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`); return dependencies[name]; } });
  const html = renderToStaticMarkup(await module.exports.default({ searchParams: Promise.resolve({ visitId: visit.id, status: 'tasting-needs-review' }) }));
  assert.match(html, /Your visit and photo were saved/); assert.match(html, /could not be marked complete/); assert.match(html, /href="\/tastings">View my tastings/); assert.doesNotMatch(html, /href="\/tastings\/tasting-a"/);
});

for (const role of [enums.UserRole.TASTER, enums.UserRole.USER, enums.UserRole.ADMIN, enums.UserRole.PLATFORM_ADMIN]) {
  test(`canonical Log Visit enforces actual tasting photo before writes for ${role}, retaining tasting return context`, async () => {
    for (const urlOnly of [false, true]) {
      const h = actionHarness(role); const form = new FormData();
      for (const [name, value] of Object.entries({ locationType: 'agency', agencyId: 'agency-a', tastingId: 'tasting-a', tastingFingerprint: 'snapshot', submissionKey: 'request-key', summary: 'Tasting notes', ...(urlOnly ? { photoUrl: 'https://example.com/unverified-photo.jpg' } : {}) })) form.set(name, value);
      await assert.rejects(h.run(form), /REDIRECT:\/visits\/new\?status=photo-required&type=agency&tastingId=tasting-a/);
      assert.equal(h.writes(), 0);
    }
  });
}

test('canonical forms carry tasting identity/snapshot, prefill the actual Agency and expose required photo', () => {
  const page = readFileSync('app/visits/new/page.tsx', 'utf8');
  const taster = readFileSync('app/visits/TasterVisitForm.tsx', 'utf8');
  const general = readFileSync('app/visits/LogVisitForm.tsx', 'utf8');
  assert.match(page, /requireTastingExecutionContext\(prisma/);
  assert.match(page, /agencyId: tasting.agencyId/);
  assert.match(taster, /useState\(initialAgency\?\.id/);
  for (const form of [taster, general]) { assert.match(form, /name="tastingId"/); assert.match(form, /name="tastingFingerprint"/); }
  assert.match(general, /required=\{Boolean\(initialValues\?\.tastingId\) && slot === 1\}/);
});
