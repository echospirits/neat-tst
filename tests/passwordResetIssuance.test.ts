import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { SendEmailInput } from '../lib/email/sendEmail';
import * as passwordReset from '../lib/passwordReset';

type ResetRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};
type UserRecord = { id: string; email: string; isActive: boolean; passwordHash: string | null };
type Response = { status: number; body: { message: string } };

// Run the actual route with committed/staged token state and per-user row locks.
// Concurrent transactions are unrestricted until the route acquires its SQL lock.
function fixture(source = readFileSync('app/api/auth/forgot-password/route.ts', 'utf8')) {
  const users: UserRecord[] = [
    { id: 'user-1', email: 'alex@example.com', isActive: true, passwordHash: 'hash' },
    { id: 'user-2', email: 'sam@example.com', isActive: true, passwordHash: 'hash' },
  ];
  const records: ResetRecord[] = [];
  const emails: SendEmailInput[] = [];
  const errors: string[] = [];
  const afterCallbacks: Array<() => Promise<void>> = [];
  const lockTails = new Map<string, Promise<void>>();
  let now = Date.parse('2026-10-08T20:00:00Z');
  let nextId = 0;
  let transactions = 0;
  let failDelivery = false;
  let failInvalidation = false;
  let afterLookup: (() => void) | undefined;

  const matches = (record: ResetRecord, where: any) =>
    (!where.userId || record.userId === where.userId) &&
    (!where.id || (typeof where.id === 'string' ? record.id === where.id : record.id !== where.id.not)) &&
    (where.usedAt !== null || record.usedAt === null) &&
    (!where.createdAt || record.createdAt.getTime() > where.createdAt.gt.getTime());
  const tokenApi = (staged = new Map<string, ResetRecord>()) => {
    const visible = () => [...records.filter((record) => !staged.has(record.id)), ...staged.values()];
    return {
      findFirst: async ({ where }: any) => visible().find((record) => matches(record, where)) ?? null,
      create: async ({ data }: any) => {
        const record = { id: `reset-${++nextId}`, usedAt: null, createdAt: new Date(now), ...data };
        staged.set(record.id, record);
        return { ...record };
      },
      updateMany: async ({ where, data }: any) => {
        if (failInvalidation && where.id?.not) throw new Error('Invalidation failed');
        const selected = visible().filter((record) => matches(record, where));
        for (const record of selected) staged.set(record.id, { ...record, ...data });
        return { count: selected.length };
      },
    };
  };
  const commit = (staged: Map<string, ResetRecord>) => {
    for (const record of staged.values()) {
      const index = records.findIndex((existing) => existing.id === record.id);
      if (index === -1) records.push(record);
      else records[index] = record;
    }
  };
  const db = {
    user: {
      findUnique: async ({ where }: any) => {
        const user = users.find((candidate) => candidate.email === where.email);
        const result = user ? { ...user } : null;
        afterLookup?.();
        return result;
      },
    },
    passwordResetToken: {
      findFirst: tokenApi().findFirst,
      updateMany: async (input: any) => {
        const staged = new Map<string, ResetRecord>();
        const result = await tokenApi(staged).updateMany(input);
        commit(staged);
        return result;
      },
      deleteMany: async ({ where }: any) => {
        const index = records.findIndex((record) => record.id === where.id);
        if (index !== -1) records.splice(index, 1);
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>, options?: any) => {
      transactions++;
      const staged = new Map<string, ResetRecord>();
      let release: (() => void) | undefined;
      const tx = {
        passwordResetToken: tokenApi(staged),
        $queryRaw: async (parts: TemplateStringsArray, userId: string) => {
          const sql = parts.join('?');
          assert.match(sql, /SELECT "id" FROM "User"/);
          assert.match(sql, /"isActive" = TRUE AND "passwordHash" IS NOT NULL/);
          assert.match(sql, /FOR UPDATE/);
          assert.equal(parts.length, 2, 'user id is a bound parameter');
          assert.equal(options?.isolationLevel, 'ReadCommitted', 'cooldown sees preceding commits after waiting');
          const previous = lockTails.get(userId) ?? Promise.resolve();
          const current = new Promise<void>((resolveLock) => { release = resolveLock; });
          lockTails.set(userId, current);
          await previous;
          const user = users.find((candidate) => candidate.id === userId && candidate.isActive && candidate.passwordHash);
          return user ? [{ id: user.id }] : [];
        },
      };
      try {
        const result = await callback(tx);
        commit(staged);
        return result;
      } finally {
        release?.();
      }
    },
  };
  const filename = resolve('app/api/auth/forgot-password/route.ts');
  const require = createRequire(filename);
  const exports: any = {};
  class ClockDate extends Date {
    constructor(value?: string | number | Date) {
      super(value === undefined ? now : value instanceof Date ? value.getTime() : value);
    }
  }
  const mocks: Record<string, unknown> = {
    'next/server': {
      NextResponse: { json: (body: Response['body'], { status }: { status: number }) => ({ body, status }) },
      after: (callback: () => Promise<void>) => { afterCallbacks.push(callback); },
    },
    '../../../../lib/prisma': { prisma: db },
    '../../../../lib/passwordReset': {
      ...passwordReset,
      sendPasswordResetEmail: (input: Parameters<typeof passwordReset.sendPasswordResetEmail>[0]) =>
        passwordReset.sendPasswordResetEmail({
          ...input,
          appBaseUrl: 'https://crm.example.com',
          emailSender: async (email) => {
            // Sending must happen after the issuance transaction commits.
            assert.ok(records.some((record) => email.idempotencyKey === `password-reset-${record.id}`));
            emails.push(email);
            if (failDelivery) throw new Error('Provider outcome unknown');
            return { providerMessageId: `email-${emails.length}` };
          },
        }),
    },
  };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    Date: ClockDate,
    console: { error: (message: string) => errors.push(message) },
    require: (name: string) => name in mocks ? mocks[name] : require(name),
  }, { filename });
  return {
    users, records, emails, errors,
    post: async (email = 'alex@example.com') => {
      const response = await exports.POST({ json: async () => ({ email }) }) as Response;
      // The response is available first. Drain queued work concurrently so the
      // issuance assertions still exercise overlapping background transactions.
      await Promise.all(afterCallbacks.splice(0).map(callback => callback()));
      return response;
    },
    advance: (milliseconds: number) => { now += milliseconds; },
    failDelivery: () => { failDelivery = true; },
    failInvalidation: () => { failInvalidation = true; },
    afterLookup: (callback: () => void) => { afterLookup = callback; },
    transactions: () => transactions,
  };
}

const genericMessage = 'If an active account uses that email, a password reset link will arrive shortly.';
const assertGeneric = (responses: Response[]) => {
  for (const response of responses) {
    assert.equal(response.status, 202);
    assert.equal(response.body.message, genericMessage);
  }
};

test('twenty parallel reset requests create and send exactly one reset capability', async () => {
  const f = fixture();
  assertGeneric(await Promise.all(Array.from({ length: 20 }, () => f.post(' ALEX@EXAMPLE.COM '))));
  assert.equal(f.transactions(), 20);
  assert.equal(f.records.length, 1);
  assert.equal(f.emails.length, 1);
  assert.equal(f.records[0].usedAt, null);
  const token = /token=([A-Za-z0-9_-]+)/.exec(f.emails[0].text)?.[1];
  assert.ok(token);
  assert.equal(passwordReset.hashPasswordResetToken(token), f.records[0].tokenHash);
  assert.notEqual(token, f.records[0].tokenHash);
  assert.equal(f.errors.length, 0);
});

test('cooldown blocks sequential requests and permits one new issuance at its boundary', async () => {
  const f = fixture();
  await f.post();
  const firstId = f.records[0].id;
  await f.post('sam@example.com');
  const otherUserId = f.records[1].id;
  f.advance(passwordReset.PASSWORD_RESET_COOLDOWN_MS - 1);
  await f.post();
  assert.equal(f.emails.length, 2);
  f.advance(1);
  assertGeneric(await Promise.all(Array.from({ length: 12 }, () => f.post())));
  assert.equal(f.emails.length, 3);
  assert.equal(f.records.length, 3);
  assert.ok(f.records.find((record) => record.id === firstId)?.usedAt);
  assert.equal(f.records.find((record) => record.id === otherUserId)?.usedAt, null);
  assert.equal(f.records.filter((record) => record.userId === 'user-1' && !record.usedAt).length, 1);
});

test('delivery failure consumes the claim without allowing a concurrent or immediate email retry', async () => {
  const f = fixture();
  f.failDelivery();
  assertGeneric(await Promise.all(Array.from({ length: 20 }, () => f.post())));
  await f.post();
  assert.equal(f.emails.length, 1);
  assert.equal(f.records.length, 1);
  assert.ok(f.records[0].usedAt);
  f.advance(passwordReset.PASSWORD_RESET_COOLDOWN_MS);
  await f.post();
  assert.equal(f.emails.length, 2);
  assert.equal(f.records.length, 2);
});

test('an issuance transaction failure rolls back the capability and sends no email', async () => {
  const f = fixture();
  f.failInvalidation();
  assertGeneric([await f.post()]);
  assert.equal(f.records.length, 0);
  assert.equal(f.emails.length, 0);
  assert.equal(f.errors.length, 1);
});

test('unknown, inactive and passwordless users retain the generic response without issuance', async () => {
  const f = fixture();
  f.users[0].isActive = false;
  f.users[1].passwordHash = null;
  assertGeneric(await Promise.all([f.post(), f.post('sam@example.com'), f.post('unknown@example.com')]));
  assert.equal(f.transactions(), 0);
  assert.equal(f.records.length, 0);
  assert.equal(f.emails.length, 0);
});

test('eligibility is rechecked under the lock if the account is disabled after lookup', async () => {
  const f = fixture();
  f.afterLookup(() => { f.users[0].isActive = false; });
  assertGeneric([await f.post()]);
  assert.equal(f.transactions(), 1);
  assert.equal(f.records.length, 0);
  assert.equal(f.emails.length, 0);
});

test('parallel reset batches for different users each receive one capability', async () => {
  const f = fixture();
  assertGeneric(await Promise.all(Array.from({ length: 20 }, (_, index) => f.post(index % 2 ? 'alex@example.com' : 'sam@example.com'))));
  assert.equal(f.records.length, 2);
  assert.equal(f.emails.length, 2);
  assert.equal(new Set(f.records.map((record) => record.userId)).size, 2);
  assert.equal(f.errors.length, 0);
});

test('invalid email input is rejected before lookup or issuance', async () => {
  const f = fixture();
  const response = await f.post('not-an-email');
  assert.equal(response.status, 400);
  assert.equal(f.transactions(), 0);
  assert.equal(f.records.length, 0);
  assert.equal(f.emails.length, 0);
});
