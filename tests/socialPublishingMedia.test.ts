import test from 'node:test';
import assert from 'node:assert/strict';
import { probeSocialMedia } from '../lib/socialPublishing/mediaProbe';
import { createDispatchMediaUrl, socialUploadPath, verifyDispatchMediaSignature } from '../lib/socialPublishing/media';

test('social media probes bytes instead of trusting a filename, rejects incomplete or unsupported files', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlp0AAAAASUVORK5CYII=', 'base64');
  const result = probeSocialMedia(png);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => probeSocialMedia(png.subarray(0, 25)), /incomplete/);
  assert.throws(() => probeSocialMedia(Buffer.from('<svg onload="alert(1)"></svg>')), /Could not read/);
  assert.throws(() => probeSocialMedia(Buffer.alloc(201 * 1024 * 1024)), /200 MB/);
});

test('social MP4 probe rejects unsupported codecs, corrupt boxes and reads finished-video dimensions/duration', () => {
  const box = (kind: string, ...parts: Buffer[]) => { const payload = Buffer.concat(parts.map(part => new Uint8Array(part))); const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(kind, 4, 'ascii'); return Buffer.concat([new Uint8Array(header), new Uint8Array(payload)]); };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(15000, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeInt32BE(65536, 40); tkhd.writeUInt32BE(1080 * 65536, 76); tkhd.writeUInt32BE(1920 * 65536, 80);
  const hdlr = Buffer.alloc(24); hdlr.write('vide', 8, 'ascii');
  const stsdHeader = Buffer.alloc(8); stsdHeader.writeUInt32BE(1, 4);
  const movie = (codec: string) => box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), box('mdia', box('hdlr', hdlr), box('minf', box('stbl', box('stsd', stsdHeader, box(codec, Buffer.alloc(78))))))));
  const file = (codec: string) => Buffer.concat([new Uint8Array(box('ftyp', Buffer.from('isom0000'))), new Uint8Array(box('mdat', Buffer.alloc(32))), new Uint8Array(movie(codec))]);
  const result = probeSocialMedia(file('avc1'));
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(result.durationSeconds, 15);
  assert.throws(() => probeSocialMedia(file('hvc1')), /H.264/);
  const broken = file('avc1'); broken.writeUInt32BE(0xffffffff, 0);
  assert.throws(() => probeSocialMedia(broken), /invalid media structure/);
});

test('dispatch URL is scoped to one immutable media version and tenant, expires, and cannot be minted with insecure origin', () => {
  const before = { base: process.env.APP_BASE_URL, signing: process.env.SOCIAL_MEDIA_SIGNING_SECRET, app: process.env.APP_ENV };
  process.env.APP_BASE_URL = 'https://neat.example.test'; process.env.SOCIAL_MEDIA_SIGNING_SECRET = 'test-only-signing-key-32-characters-long'; process.env.APP_ENV = 'test';
  try {
    const media = { id: 'media1', organizationId: 'tenant1', sha256: 'a'.repeat(64), storageKey: 'private-media' };
    const now = new Date('2026-11-12T15:00:00Z');
    const url = new URL(createDispatchMediaUrl(media, now));
    assert.equal(verifyDispatchMediaSignature(media, url.searchParams.get('expires'), url.searchParams.get('signature'), now), true);
    assert.equal(verifyDispatchMediaSignature({ ...media, id: 'media2' }, url.searchParams.get('expires'), url.searchParams.get('signature'), now), false);
    assert.equal(verifyDispatchMediaSignature({ ...media, organizationId: 'tenant2' }, url.searchParams.get('expires'), url.searchParams.get('signature'), now), false);
    assert.equal(verifyDispatchMediaSignature({ ...media, sha256: 'b'.repeat(64) }, url.searchParams.get('expires'), url.searchParams.get('signature'), now), false);
    assert.equal(verifyDispatchMediaSignature(media, url.searchParams.get('expires'), url.searchParams.get('signature'), new Date('2026-11-13T15:00:01Z')), false);
    process.env.APP_BASE_URL = 'http://example.test';
    assert.throws(() => createDispatchMediaUrl(media), /HTTPS/);
  } finally {
    for (const [key, value] of Object.entries({ APP_BASE_URL: before.base, SOCIAL_MEDIA_SIGNING_SECRET: before.signing, APP_ENV: before.app })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('social upload identity rejects traversal and preserves tenant, group and uploader scope', () => {
  assert.equal(socialUploadPath('tenant1', 'group1', 'user1', 'upload1', 'jpg'), 'social/tenant1/group1/user1/upload1.jpg');
  assert.throws(() => socialUploadPath('tenant1', '../group2', 'user1', 'upload1', 'jpg'), /Invalid media upload identity/);
  assert.throws(() => socialUploadPath('tenant1', 'group1', 'user1', 'upload1', 'svg'), /Invalid media upload identity/);
});
