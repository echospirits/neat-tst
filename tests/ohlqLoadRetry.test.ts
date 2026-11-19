import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { retryDatabaseRead } from '../lib/databaseReadRetry';
import { retryDatabaseStatusWrite } from '../lib/databaseStatusRetry';

const { retryCommand, isTransientFailure } = createRequire(import.meta.url)('../scripts/retry-ohlq-command.cjs');

test('temporary setup failure recovers inside the same attempt and preserves exact command arguments', async () => {
  const calls: unknown[] = [], delays: number[] = [], warnings: string[] = [];
  const code = await retryCommand('npx', ['playwright', 'install', '--with-deps', 'chromium'], {
    execute: async (...args: unknown[]) => { calls.push(args); return calls.length === 1 ? { code: 100, tail: '503  Service Unavailable PRIVATE_DETAIL' } : { code: 0 }; },
    wait: async (ms: number) => { delays.push(ms); }, warn: (s: string) => warnings.push(s),
  });
  assert.equal(code, 0); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(delays, [15000]); assert.ok(warnings.every(s => !s.includes('PRIVATE_DETAIL')));
});

test('exhausted transient failures retain a nonzero result; permanent and cancelled failures never retry', async () => {
  for (const scenario of [
    { code: 100, tail: '503 Service Unavailable', attempts: 3 },
    { code: 1, tail: 'P1000 Authentication failed', attempts: 1 },
    { code: 1, tail: 'invalid credentials; earlier HTTP 503', attempts: 1 },
    { code: 1, tail: 'Unknown parsing error', attempts: 1 },
    { code: 1, tail: 'ECONNRESET', signal: 'SIGTERM', attempts: 1 },
  ]) {
    let attempts = 0;
    assert.equal(await retryCommand('load', [], { execute: async () => { attempts++; return scenario; }, wait: async () => {}, warn: () => {} }), scenario.code);
    assert.equal(attempts, scenario.attempts);
  }
  assert.equal(isTransientFailure('Source says 503 records'), false);
});

test('uncoded Prisma connection initialization failures retry reads and fixed-value status writes only', async () => {
  for (const retry of [retryDatabaseRead, retryDatabaseStatusWrite]) {
    let calls = 0;
    const result = await retry(async () => {
      if (++calls === 1) throw { name: 'PrismaClientInitializationError', message: "Can't reach database server at PRIVATE_HOST:5432" };
      return 'ok';
    }, { sleep: async () => {}, warn: message => assert.ok(!message.includes('PRIVATE_HOST')) });
    assert.equal(result, 'ok'); assert.equal(calls, 2);
    for (const error of [
      { name: 'PrismaClientInitializationError', message: 'Authentication failed' },
      { name: 'PrismaClientInitializationError', message: "Can't reach database server", errorCode: 'P1000' },
      { name: 'Error', message: "Can't reach database server" },
    ]) {
      calls = 0;
      await assert.rejects(retry(async () => { calls++; throw error; }, { sleep: async () => {} }));
      assert.equal(calls, 1);
    }
  }
});
