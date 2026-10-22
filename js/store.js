// Persistance locale (IndexedDB, repli localStorage) + export / import JSON.

const DB = 'oral-en', STORE = 'kv', LS = 'oral-en:';
let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

export async function get(key, fallback) {
  try {
    const db = await openDB();
    const v = await new Promise((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return v === undefined ? fallback : v;
  } catch {
    const raw = localStorage.getItem(LS + key);
    return raw == null ? fallback : JSON.parse(raw);
  }
}

export async function set(key, value) {
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch {
    localStorage.setItem(LS + key, JSON.stringify(value));
  }
}

export async function requestPersistence() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

export async function isPersisted() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : false; } catch { return false; }
}

const KEYS = ['progress', 'settings', 'days'];

export async function exportAll() {
  const data = { app: 'oral-en', version: 1, exportedAt: new Date().toISOString() };
  for (const k of KEYS) data[k] = await get(k, {});
  return data;
}

export async function importAll(data) {
  if (!data || data.app !== 'oral-en' || typeof data.progress !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde de cette app.");
  }
  for (const k of KEYS) if (data[k]) await set(k, data[k]);
  await set('lastBackup', data.exportedAt || new Date().toISOString());
}
