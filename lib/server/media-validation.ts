import { createHash } from 'node:crypto';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 10_000;
const MAX_PIXELS = 40_000_000;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
} as const;

type AllowedMime = keyof typeof EXTENSIONS;

export type ValidatedMedia = {
  bytes: Uint8Array;
  mimeType: AllowedMime;
  byteSize: number;
  checksum: string;
  width: number | null;
  height: number | null;
  extension: (typeof EXTENSIONS)[AllowedMime];
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = view.getUint32(4, true);
  const chunkSize = view.getUint32(16, true);
  const chunkEnd = 20 + chunkSize;
  if (riffSize + 8 !== bytes.length || (riffSize & 1) !== 0 || chunkEnd + (chunkSize & 1) > bytes.length) return null;
  if ((chunkSize & 1) !== 0 && bytes[chunkEnd] !== 0) return null;
  const format = ascii(bytes, 12, 4);
  if (format === 'VP8X') {
    if (chunkSize !== 10) return null;
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (format === 'VP8 ') {
    if (chunkSize < 10 || (bytes[20] & 1) !== 0 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (format === 'VP8L') {
    if (chunkSize < 5 || bytes[20] !== 0x2f || (bytes[24] & 0xe0) !== 0) return null;
    const dimensions = view.getUint32(21, true);
    return { width: 1 + (dimensions & 0x3fff), height: 1 + ((dimensions >>> 14) & 0x3fff) };
  }
  return null;
}

function matchesSignature(type: AllowedMime, bytes: Uint8Array): boolean {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  if (type === 'video/mp4') return bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp';
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export async function validateMediaUpload(file: File): Promise<ValidatedMedia> {
  if (file.size === 0) throw new Error('Media file is empty');
  if (file.size > MAX_BYTES) throw new Error('Media file exceeds 20 MiB');
  if (!(file.type in EXTENSIONS)) throw new Error('Unsupported media type');

  const mimeType = file.type as AllowedMime;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(mimeType, bytes)) throw new Error('Media signature does not match MIME type');

  let width: number | null = null;
  let height: number | null = null;
  if (mimeType.startsWith('image/')) {
    const dimensions = mimeType === 'image/png'
      ? pngDimensions(bytes)
      : mimeType === 'image/jpeg'
        ? jpegDimensions(bytes)
        : webpDimensions(bytes);
    if (!dimensions) throw new Error('Unable to read image dimensions');
    ({ width, height } = dimensions);
    if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
      throw new Error('Image dimensions exceed safe limits');
    }
  }

  return {
    bytes,
    mimeType,
    byteSize: file.size,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    width,
    height,
    extension: EXTENSIONS[mimeType],
  };
}
