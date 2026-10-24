import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const modulePath = '../scripts/import-catalog.mjs';
const importer = await import(modulePath).catch(() => null);
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) { assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(root.includes('planly-catalog-test-')); await rm(root, { recursive: true }); } });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'planly-catalog-test-')); roots.push(root);
  const image = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
  const text = Buffer.from('Reviewed synthetic editorial text');
  await writeFile(join(root, 'text.txt'), text); await writeFile(join(root, 'image.png'), image);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const manifest = { period: '2030-01', items: [{ id: 'L01', title: 'Reviewed text', text: { path: 'text.txt', sha256: hash(text) }, media: [{ path: 'image.png', sha256: hash(image) }] }] };
  const manifestPath = join(root, 'catalog.json'), journalPath = join(root, 'private-journal.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { root, manifest, manifestPath, journalPath };
}
test('catalog dry run validates all bytes and performs no network operation', async () => {
  assert.ok(importer?.runCatalogImport);
  const f = await fixture(); let calls = 0;
  const result = await importer.runCatalogImport({ ...f, fetchImpl: async () => { calls++; throw new Error('network forbidden'); } });
  assert.equal(result.items, 1); assert.equal(calls, 0);
  f.manifest.items[0].text.path = '../outside.txt'; await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await assert.rejects(importer.runCatalogImport(f));
  f.manifest.items[0].text.path = 'text.txt'; f.manifest.items[0].id = '__proto__'; await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await assert.rejects(importer.runCatalogImport(f), /INVALID_CATALOG_ITEM/);
});
test('repeated import reuses its journal and never creates Posts or sends', async () => {
  assert.ok(importer?.runCatalogImport);
  const f = await fixture(); const writes = [];
  const transport = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (init.method !== 'POST') return Response.json(path === '/api/profile' ? { id: 'admin' } : { users: [] });
    writes.push({ path, key: init.headers['idempotency-key'] });
    return Response.json(path === '/api/media' ? { id: 'media' } : path === '/api/library-items' ? { id: 'item' } : { shared: true });
  };
  const options = { ...f, apply: true, baseUrl: 'https://planly.test', session: 'synthetic-admin-session', fetchImpl: transport };
  await importer.runCatalogImport(options); await importer.runCatalogImport(options);
  assert.deepEqual(writes.map(write => write.path), ['/api/media', '/api/library-items', '/api/admin/shared-library/item']);
  assert.match(writes[1].key, /^[a-f0-9-]{36}$/);
  assert.equal((await readFile(f.journalPath, 'utf8')).includes('synthetic-admin-session'), false);
});
test('unknown upload outcome is retained and cannot be blindly uploaded again', async () => {
  assert.ok(importer?.runCatalogImport);
  const f = await fixture(); let uploads = 0;
  const options = { ...f, apply: true, baseUrl: 'https://planly.test', session: 'synthetic-admin-session', fetchImpl: async (url, init = {}) => {
    if (init.method !== 'POST') return Response.json(new URL(url).pathname === '/api/profile' ? { id: 'admin' } : {});
    uploads++; throw new Error('synthetic lost upload response');
  } };
  await assert.rejects(importer.runCatalogImport(options));
  await assert.rejects(importer.runCatalogImport(options), /UPLOAD_OUTCOME_UNKNOWN/);
  assert.equal(uploads, 1);
});

// A deployed Next server behind TLS termination has an internal listen URL.
test('catalog mutations satisfy the existing reverse-proxy same-origin guard', async () => {
  const { requireSameOriginMutation } = await import('../lib/server/auth/access.ts');
  const f = await fixture(); const writes = [];
  await importer.runCatalogImport({ ...f, apply: true, baseUrl: 'https://stage.example.test', session: 'synthetic-admin-session', fetchImpl: async (url, init = {}) => {
    const path = new URL(url).pathname;
    assert.equal(new URL(url).origin, 'https://stage.example.test');
    assert.equal(init.redirect, 'error');
    if (init.method !== 'POST') return Response.json(path === '/api/profile' ? { id: 'admin' } : { users: [] });
    try { requireSameOriginMutation(new Request('http://0.0.0.0:3000' + path, { method: init.method, headers: init.headers })); }
    catch { return Response.json({ error: 'Forbidden' }, { status: 403 }); }
    writes.push(path);
    return Response.json(path === '/api/media' ? { id: 'media' } : path === '/api/library-items' ? { id: 'item' } : { shared: true });
  } });
  assert.deepEqual(writes, ['/api/media', '/api/library-items', '/api/admin/shared-library/item']);
});
