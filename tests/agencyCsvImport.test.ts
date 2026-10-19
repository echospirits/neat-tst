import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { File } from 'node:buffer';
import { UserRole, type PrismaClient } from '@prisma/client';
import Papa from 'papaparse';
import ts from 'typescript';
import {
  AGENCY_CSV_COLUMNS, AGENCY_CSV_MAX_BYTES, AGENCY_CSV_MAX_ROWS,
  AgencyCsvValidationError, importAgencyCsv, parseAgencyCsv,
} from '../lib/agencyCsvImport';

const platformAdmin = { id: 'platform-admin', role: UserRole.PLATFORM_ADMIN };
const row = ['102', 'Agency One', '1 Main St', 'Columbus', 'Franklin', '43215', '6145550100', 'yes', 'A', 'Monday', '1', 'Tuesday', 'Contact One', '6145550101', 'Active'];
const makeCsv = (rows = [row], headers: readonly string[] = AGENCY_CSV_COLUMNS) => Papa.unparse([headers, ...rows]) as string;

function database(failOn?: 'agency' | 'contact') {
  let committed = {
    agencies: new Map<string, Record<string, unknown>>([
      ['102', { id: 'agency-102', agencyId: '102', name: 'Original', address: 'Old St', city: 'Columbus', state: 'OH', zip: '43215', latitude: 39, longitude: -83, geocodeStatus: 'SUCCESS' }],
    ]),
    contacts: new Map<string, Record<string, unknown>>([
      ['org-other-agency-102-default', { organizationId: 'org-other', name: 'Other tenant contact' }],
      ['org-current-agency-102-default', { organizationId: 'org-current', createdByUserId: 'original-author', name: 'Old contact' }],
    ]),
  };
  let transactions = 0;
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      transactions += 1;
      const draft = structuredClone(committed);
      const tx = {
        agency: {
          findUnique: async ({ where }: { where: { agencyId: string } }) => draft.agencies.get(where.agencyId) ?? null,
          upsert: async ({ where, create, update }: { where: { agencyId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
            if (failOn === 'agency' && where.agencyId === '103') throw new Error('agency write failed');
            const previous = draft.agencies.get(where.agencyId);
            const agency = previous ? { ...previous, ...update } : { id: `agency-${where.agencyId}`, state: 'OH', ...create };
            draft.agencies.set(where.agencyId, agency);
            return agency;
          },
        },
        locationContact: {
          upsert: async ({ where, create, update }: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
            if (failOn === 'contact' && where.id.includes('-103-')) throw new Error('contact write failed');
            const previous = draft.contacts.get(where.id);
            draft.contacts.set(where.id, previous ? { ...previous, ...update } : create);
          },
        },
      };
      const result = await callback(tx);
      committed = draft;
      return result;
    },
  } as unknown as PrismaClient;
  return { db, state: () => committed, transactions: () => transactions };
}

test('tenant users, tenant admins and tasters cannot call the write helper', async () => {
  const store = database();
  for (const role of [UserRole.USER, UserRole.ADMIN, UserRole.TASTER]) {
    await assert.rejects(importAgencyCsv({ csv: makeCsv(), user: { id: 'tenant-user', role }, organizationId: 'org-current', db: store.db }), /Platform administrator required/);
  }
  assert.equal(store.transactions(), 0);
  assert.equal(store.state().agencies.get('102')!.name, 'Original');
});

test('complete CSV mapping preserves quoted names, blank optional values and supported booleans', () => {
  const quotedRow = [...row];
  quotedRow[1] = 'Agency, "One"';
  quotedRow[2] = ' '; quotedRow[7] = 'n';
  const parsed = parseAgencyCsv('\uFEFF' + makeCsv([quotedRow]));
  assert.equal(parsed[0].agencyId, '102');
  assert.equal(parsed[0].name, 'Agency, "One"');
  assert.equal(parsed[0].address, null);
  assert.equal(parsed[0].d8Permit, false);
  assert.equal(parsed[0].orderWeek, '1');
  for (const value of ['yes', 'y', 'true', '1', 'no', 'n', 'false', '0', '']) {
    assert.doesNotThrow(() => parseAgencyCsv(makeCsv([[...row.slice(0, 7), value, ...row.slice(8)]])));
  }
});

test('invalid files are fully rejected before opening a transaction', async () => {
  const store = database();
  const invalidId = [...row]; invalidId[0] = '';
  const invalidName = [...row]; invalidName[1] = '';
  const invalidBool = [...row]; invalidBool[7] = 'maybe';
  const longField = [...row]; longField[1] = 'x'.repeat(501);
  const controlField = [...row]; controlField[2] = 'bad\u0000address';
  const invalidFiles = [
    '', makeCsv([]), 'Agency ID,DBA\n102,Only a name',
    makeCsv([row], [...AGENCY_CSV_COLUMNS.slice(0, -1), 'AgencyID']),
    makeCsv([row, row]), makeCsv([row, invalidId]), makeCsv([row, invalidName]),
    makeCsv([row, invalidBool]), makeCsv([row, longField]), makeCsv([row, controlField]),
    makeCsv() + '\n103,"unterminated', makeCsv([row, row.slice(0, -1)]),
    makeCsv([row, [...row, 'extra cell']]), 'x'.repeat(AGENCY_CSV_MAX_BYTES + 1),
    makeCsv(Array.from({ length: AGENCY_CSV_MAX_ROWS + 1 }, (_, i) => [String(i + 1), ...row.slice(1)])),
  ];
  for (const csv of invalidFiles) {
    await assert.rejects(importAgencyCsv({ csv, user: platformAdmin, organizationId: 'org-current', db: store.db }), AgencyCsvValidationError);
  }
  assert.equal(store.transactions(), 0);
  assert.equal(store.state().agencies.get('102')!.name, 'Original');
});

test('platform import updates global agencies and only current-organization contacts together', async () => {
  const store = database();
  const secondRow = ['103', ...row.slice(1)];
  const count = await importAgencyCsv({ csv: makeCsv([row, secondRow]), user: platformAdmin, organizationId: 'org-current', db: store.db });
  assert.equal(count, 2);
  assert.equal(store.transactions(), 1);
  assert.equal(store.state().agencies.get('102')!.name, 'Agency One');
  assert.equal(store.state().agencies.get('102')!.latitude, null);
  assert.equal(store.state().agencies.get('102')!.geocodeStatus, 'PENDING');
  assert.equal(store.state().agencies.get('103')!.state, 'OH');
  assert.equal(store.state().contacts.get('org-current-agency-102-default')!.createdByUserId, 'original-author');
  assert.equal(store.state().contacts.get('org-current-agency-103-default')!.createdByUserId, platformAdmin.id);
  assert.equal(store.state().contacts.get('org-current-agency-103-default')!.agencyId, 'agency-103');
  assert.deepEqual(store.state().contacts.get('org-other-agency-102-default'), { organizationId: 'org-other', name: 'Other tenant contact' });
});

test('an unchanged address preserves the existing geocode', async () => {
  const store = database();
  const sameAddress = [...row]; sameAddress[2] = 'Old St';
  await importAgencyCsv({ csv: makeCsv([sameAddress]), user: platformAdmin, organizationId: 'org-current', db: store.db });
  assert.equal(store.state().agencies.get('102')!.latitude, 39);
  assert.equal(store.state().agencies.get('102')!.geocodeStatus, 'SUCCESS');
});

test('a later agency or contact failure rolls back the entire batch', async () => {
  for (const failOn of ['agency', 'contact'] as const) {
    const store = database(failOn);
    const before = structuredClone(store.state());
    await assert.rejects(importAgencyCsv({ csv: makeCsv([row, ['103', ...row.slice(1)]]), user: platformAdmin, organizationId: 'org-current', db: store.db }), /write failed/);
    assert.deepEqual(store.state(), before);
    assert.equal(store.transactions(), 1);
  }
});

// Run the actual action and platform authorization functions with session and
// database dependencies replaced. No browser sessions or live records are used.
function loadAction(role: UserRole | null, store = database()) {
  const source = readFileSync('app/agencies/page.tsx', 'utf8');
  const authSource = readFileSync('lib/auth.ts', 'utf8');
  const auth = authSource.slice(authSource.indexOf('export async function requirePlatformAdminSession('), authSource.indexOf('export async function requireAdmin()'));
  const action = source.slice(source.indexOf('async function importAgencies('), source.indexOf('export default async function AgenciesPage('));
  const effects = { reads: 0, contexts: 0, revalidated: [] as string[], errors: 0 };
  const user = role ? { id: 'caller', role } : null;
  const context: Record<string, unknown> = {
    UserRole, File, AGENCY_CSV_MAX_BYTES, AgencyCsvValidationError,
    requireUserSession: async () => { if (!user) throw new Error('redirect:/login'); return { user }; },
    requireOrganizationContext: async () => { effects.contexts += 1; return { organizationId: 'org-current' }; },
    importAgencyCsv: (input: Parameters<typeof importAgencyCsv>[0]) => importAgencyCsv({ ...input, db: store.db }),
    redirect: (url: string) => { throw new Error(`redirect:${url}`); },
    revalidatePath: (url: string) => effects.revalidated.push(url),
    console: { error: () => { effects.errors += 1; } },
  };
  const compiled = ts.transpileModule(`${auth}\n${action}\nglobalThis.action = importAgencies;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  context.exports = {};
  runInNewContext(compiled, context);
  const file = new File([makeCsv()], 'agencies.csv');
  const originalText = file.text.bind(file);
  file.text = async () => { effects.reads += 1; return originalText(); };
  const form = { get: () => file } as unknown as FormData;
  return { action: context.action as (data: FormData) => Promise<void>, form, effects, store };
}

test('direct action requests from unauthorized sessions are denied before reading the upload or tenant context', async () => {
  for (const role of [null, UserRole.USER, UserRole.ADMIN, UserRole.TASTER]) {
    const fixture = loadAction(role);
    await assert.rejects(fixture.action(fixture.form), role ? /redirect:\/$/ : /redirect:\/login/);
    assert.equal(fixture.effects.reads, 0);
    assert.equal(fixture.effects.contexts, 0);
    assert.equal(fixture.store.transactions(), 0);
    assert.deepEqual(fixture.effects.revalidated, []);
  }
});

test('the action rejects missing, empty, and oversized files before reading them', async () => {
  for (const value of [null, 'forged-file', new File([], 'empty.csv'), new File(['x'.repeat(AGENCY_CSV_MAX_BYTES + 1)], 'big.csv')]) {
    const fixture = loadAction(UserRole.PLATFORM_ADMIN);
    await assert.rejects(fixture.action({ get: () => value } as unknown as FormData), /redirect:\/agencies\?status=invalid/);
    assert.equal(fixture.effects.reads, 0);
    assert.equal(fixture.store.transactions(), 0);
    assert.deepEqual(fixture.effects.revalidated, []);
  }
});

test('the action reports validation and transaction failures without success or revalidation', async () => {
  const invalid = loadAction(UserRole.PLATFORM_ADMIN);
  await assert.rejects(invalid.action({ get: () => new File(['Agency ID,DBA\n102,Invalid'], 'bad.csv') } as unknown as FormData), /status=invalid&error=invalid-headers/);
  assert.equal(invalid.store.transactions(), 0);
  assert.deepEqual(invalid.effects.revalidated, []);
  const failed = loadAction(UserRole.PLATFORM_ADMIN, database('contact'));
  const before = structuredClone(failed.store.state());
  await assert.rejects(failed.action({ get: () => new File([makeCsv([row, ['103', ...row.slice(1)]])], 'valid.csv') } as unknown as FormData), /status=failed/);
  assert.deepEqual(failed.store.state(), before);
  assert.deepEqual(failed.effects.revalidated, []);
  assert.equal(failed.effects.errors, 1);
});

test('a successful platform action revalidates the directories and reports the committed count', async () => {
  const fixture = loadAction(UserRole.PLATFORM_ADMIN);
  await assert.rejects(fixture.action(fixture.form), /redirect:\/agencies\?status=imported&count=1/);
  assert.deepEqual(fixture.effects.revalidated, ['/agencies', '/visits/new']);
  assert.equal(fixture.store.state().agencies.get('102')!.name, 'Agency One');
});
