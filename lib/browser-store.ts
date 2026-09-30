import type { Post, Media, Network } from './planner';
export type Store = {
    posts: Post[];
    media: Media[];
    name: string;
    accounts: Record<Network, boolean>;
};
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open('personal-smm-planner-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('workspace'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('Хранилище занято другой вкладкой.')); }); }
export async function readStore(): Promise<Store | undefined> { const db = await database(); return new Promise((resolve, reject) => { const t = db.transaction('workspace', 'readonly'); const r = t.objectStore('workspace').get('data'); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => { reject(r.error); db.close(); }; }); }
export async function writeStore(data: Store) { const db = await database(); return new Promise<void>((resolve, reject) => { const t = db.transaction('workspace', 'readwrite'); t.objectStore('workspace').put(data, 'data'); t.oncomplete = () => { db.close(); resolve(); }; t.onabort = t.onerror = () => { db.close(); reject(t.error); }; }); }
