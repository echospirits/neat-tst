import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as wholesaleAccounts from '../lib/wholesaleAccounts';
import { normalizeUsState, stateScopedLicenseeIds } from '../lib/usStates';
import { getWholesaleAddressProtectionForEdit } from '../lib/wholesaleAddressProtection';
import { getGeocodeResetForAddressChange } from '../lib/location/geocode';

function loadEdit(overrides: Record<string, unknown> = {}, official: object | null = null, authenticated = true) {
  const writes: Array<Record<string, unknown>> = [];
  const effects: string[] = [];
  const account: Record<string, unknown> = {
    id: 'account', licenseeId: '12345', licenseeIds: [{ licenseeId: '12345' }], name: 'Public name',
    state: 'OH', address: '1 Public St', city: 'Columbus', county: 'Franklin', zip: '43215',
    agencyId: '10', districtId: '2', deliveryDay: 'Monday', ownership: null, phone: null,
    mergedIntoId: null, officialAccountId: null, ...overrides,
  };
  const context: Record<string, unknown> = {
    ...wholesaleAccounts, normalizeUsState, stateScopedLicenseeIds,
    getWholesaleAddressProtectionForEdit, getGeocodeResetForAddressChange,
    requireUser: async () => { if (!authenticated) throw new Error('REDIRECT:/login'); },
    toOptional: (value: unknown) => String(value ?? '').trim() || null,
    findOfficialWholesaleAccountByLicenseeIds: async () => official,
    prisma: { wholesaleAccount: {
      findUnique: async ({ select }: { select: Record<string, unknown> }) => { effects.push('read'); return Object.fromEntries(Object.keys(select).map(key => [key, account[key]])); },
      findFirst: async () => null,
    }, $transaction: async (callback: (db: object) => Promise<unknown>) => callback({ wholesaleAccount: {
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); },
    } }), wholesaleAccountAssessment: { updateMany: async () => { effects.push('assessment'); } } },
    syncWholesaleAccountLicenseeIds: async () => { effects.push('licensee-sync'); },
    after: (callback: () => Promise<void>) => callback(),
    refreshTenantOpportunityScoresForAccounts: async () => { effects.push('refresh'); },
    revalidatePath: () => { effects.push('revalidate'); },
    redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  };
  const source = readFileSync('app/wholesale/[id]/edit/page.tsx', 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'updateWholesaleAccount')!;
  runInNewContext(ts.transpileModule(`${declaration.getText(ast)}\nglobalThis.action = updateWholesaleAccount;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { action: context.action as (data: FormData) => Promise<unknown>, writes, effects };
}
function data() {
  const submitted = new FormData();
  for (const [key, value] of Object.entries({ id: 'account', licenseeIds: '12345', name: 'Public rename', state: 'OH', address: '1 Public St', city: 'Columbus', county: 'Franklin', zip: '43215', agencyId: '10', districtId: '2', deliveryDay: 'Monday' })) submitted.set(key, value);
  return submitted;
}
test('production edit protects each corrected field and retains successful lifecycle side effects', async () => {
  for (const field of ['address', 'city', 'zip']) {
    const harness = loadEdit(); const submitted = data(); submitted.set(field, 'Public correction');
    await assert.rejects(harness.action(submitted), /REDIRECT:\/wholesale\/account\?status=updated/);
    assert.equal(harness.writes[0][field], 'Public correction'); assert.equal(harness.writes[0][`${field}ImportProtected`], true);
    for (const other of ['address', 'city', 'zip']) if (other !== field) assert.equal(harness.writes[0][`${other}ImportProtected`], undefined);
    for (const effect of ['licensee-sync', 'assessment', 'refresh', 'revalidate']) assert.ok(harness.effects.includes(effect));
  }
});
test('production official relinking preserves a protected cleared address', async () => {
  const harness = loadEdit({ address: null, addressImportProtected: true }, { id: 'official', address: 'Wrong OHLQ St', city: 'Columbus', state: 'OH', zip: '43215' });
  const submitted = data(); submitted.set('address', '');
  await assert.rejects(harness.action(submitted), /REDIRECT:/);
  assert.equal(harness.writes[0].address, null); assert.equal(harness.writes[0].addressImportProtected, true);
});
test('production unrelated saves do not lock untouched address fields or clear existing locks', async () => {
  const harness = loadEdit({ cityImportProtected: true });
  await assert.rejects(harness.action(data()), /REDIRECT:/);
  assert.equal(harness.writes[0].addressImportProtected, undefined); assert.equal(harness.writes[0].cityImportProtected, true); assert.equal(harness.writes[0].zipImportProtected, undefined);
});
test('production edit retains the authentication gate and invalid-state mutation guard', async () => {
  const anonymous = loadEdit({}, null, false);
  await assert.rejects(anonymous.action(data()), /REDIRECT:\/login/); assert.deepEqual(anonymous.effects, []); assert.deepEqual(anonymous.writes, []);
  const invalid = loadEdit(); const submitted = data(); submitted.set('state', 'invalid');
  assert.match((await invalid.action(submitted) as { error: string }).error, /valid US state/); assert.deepEqual(invalid.writes, []);
});
