import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const w=width-1,h=height-1; bytes[24]=w&255;bytes[25]=(w>>8)&255;bytes[26]=(w>>16)&255;bytes[27]=h&255;bytes[28]=(h>>8)&255;bytes[29]=(h>>16)&255;
  return bytes;
}
function asBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const cases: Array<[string,string,Uint8Array]> = [
  ['a.jpg','image/jpeg',jpeg()],
  ['a.png','image/png',png()],
  ['a.webp','image/webp',webp()],
  ['a.mp4','video/mp4',new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])],
  ['a.webm','video/webm',new Uint8Array([26,69,223,163,1])],
];

for (const [name,type,bytes] of cases) test(`accepts ${type} when signature matches`, async () => {
  const result = await validateMediaUpload(new File([asBlobPart(bytes)], name, { type }));
  assert.equal(result.mimeType, type);
  assert.equal(result.byteSize, bytes.length);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
});

test('rejects zero byte, unsupported and MIME/signature mismatch files', async () => {
  await assert.rejects(() => validateMediaUpload(new File([], 'x.png', {type:'image/png'})), /empty/i);
  await assert.rejects(() => validateMediaUpload(new File([new ArrayBuffer(4)], 'x.exe', {type:'application/octet-stream'})), /type/i);
  const mismatch = new Uint8Array([77,90,1,2]);
  await assert.rejects(() => validateMediaUpload(new File([asBlobPart(mismatch)], 'x.png', {type:'image/png'})), /signature/i);
});

test('rejects files above 20 MiB before storage', async () => {
  const oversized = new File([new ArrayBuffer(20 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' });
  await assert.rejects(() => validateMediaUpload(oversized), /20 MiB/i);
});

test('rejects oversized image dimensions', async () => {
  await assert.rejects(() => validateMediaUpload(new File([asBlobPart(png(10001, 1))], 'huge.png', {type:'image/png'})), /dimensions/i);
  await assert.rejects(() => validateMediaUpload(new File([asBlobPart(png(7000, 7000))], 'pixels.png', {type:'image/png'})), /dimensions/i);
});

// Real 2x3 RGB images encoded and independently decoded with sharp 0.35.4.
// Keep fixtures inline so runtime tests do not need an image decoder dependency.
const simpleWebp = {
  VP8: 'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAUAmJZACdLoAA5gA/vi1F/quTsT44f3NjnFshgAA',
  VP8L: 'UklGRh4AAABXRUJQVlA4TBEAAAAvAYAAAAdQnlKUrP+BiOh/AAA=',
};
function webpFile(bytes: Uint8Array) {
  return new File([asBlobPart(bytes)], 'fixture.webp', { type: 'image/webp' });
}
function setSimpleDimensions(bytes: Uint8Array, format: keyof typeof simpleWebp, width: number, height: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'VP8') {
    view.setUint16(26, width, true); view.setUint16(28, height, true);
  } else {
    view.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  }
}
for (const format of ['VP8', 'VP8L'] as const) {
  test(`reads real ${format} WebP dimensions and preserves bytes/checksum`, async () => {
    const bytes = Buffer.from(simpleWebp[format], 'base64');
    const result = await validateMediaUpload(webpFile(bytes));
    assert.equal(result.width, 2); assert.equal(result.height, 3);
    assert.deepEqual(result.bytes, new Uint8Array(bytes));
    assert.equal(result.checksum, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.extension, 'webp');
    assert.equal(result.byteSize, bytes.length);
  });
  test(`${format} retains side and pixel safety limits`, async () => {
    for (const [width, height] of [[10001, 1], [1, 10001], [7000, 7000]]) {
      const bytes = Buffer.from(simpleWebp[format], 'base64');
      setSimpleDimensions(bytes, format, width, height);
      await assert.rejects(() => validateMediaUpload(webpFile(bytes)), /exceed safe limits/);
    }
  });
}
test('VP8 reads fourteen-bit dimensions without treating scale bits as size', async () => {
  const bytes = Buffer.from(simpleWebp.VP8, 'base64');
  setSimpleDimensions(bytes, 'VP8', 2 | 0xc000, 3 | 0x8000);
  const result = await validateMediaUpload(webpFile(bytes));
  assert.equal(result.width, 2); assert.equal(result.height, 3);
});
test('VP8L alpha hint does not alter dimensions', async () => {
  const bytes = Buffer.from(simpleWebp.VP8L, 'base64'); bytes[24] |= 0x10;
  const result = await validateMediaUpload(webpFile(bytes));
  assert.equal(result.width, 2); assert.equal(result.height, 3);
});
test('rejects invalid WebP frame headers, sizes, padding and truncated input', async () => {
  const invalid: Uint8Array[] = [];
  for (const format of ['VP8', 'VP8L'] as const) {
    const source = Buffer.from(simpleWebp[format], 'base64');
    for (let size = 1; size < source.length; size++) invalid.push(source.subarray(0, size));
    for (const size of [0, format === 'VP8' ? 9 : 4, source.length, 0xffffffff]) {
      const bytes = Uint8Array.from(source); new DataView(bytes.buffer).setUint32(16, size, true); invalid.push(bytes);
    }
    const badSignature = Uint8Array.from(source); badSignature[format === 'VP8' ? 23 : 20] = 0; invalid.push(badSignature);
    const badRiff = Uint8Array.from(source); new DataView(badRiff.buffer).setUint32(4, 0xffffffff, true); invalid.push(badRiff);
  }
  const interFrame = Buffer.from(simpleWebp.VP8, 'base64'); interFrame[20] |= 1; invalid.push(interFrame);
  const zeroSize = Buffer.from(simpleWebp.VP8, 'base64'); setSimpleDimensions(zeroSize, 'VP8', 0, 3); invalid.push(zeroSize);
  const unsupportedVersion = Buffer.from(simpleWebp.VP8L, 'base64'); unsupportedVersion[24] |= 0x20; invalid.push(unsupportedVersion);
  const badPadding = Buffer.from(simpleWebp.VP8L, 'base64'); badPadding[37] = 1; invalid.push(badPadding);
  const shortExtended = webp(); new DataView(shortExtended.buffer).setUint32(16, 9, true); invalid.push(shortExtended);
  for (const bytes of invalid) await assert.rejects(() => validateMediaUpload(webpFile(bytes)), /signature|dimensions/);
});
