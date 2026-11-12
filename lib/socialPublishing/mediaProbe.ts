import { createHash } from 'node:crypto';

export const MAX_SOCIAL_MEDIA_BYTES = 200 * 1024 * 1024;
export const SOCIAL_MEDIA_TYPES = ['image/jpeg', 'image/png', 'video/mp4'] as const;
export type SocialMediaProbe = { mimeType: typeof SOCIAL_MEDIA_TYPES[number]; bytes: number; width: number; height: number; durationSeconds?: number; sha256: string };

/** Inspect file bytes rather than trusting the filename or browser metadata. This does not transcode. */
export function probeSocialMedia(bytes: Buffer): SocialMediaProbe {
  if (bytes.length < 24 || bytes.length > MAX_SOCIAL_MEDIA_BYTES) throw new Error('Choose a valid JPEG, PNG or MP4 file up to 200 MB.');
  let metadata: Omit<SocialMediaProbe, 'bytes' | 'sha256'> | undefined;
  if (bytes.subarray(0, 8).equals(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13 || bytes.length < 45 || !bytes.includes(Buffer.from('IEND'))) throw new Error('The PNG file is incomplete. Export it again.');
    metadata = { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 255) throw new Error('The JPEG file has an invalid header. Export it again.');
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const size = bytes.readUInt16BE(at);
      if (size < 2 || at + size > bytes.length) throw new Error('The JPEG file is incomplete. Export it again.');
      if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) {
        metadata = { mimeType: 'image/jpeg', height: bytes.readUInt16BE(at + 3), width: bytes.readUInt16BE(at + 5) };
        break;
      }
      at += size;
    }
    if (!bytes.subarray(Math.max(0, bytes.length - 32)).includes(Buffer.from([255, 217]))) throw new Error('The JPEG file is incomplete. Export it again.');
  } else if (bytes.toString('ascii', 4, 8) === 'ftyp') {
    const top = mp4Boxes(bytes, 0, bytes.length);
    const movie = top.find(box => box.type === 'moov');
    if (!movie || !top.some(box => box.type === 'mdat')) throw new Error('The MP4 needs a complete movie and media track. Export an H.264 MP4.');
    const movieBoxes = mp4Boxes(bytes, movie.start, movie.end);
    const header = movieBoxes.find(box => box.type === 'mvhd');
    if (!header) throw new Error('The MP4 duration could not be read. Export an H.264 MP4.');
    const version = bytes[header.start];
    const timescaleAt = header.start + (version === 1 ? 20 : 12);
    if (timescaleAt + (version === 1 ? 12 : 8) > header.end) throw new Error('The MP4 movie header is incomplete.');
    const timescale = bytes.readUInt32BE(timescaleAt);
    const duration = version === 1 ? Number(bytes.readBigUInt64BE(timescaleAt + 4)) : bytes.readUInt32BE(timescaleAt + 4);
    if (!timescale || !Number.isFinite(duration)) throw new Error('The MP4 duration is invalid.');
    for (const track of movieBoxes.filter(box => box.type === 'trak')) {
      const children = mp4Boxes(bytes, track.start, track.end);
      const tkhd = children.find(box => box.type === 'tkhd');
      const mdia = children.find(box => box.type === 'mdia');
      if (!tkhd || !mdia) continue;
      const media = mp4Boxes(bytes, mdia.start, mdia.end);
      const hdlr = media.find(box => box.type === 'hdlr');
      if (!hdlr || hdlr.start + 12 > hdlr.end || bytes.toString('ascii', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
      const minf = media.find(box => box.type === 'minf');
      const stbl = minf && mp4Boxes(bytes, minf.start, minf.end).find(box => box.type === 'stbl');
      const stsd = stbl && mp4Boxes(bytes, stbl.start, stbl.end).find(box => box.type === 'stsd');
      if (!stsd || stsd.start + 8 > stsd.end || !mp4Boxes(bytes, stsd.start + 8, stsd.end).some(box => box.type === 'avc1' || box.type === 'avc3')) throw new Error('This pilot accepts H.264 video in MP4. Export the video as H.264 MP4.');
      if (tkhd.end - tkhd.start < 76) throw new Error('The MP4 video dimensions could not be read.');
      let width = bytes.readUInt32BE(tkhd.end - 8) / 65536;
      let height = bytes.readUInt32BE(tkhd.end - 4) / 65536;
      const matrixAt = tkhd.end - 44;
      if (bytes.readInt32BE(matrixAt) === 0 && Math.abs(bytes.readInt32BE(matrixAt + 4)) === 65536) [width, height] = [height, width];
      metadata = { mimeType: 'video/mp4', width, height, durationSeconds: duration / timescale };
      break;
    }
  }
  if (!metadata || !Number.isFinite(metadata.width) || !Number.isFinite(metadata.height) || metadata.width < 1 || metadata.height < 1 || metadata.width > 20000 || metadata.height > 20000) throw new Error('Could not read usable media dimensions. Choose a JPEG, PNG or H.264 MP4.');
  if (metadata.mimeType === 'video/mp4' && (!metadata.durationSeconds || metadata.durationSeconds > 3600)) throw new Error('Choose a finished MP4 between 1 second and 60 minutes. Destination limits may be lower.');
  return { ...metadata, bytes: bytes.length, sha256: createHash('sha256').update(new Uint8Array(bytes)).digest('hex') };
}

type Box = { type: string; start: number; end: number };
function mp4Boxes(buffer: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  for (let at = start; at + 8 <= end;) {
    let size = buffer.readUInt32BE(at), header = 8;
    if (size === 1) {
      if (at + 16 > end) throw new Error('The MP4 file is incomplete.');
      size = Number(buffer.readBigUInt64BE(at + 8)); header = 16;
    }
    if (size === 0) size = end - at;
    if (!Number.isSafeInteger(size) || size < header || at + size > end || boxes.length >= 10000) throw new Error('The MP4 file has an invalid media structure.');
    boxes.push({ type: buffer.toString('ascii', at + 4, at + 8), start: at + header, end: at + size });
    at += size;
  }
  return boxes;
}
