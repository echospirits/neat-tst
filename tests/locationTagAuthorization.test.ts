import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/tags/actions.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function loadAction(lookupError?: Error) {
  const queries: Array<{ id: string; organizationId: string }> = [];
  const writes: any[] = [];
  const rows = new Map<string, any>();
  const refreshed: string[] = [];
  const tags = new Map([
    ['owned-tag', { id: 'owned-tag', organizationId: 'tenant' }],
    ['foreign-tag', { id: 'foreign-tag', organizationId: 'other-tenant' }],
  ]);
  const exports: Record<string, unknown> = {};
  const dependencies: Record<string, unknown> = {
    'next/cache': { revalidatePath: (path: string) => refreshed.push(path) },
    'next/navigation': { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
    '../../lib/auth': { requireUser: async () => ({ id: 'rep' }) },
    '../../lib/organizations': { requireOrganizationContext: async () => ({ organizationId: 'tenant' }) },
    '../../lib/prisma': { prisma: {
      tag: { findFirst: async ({ where, select }: any) => {
        queries.push({ ...where });
        assert.deepEqual(Object.keys(select), ['id']);
        assert.equal(select.id, true);
        if (lookupError) throw lookupError;
        const tag = tags.get(where.id);
        return tag && tag.organizationId === where.organizationId ? { id: tag.id } : null;
      } },
      locationTag: { upsert: async (args: any) => {
        writes.push(args);
        const unique = Object.values(args.where)[0];
        const key = JSON.stringify(unique);
        const previous = rows.get(key);
        const row = previous ? { ...previous, ...args.update } : { ...args.create };
        rows.set(key, row);
        return row;
      } },
    } },
  };
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    run: exports.addLocationTag as (data: FormData) => Promise<never>,
    queries, writes, rows, refreshed,
  };
}

function form(location: 'agencyId' | 'wholesaleAccountId', tagId = 'owned-tag') {
  const data = new FormData();
  data.set(location, 'location');
  data.set('tagId', tagId);
  data.set('note', '  Follow up  ');
  data.set('returnTo', '/account-context');
  return data;
}

for (const location of ['agencyId', 'wholesaleAccountId'] as const) {
  for (const tagId of ['foreign-tag', 'missing-tag']) {
    test(`${location}: rejects ${tagId} without writes or cache invalidation`, async () => {
      const { run, queries, writes, rows, refreshed } = loadAction();
      await assert.rejects(run(form(location, tagId)), /^Error: REDIRECT:\/account-context\?tagStatus=invalid$/);
      assert.deepEqual(queries, [{ id: tagId, organizationId: 'tenant' }]);
      assert.equal(writes.length, 0);
      assert.equal(rows.size, 0);
      assert.deepEqual(refreshed, []);
    });
  }

  test(`${location}: accepts an owned tag and preserves idempotent note updates and account refresh`, async () => {
    const { run, queries, writes, rows, refreshed } = loadAction();
    const data = form(location);
    await assert.rejects(run(data), /^Error: REDIRECT:\/account-context\?tagStatus=added$/);
    data.set('note', 'Updated note');
    await assert.rejects(run(data), /^Error: REDIRECT:\/account-context\?tagStatus=added$/);
    assert.deepEqual(queries, [
      { id: 'owned-tag', organizationId: 'tenant' },
      { id: 'owned-tag', organizationId: 'tenant' },
    ]);
    assert.equal(writes.length, 2);
    const key = `organizationId_tagId_${location}`;
    assert.equal(Object.keys(writes[0].where)[0], key);
    assert.deepEqual({ ...writes[0].where[key] }, { organizationId: 'tenant', tagId: 'owned-tag', [location]: 'location' });
    assert.deepEqual({ ...writes[0].create }, {
      organizationId: 'tenant', tagId: 'owned-tag', [location]: 'location',
      note: 'Follow up', createdByUserId: 'rep',
    });
    assert.equal(rows.size, 1);
    assert.equal([...rows.values()][0].note, 'Updated note');
    const accountPath = location === 'agencyId' ? '/agencies/location' : '/wholesale/location';
    assert.deepEqual(refreshed, ['/tags', '/agencies', '/wholesale', accountPath, '/tags', '/agencies', '/wholesale', accountPath]);
  });

  test(`${location}: a failed ownership lookup stops before any write`, async () => {
    const { run, writes, refreshed } = loadAction(new Error('Lookup unavailable'));
    await assert.rejects(run(form(location)), /Lookup unavailable/);
    assert.equal(writes.length, 0);
    assert.deepEqual(refreshed, []);
  });
}

test('invalid tag/location selections are rejected before any lookup or write', async () => {
  for (const shape of ['no-tag', 'no-location', 'both-locations']) {
    const { run, queries, writes, refreshed } = loadAction();
    const data = form('agencyId');
    if (shape === 'no-tag') data.delete('tagId');
    if (shape === 'no-location') data.delete('agencyId');
    if (shape === 'both-locations') data.set('wholesaleAccountId', 'another-location');
    await assert.rejects(run(data), /REDIRECT:\/account-context\?tagStatus=invalid/);
    assert.deepEqual(queries, []);
    assert.equal(writes.length, 0);
    assert.deepEqual(refreshed, []);
  }
});
