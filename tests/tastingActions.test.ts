import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function fixture({ denied = false, role = 'ADMIN' }: { denied?: boolean; role?: 'ADMIN' | 'TASTER' } = {}) {
  class TastingError extends Error {}
  const calls: Array<{ kind: string; actor?: any; raw?: any; path?: string }> = [];
  const actor = { organizationId: 'trusted-org', userId: 'trusted-user', role };
  const transaction = {};
  const dependencies = {
    TastingError,
    requireTastingActor: async () => { if (denied) throw new TastingError('Tasting Management is disabled.'); return { actor }; },
    prisma: { $transaction: async (callback: (db: unknown) => Promise<unknown>) => { calls.push({ kind: 'transaction' }); return callback(transaction); } },
    saveTasting: async (db: unknown, user: typeof actor, raw: any) => {
      assert.equal(db, transaction);
      calls.push({ kind: 'save', actor: user, raw });
      if (user.role !== 'ADMIN') throw new TastingError('Administrator access is required.');
      return { id: 'saved-tasting' };
    },
    transitionTasting: async (db: unknown, user: typeof actor, raw: any) => {
      assert.equal(db, transaction);
      calls.push({ kind: 'transition', actor: user, raw });
      return { id: 'updated-tasting' };
    },
    revalidatePath: (path: string) => { calls.push({ kind: 'revalidate', path }); },
  };
  const filename = resolve('app/tastings/actions.ts');
  const nativeRequire = createRequire(filename);
  const exports: Record<string, (form: FormData) => Promise<any>> = {};
  runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error,
    require: (name: string) => name === 'zod' ? nativeRequire(name) : dependencies,
  });
  return { saveTastingAction: exports.saveTastingAction, transitionTastingAction: exports.transitionTastingAction, calls, actor };
}
const form = (values: Record<string, string>) => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };

test('tasting save caller uses server actor and the selected account within one transaction', async () => {
  const f = fixture();
  const result = await f.saveTastingAction(form({ organizationId: 'forged-org', userId: 'forged-user', role: 'PLATFORM_ADMIN', accountId: 'selected-agency', agencyId: 'stale-agency', submissionKey: 'once' }));
  const saved = f.calls.find(call => call.kind === 'save')!;
  assert.equal(saved.actor, f.actor);
  assert.equal(saved.actor.organizationId, 'trusted-org');
  assert.equal(saved.raw.agencyId, 'selected-agency');
  assert.equal(saved.raw.id, undefined);
  assert.equal(saved.raw.version, undefined);
  assert.equal(f.calls.filter(call => call.kind === 'transaction').length, 1);
  assert.equal(result.href, '/tastings/saved-tasting');
  assert.ok(f.calls.some(call => call.path === '/'));
  assert.ok(f.calls.some(call => call.path === '/agencies/[id]'));
});

test('disabled pilot authorization stops tasting caller mutations before starting a transaction', async () => {
  const f = fixture({ denied: true });
  await assert.rejects(f.saveTastingAction(form({ accountId: 'agency-a' })), /disabled/);
  await assert.rejects(f.transitionTastingAction(form({ id: 'tasting-a', action: 'CANCEL', version: '1' })), /disabled/);
  assert.equal(f.calls.length, 0);
});

test('a forged administrator form cannot replace the authenticated taster actor or refresh rejected writes', async () => {
  const f = fixture({ role: 'TASTER' });
  const result = await f.saveTastingAction(form({ role: 'ADMIN', userId: 'admin-a', organizationId: 'org-b', accountId: 'agency-a' }));
  assert.match(result.error, /Administrator access/);
  assert.equal(f.calls.find(call => call.kind === 'save')!.actor.role, 'TASTER');
  assert.ok(!f.calls.some(call => call.kind === 'revalidate'));
});

test('taster response caller carries the server actor, explicit version and required comment to domain validation', async () => {
  const f = fixture({ role: 'TASTER' });
  const result = await f.transitionTastingAction(form({ id: 'tasting-a', version: '4', action: 'TASTER_NEEDS_EDIT', comment: 'After 5, please.', userId: 'forged-user' }));
  const response = f.calls.find(call => call.kind === 'transition')!;
  assert.equal(response.actor, f.actor);
  assert.equal(response.raw.version, 4);
  assert.equal(response.raw.comment, 'After 5, please.');
  assert.equal(result.success, 'Tasting updated.');
  assert.ok(f.calls.some(call => call.path === '/tastings/updated-tasting'));
});
