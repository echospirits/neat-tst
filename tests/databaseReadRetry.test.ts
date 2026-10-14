import assert from 'node:assert/strict';
import test from 'node:test';
import { retryDatabaseRead } from '../lib/databaseReadRetry';

test('database reads recover from transient connectivity with bounded backoff', async () => {
  const delays: number[] = [];
  let calls = 0;
  const result = await retryDatabaseRead(async () => {
    if (++calls < 3) throw { code: 'P1001' };
    return 42;
  }, { sleep: async (ms) => { delays.push(ms); }, warn: () => {} });
  assert.equal(result, 42);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
});

test('persistent connectivity failures retain their original error after three attempts', async () => {
  const error = { errorCode: 'P1017' };
  let calls = 0;
  await assert.rejects(retryDatabaseRead(async () => { calls++; throw error; }, {
    sleep: async () => {}, warn: () => {},
  }), (caught) => caught === error);
  assert.equal(calls, 3);
});

test('authentication, validation, constraint and unknown errors are never retried', async () => {
  for (const code of ['P1000', 'P2002', 'P2003', 'P2025', undefined]) {
    let calls = 0;
    const error = { code };
    await assert.rejects(retryDatabaseRead(async () => { calls++; throw error; }), (caught) => caught === error);
    assert.equal(calls, 1);
  }
});
