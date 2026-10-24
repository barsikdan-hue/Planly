import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, open, unlink, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateMediaUpload } from '../lib/server/media-validation.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function creationKey(value) {
  const bytes = Buffer.from(digest(value).slice(0, 32), 'hex'); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function loadPackage(manifestPath) {
  const raw = await readFile(manifestPath), manifest = JSON.parse(raw);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(manifest.period) || !Array.isArray(manifest.items) || !manifest.items.length || manifest.items.length > 200) throw new Error('INVALID_CATALOG');
  const root = await realpath(dirname(resolve(manifestPath))), ids = new Set(); let totalBytes = 0;
  async function asset(reference) {
    if (!reference || typeof reference.path !== 'string' || isAbsolute(reference.path) || reference.path.replaceAll('\\', '/').split('/').includes('..') || !/^[a-f0-9]{64}$/.test(reference.sha256)) throw new Error('INVALID_ASSET_REFERENCE');
    const file = await realpath(resolve(root, reference.path));
    if (!file.startsWith(root + sep)) throw new Error('ASSET_OUTSIDE_CATALOG');
    const info = await stat(file); if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('CATALOG_ASSET_LIMIT');
    const bytes = await readFile(file); totalBytes += bytes.length;
    if (totalBytes > 100 * 1024 * 1024 || digest(bytes) !== reference.sha256) throw new Error('CATALOG_INTEGRITY_FAILURE');
    return { file, bytes, path: reference.path };
  }
  const items = [];
  for (const item of manifest.items) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || ['__proto__', 'constructor', 'prototype'].includes(item.id) || ids.has(item.id) || typeof item.title !== 'string' || item.title.length > 200 || !Array.isArray(item.media) || item.media.length > 20) throw new Error('INVALID_CATALOG_ITEM');
    ids.add(item.id);
    const text = (await asset(item.text)).bytes.toString('utf8').trim();
    if (!text || text.length > 20000) throw new Error('INVALID_CATALOG_TEXT');
    const media = [];
    for (const reference of item.media) {
      const loaded = await asset(reference);
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4' }[extname(loaded.file).toLowerCase()];
      if (!mime) throw new Error('UNSUPPORTED_CATALOG_MEDIA');
      const file = new File([loaded.bytes], relative(root, loaded.file), { type: mime });
      const checked = await validateMediaUpload(file);
      media.push({ path: loaded.path, file: new File([loaded.bytes], relative(root, loaded.file), { type: checked.mimeType }) });
    }
    items.push({ id: item.id, title: item.title, text, media });
  }
  return { period: manifest.period, hash: digest(raw), items };
}

export async function runCatalogImport({ manifestPath, journalPath, apply = false, baseUrl, session, fetchImpl = fetch }) {
  const catalog = await loadPackage(manifestPath);
  if (!apply) return { dryRun: true, period: catalog.period, items: catalog.items.length, hash: catalog.hash };
  if (!journalPath || !session) throw new Error('EXPLICIT_JOURNAL_AND_ADMIN_SESSION_REQUIRED');
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname))) throw new Error('INVALID_API_ORIGIN');
  const path = resolve(journalPath), lock = await open(`${path}.lock`, 'wx');
  try {
    async function request(route, options = {}) {
      const response = await fetchImpl(new URL(route, base), { redirect: 'error', ...options, headers: { cookie: `planly_session=${session}`, origin: base.origin, ...options.headers } });
      if (!response.ok) throw new Error(`CATALOG_HTTP_${response.status}`);
      return response.json();
    }
    const actor = await request('/api/profile'); if (typeof actor.id !== 'string' || !actor.id) throw new Error('INVALID_ADMIN_IDENTITY');
    await request('/api/admin/users');
    let journal;
    try { journal = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    journal ??= { version: 1, hash: catalog.hash, actorId: actor.id, origin: base.origin, items: {} };
    if (journal.version !== 1 || journal.hash !== catalog.hash || journal.actorId !== actor.id || journal.origin !== base.origin || !journal.items || typeof journal.items !== 'object') throw new Error('CATALOG_JOURNAL_MISMATCH');
    async function persist() {
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(journal, null, 2), { mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
    }
    for (const item of catalog.items) {
      const progress = journal.items[item.id] ??= { media: {} };
      if (progress.complete) continue;
      const mediaIds = [];
      for (const media of item.media) {
        const previous = progress.media[media.path];
        if (previous?.state === 'PENDING') throw new Error('UPLOAD_OUTCOME_UNKNOWN: reconcile the recorded upload before resuming');
        if (previous?.id) { mediaIds.push(previous.id); continue; }
        progress.media[media.path] = { state: 'PENDING' }; await persist();
        const form = new FormData(); form.set('file', media.file);
        const saved = await request('/api/media', { method: 'POST', body: form });
        if (typeof saved.id !== 'string' || !saved.id) throw new Error('UPLOAD_OUTCOME_UNKNOWN');
        progress.media[media.path] = { state: 'SAVED', id: saved.id }; mediaIds.push(saved.id); await persist();
      }
      if (!progress.libraryId) {
        const key = creationKey(`${actor.id}/${catalog.period}/${catalog.hash}/${item.id}`);
        progress.creationKey = key; await persist();
        const saved = await request('/api/library-items', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ title: item.title, text: item.text, mediaIds }) });
        if (typeof saved.id !== 'string' || !saved.id) throw new Error('LIBRARY_RESULT_UNKNOWN');
        progress.libraryId = saved.id; await persist();
      }
      await request(`/api/admin/shared-library/${encodeURIComponent(progress.libraryId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shared: true }) });
      progress.complete = true; await persist();
    }
    return { dryRun: false, period: catalog.period, items: catalog.items.length, complete: Object.values(journal.items).filter(item => item.complete).length };
  } finally { await lock.close(); await unlink(`${path}.lock`); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  try {
    if (!args.includes('--manifest')) throw new Error('Use --manifest PATH; live import additionally needs --apply --base URL --journal PRIVATE_PATH and PLANLY_ADMIN_SESSION');
    const result = await runCatalogImport({ manifestPath: value('--manifest'), apply: args.includes('--apply'), baseUrl: args.includes('--base') ? value('--base') : undefined, journalPath: args.includes('--journal') ? value('--journal') : undefined, session: process.env.PLANLY_ADMIN_SESSION });
    console.info(JSON.stringify(result));
  } catch (error) { console.error(error instanceof Error ? error.message : 'CATALOG_IMPORT_FAILED'); process.exitCode = 1; }
}
