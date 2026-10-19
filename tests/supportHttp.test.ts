import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSupportOrigin, readSupportBody, supportFailure, supportHeaders } from '../lib/supportHttp';
import { SupportError } from '../lib/support';

test('support writes reject missing/foreign origins and accept only same-origin requests', () => {
  for (const origin of [undefined, 'https://evil.example', 'null']) {
    assert.throws(() => checkSupportOrigin(new Request('https://neat.example/api/support', { method: 'POST', headers: origin ? { origin } : {} })), (error: any) => error.status === 403);
  }
  checkSupportOrigin(new Request('https://neat.example/api/support', { method: 'POST', headers: { origin: 'https://neat.example' } }));
});

test('request body limits apply to declared length and chunked requests without a length', async () => {
  await assert.rejects(readSupportBody(new Request('https://neat.example/api/support', { method: 'POST', headers: { 'content-length': '100' }, body: 'short' }), 10), (error: any) => error.status === 413);
  await assert.rejects(readSupportBody(new Request('https://neat.example/api/support', { method: 'POST', body: '12345678901' }), 10), (error: any) => error.status === 413);
  assert.equal((await readSupportBody(new Request('https://neat.example/api/support', { method: 'POST', body: 'small' }), 10)).toString(), 'small');
});

test('support responses stay private and unexpected backend error details never reach the reporter', async () => {
  const original = console.error;
  const logs: unknown[][] = []; console.error = (...values) => { logs.push(values); };
  try {
    const response = supportFailure(new Error('connection password=secret and private report text'));
    assert.equal(response.status, 503); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(JSON.stringify(await response.json()).includes('secret'), false); assert.equal(JSON.stringify(logs).includes('secret'), false);
    const invalid = supportFailure(new SupportError('Check summary', 400, { title: 'Too short' }));
    assert.equal((await invalid.json()).fields.title, 'Too short');
    assert.equal(supportHeaders['X-Content-Type-Options'], 'nosniff');
  } finally { console.error = original; }
});
