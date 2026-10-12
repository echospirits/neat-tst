import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { canAccessOwnCommunications } from '../lib/crm/communicationsAccess';

function auth(role: string, organizationId: string | null, contextId: string, support = false) {
  const user = { id: 'actor', role, organizationId };
  const compiled = ts.transpileModule(readFileSync('lib/crm/auth.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: { requireCrmActor?: (mailbox?: boolean) => Promise<any> } = {};
  const dependencies: Record<string, unknown> = {
    '../auth': { requireUser: async () => user },
    '../organizations': { requireFeatureForUser: async (actor: unknown, feature: string) => {
      assert.equal(actor, user);
      assert.equal(feature, 'CORE_CRM');
      return { organizationId: contextId, isSupportView: support, organization: { timezone: 'UTC' } };
    } },
    './activity': { CrmError: Error },
    './communicationsAccess': { canAccessOwnCommunications },
  };
  runInNewContext(compiled, { exports, require: (name: string) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } });
  return exports.requireCrmActor!;
}

test('mailbox actions retain the authenticated owner for users, admins and platform admins in their own tenant', async () => {
  for (const role of ['USER', 'ADMIN', 'PLATFORM_ADMIN']) {
    const result = await auth(role, 'own', 'own')(true);
    assert.equal(result.ownCommunications, true);
    assert.equal(result.actor.userId, 'actor');
    assert.equal(result.actor.organizationId, 'own');
  }
});

test('Support View cannot authorize correspondence, even for the same organization', async () => {
  for (const tenant of ['own', 'other']) {
    const requireActor = auth('PLATFORM_ADMIN', 'own', tenant, true);
    assert.equal((await requireActor()).ownCommunications, false);
    await assert.rejects(requireActor(true), /outside Support View/);
  }
});

test('platform authority without matching membership cannot grant mailbox access', async () => {
  for (const membership of [null, 'other']) {
    const requireActor = auth('PLATFORM_ADMIN', membership, 'target');
    assert.equal((await requireActor()).ownCommunications, false);
    await assert.rejects(requireActor(true), /own organization membership/);
  }
});
