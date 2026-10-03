import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicationContent } from '../lib/publication-content.ts';

const photo = { mimeType: 'image/png', byteSize: 20, width: 1000, height: 1000 };
const video = { mimeType: 'video/mp4', byteSize: 20 };

test('text and caption limits accept the exact boundary and reject the next UTF-16 unit', () => {
  for (const [provider, limit, media] of [
    ['TELEGRAM', 4096, []], ['TELEGRAM', 1024, [photo]], ['MAX', 4000, []], ['MAX', 4000, [photo]],
  ] as const) {
    assert.equal(validatePublicationContent(provider, 'x'.repeat(limit), media), null);
    assert.ok(validatePublicationContent(provider, 'x'.repeat(limit + 1), media));
    assert.equal(validatePublicationContent(provider, '😜'.repeat(limit / 2), media), null);
    assert.ok(validatePublicationContent(provider, '😜'.repeat(limit / 2) + 'x', media));
  }
});

test('captionless mixed media stays valid, blank text-only and excessive counts fail', () => {
  for (const [provider, max] of [['TELEGRAM', 10], ['MAX', 12]] as const) {
    assert.ok(validatePublicationContent(provider, ' \n ', []));
    assert.equal(validatePublicationContent(provider, '', [photo]), null);
    assert.equal(validatePublicationContent(provider, '', Array.from({ length: max }, (_, i) => i % 2 ? video : photo)), null);
    assert.ok(validatePublicationContent(provider, '', Array.from({ length: max + 1 }, () => photo)));
  }
});

test('publication excludes unsupported library formats and empty or oversized files', () => {
  for (const provider of ['TELEGRAM', 'MAX'] as const) {
    for (const mimeType of ['image/webp', 'video/webm']) assert.ok(validatePublicationContent(provider, '', [{ ...photo, mimeType }]));
    for (const asset of [photo, video]) {
      const limit = (provider === 'TELEGRAM' && asset.mimeType !== 'video/mp4' ? 10 : 20) * 1024 * 1024;
      assert.equal(validatePublicationContent(provider, '', [{ ...asset, byteSize: limit }]), null);
      assert.ok(validatePublicationContent(provider, '', [{ ...asset, byteSize: limit + 1 }]));
      assert.ok(validatePublicationContent(provider, '', [{ ...asset, byteSize: 0 }]));
    }
  }
});

test('provider image dimension and aspect limits remain distinct', () => {
  assert.equal(validatePublicationContent('TELEGRAM', '', [{ ...photo, width: 5000, height: 5000 }]), null);
  assert.ok(validatePublicationContent('TELEGRAM', '', [{ ...photo, width: 5001, height: 5000 }]));
  assert.equal(validatePublicationContent('TELEGRAM', '', [{ ...photo, width: 2000, height: 100 }]), null);
  assert.ok(validatePublicationContent('TELEGRAM', '', [{ ...photo, width: 2001, height: 100 }]));
  assert.equal(validatePublicationContent('MAX', '', [{ ...photo, width: 7680, height: 100 }]), null);
  assert.ok(validatePublicationContent('MAX', '', [{ ...photo, width: 7681, height: 100 }]));
  assert.ok(validatePublicationContent('MAX', '', [{ ...photo, width: 100, height: 7681 }]));
  assert.equal(validatePublicationContent('MAX', '', [{ ...photo, width: 2001, height: 100 }]), null);
});
