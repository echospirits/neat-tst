import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server';
import ts from 'typescript';
import { z } from 'zod';
import { createPasswordResetToken, hashPasswordResetToken, PASSWORD_RESET_COOLDOWN_MS, PASSWORD_RESET_HOURS } from '../lib/passwordReset';

type User = { id: string; isActive: boolean; passwordHash: string | null };
const activeUser: User = { id: 'user-1', isActive: true, passwordHash: 'hash' };
const message = 'If an active account uses that email, a password reset link will arrive shortly.';

// Execute the complete production route. The after mock holds callbacks until
// explicitly flushed, matching Next's response-completion boundary.
function loadRoute(options: {
  user?: User | null;
  cooldown?: boolean;
  lookup?: () => Promise<User | null>;
  send?: () => Promise<void>;
  persistenceFailure?: boolean;
  cleanupFailure?: boolean;
} = {}) {
  const callbacks: Array<() => Promise<void>> = [];
  const calls: Array<{ operation: string; input: any }> = [];
  const errors: string[] = [];
  const record = (operation: string, input: any) => calls.push({ operation, input });
  const prisma = {
    user: {
      findUnique: async (input: any) => {
        record('lookup', input);
        return options.lookup ? options.lookup() : options.user ?? null;
      },
    },
    passwordResetToken: {
      findFirst: async (input: any) => {
        record('cooldown', input);
        return options.cooldown ? { id: 'recent-reset' } : null;
      },
      create: async (input: any) => {
        record('create', input);
        if (options.persistenceFailure) throw new Error('database unavailable');
        return { id: 'reset-1' };
      },
      updateMany: async (input: any) => {
        const operation = typeof input.where.id === 'string' ? 'consume' : 'invalidate';
        record(operation, input);
        if (operation === 'consume' && options.cleanupFailure) throw new Error('cleanup unavailable');
      },
    },
    $queryRaw: async (parts: TemplateStringsArray, userId: string) => {
      record('lock', { sql: parts.join('?'), userId });
      return options.user?.id === userId && options.user.isActive && options.user.passwordHash ? [{ id: userId }] : [];
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>, transactionOptions: unknown) => {
      record('transaction', transactionOptions);
      return callback(prisma);
    },
  };
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse, after: (callback: () => Promise<void>) => callbacks.push(callback) },
    zod: { z },
    '../../../../lib/prisma': { prisma },
    '../../../../lib/passwordReset': {
      createPasswordResetToken,
      PASSWORD_RESET_COOLDOWN_MS,
      sendPasswordResetEmail: async (input: any) => {
        record('send', input);
        await options.send?.();
      },
    },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync('app/api/auth/forgot-password/route.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    exports,
    console: { error: (value: string) => errors.push(value) },
    require: (name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return { callbacks, calls, errors, post: exports.POST as (request: NextRequest) => Promise<NextResponse> };
}

function request(body: unknown = { email: '  ALEX@EXAMPLE.COM  ' }) {
  return new NextRequest('https://crm.example.com/api/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

for (const [name, user, cooldown] of [
  ['eligible', activeUser, false],
  ['missing', null, false],
  ['inactive', { ...activeUser, isActive: false }, false],
  ['passwordless', { ...activeUser, passwordHash: null }, false],
  ['cooldown', activeUser, true],
] as const) {
  test(`${name} account receives the same response before any account-dependent work`, async () => {
    const route = loadRoute({ user, cooldown });
    const response = await route.post(request());
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { message });
    assert.equal(route.callbacks.length, 1);
    assert.equal(route.calls.length, 0);

    await route.callbacks[0]();
    assert.equal(route.calls[0].input.where.email, 'alex@example.com');
    assert.equal(route.calls.some(call => call.operation === 'send'), name === 'eligible');
    assert.equal(route.calls.some(call => call.operation === 'transaction'), name === 'eligible' || name === 'cooldown');
    assert.deepEqual(route.errors, []);
  });
}

test('a blocked account lookup cannot delay or change the public response', async () => {
  let release!: (user: User | null) => void;
  const lookup = new Promise<User | null>(resolve => { release = resolve; });
  const route = loadRoute({ lookup: () => lookup });
  const response = await route.post(request());
  assert.equal(response.status, 202);
  assert.equal(route.calls.length, 0);
  const work = route.callbacks[0]();
  assert.deepEqual(route.calls.map(call => call.operation), ['lookup']);
  assert.deepEqual(await response.json(), { message });
  release(null);
  await work;
});

test('slow email delivery happens after response and preserves token and cooldown semantics', async () => {
  let release!: () => void;
  let providerStarted!: () => void;
  const started = new Promise<void>(resolve => { providerStarted = resolve; });
  const delivery = new Promise<void>(resolve => { release = resolve; });
  const route = loadRoute({ user: activeUser, send: () => { providerStarted(); return delivery; } });
  const response = await route.post(request());
  const work = route.callbacks[0]();
  await started;
  const created = route.calls.find(call => call.operation === 'create')!.input.data;
  const sent = route.calls.find(call => call.operation === 'send')!.input;
  const invalidation = route.calls.find(call => call.operation === 'invalidate')!.input;
  const cooldown = route.calls.find(call => call.operation === 'cooldown')!.input;
  assert.equal(created.userId, activeUser.id);
  assert.equal(created.tokenHash, hashPasswordResetToken(sent.token));
  assert.equal(Object.hasOwn(created, 'token'), false);
  assert.equal(sent.recipientEmail, 'alex@example.com');
  assert.equal(sent.resetRequestId, 'reset-1');
  assert.equal(created.expiresAt.getTime() - invalidation.data.usedAt.getTime(), PASSWORD_RESET_HOURS * 60 * 60 * 1000);
  assert.equal(invalidation.data.usedAt.getTime() - cooldown.where.createdAt.gt.getTime(), PASSWORD_RESET_COOLDOWN_MS);
  assert.equal(invalidation.where.userId, activeUser.id);
  assert.equal(invalidation.where.id.not, 'reset-1');
  assert.equal(invalidation.where.usedAt, null);
  assert.equal(route.calls.find(call => call.operation === 'transaction')!.input.isolationLevel, 'ReadCommitted');
  assert.match(route.calls.find(call => call.operation === 'lock')!.input.sql, /FOR UPDATE/);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { message });
  release();
  await work;
});

test('failed delivery consumes the new token, retains its cooldown claim and cannot change the response', async () => {
  const route = loadRoute({ user: activeUser, send: async () => { throw new Error('provider rejected'); } });
  const response = await route.post(request());
  await route.callbacks[0]();
  const consumed = route.calls.find(call => call.operation === 'consume')!.input;
  assert.equal(consumed.where.id, 'reset-1');
  assert.equal(consumed.where.usedAt, null);
  assert.ok(consumed.data.usedAt);
  assert.deepEqual(route.errors, ['Password reset email delivery failed.']);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { message });
});

for (const [name, options] of [
  ['lookup', { lookup: async () => { throw new Error('lookup unavailable'); } }],
  ['persistence', { user: activeUser, persistenceFailure: true }],
  ['cleanup', { user: activeUser, cleanupFailure: true, send: async () => { throw new Error('provider rejected'); } }],
] as const) {
  test(`${name} failure is contained after the generic response`, async () => {
    const route = loadRoute(options);
    const response = await route.post(request());
    await assert.doesNotReject(route.callbacks[0]);
    assert.deepEqual(route.errors, ['Password reset request could not be completed.']);
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { message });
  });
}

test('invalid emails and malformed JSON still return 400 without scheduling recovery', async () => {
  const route = loadRoute();
  for (const input of [request({ email: 'invalid' }), request({}), new NextRequest('https://crm.example.com/api/auth/forgot-password', { method: 'POST', body: '{' })]) {
    const response = await route.post(input);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'Enter a valid email address.' });
  }
  assert.deepEqual(route.callbacks, []);
  assert.equal(route.calls.length, 0);
});
