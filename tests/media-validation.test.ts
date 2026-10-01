import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaUpload } from '../lib/server/media-validation.ts';

function png(width = 1, height = 1) {
  const bytes = new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10], 0);
  bytes.set([0,0,0,13,73,72,68,82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
function jpeg(width = 1, height = 1) {
  return new Uint8Array([255,216,255,192,0,11,8, height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);
}
function webp(width = 1, height = 1) {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'),0); bytes.set(new TextEncoder().encode('WEBP'),8); bytes.set(new TextEncoder().encode('VP8X'),12);
  const w=width-1,h=height-1; bytes[24]=w&255;bytes[25]=(w>>8)&255;bytes[26]=(w>>16)&255;bytes[27]=h&255;bytes[28]=(h>>8)&255;bytes[29]=(h>>16)&255;
  return bytes;
}

const cases: Array<[string,string,Uint8Array]> = [
  ['a.jpg','image/jpeg',jpeg()],
  ['a.png','image/png',png()],
  ['a.webp','image/webp',webp()],
  ['a.mp4','video/mp4',new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])],
  ['a.webm','video/webm',new Uint8Array([26,69,223,163,1])],
];

for (const [name,type,bytes] of cases) test(`accepts ${type} when signature matches`, async () => {
  const result = await validateMediaUpload(new File([bytes], name, { type }));
  assert.equal(result.mimeType, type);
  assert.equal(result.byteSize, bytes.length);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
});

test('rejects zero byte, unsupported and MIME/signature mismatch files', async () => {
  await assert.rejects(() => validateMediaUpload(new File([], 'x.png', {type:'image/png'})), /empty/i);
  await assert.rejects(() => validateMediaUpload(new File([new Uint8Array([77,90,1,2])], 'x.exe', {type:'application/octet-stream'})), /type/i);
  await assert.rejects(() => validateMediaUpload(new File([new Uint8Array([77,90,1,2])], 'x.png', {type:'image/png'})), /signature/i);
});

test('rejects files above 20 MiB before storage', async () => {
  const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' });
  await assert.rejects(() => validateMediaUpload(oversized), /20 MiB/i);
});

test('rejects oversized image dimensions', async () => {
  await assert.rejects(() => validateMediaUpload(new File([png(10001, 1)], 'huge.png', {type:'image/png'})), /dimensions/i);
  await assert.rejects(() => validateMediaUpload(new File([png(7000, 7000)], 'pixels.png', {type:'image/png'})), /dimensions/i);
});
