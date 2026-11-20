// Penyimpanan lokal (IndexedDB) + antrean kirim (outbox) untuk kerja offline.
//
// Pola "outbox-first": setiap perubahan data disimpan dulu ke antrean,
// lalu dikirim ke server saat online. Karena id dibuat di HP
// (crypto.randomUUID) dan RPC di server bersifat upsert, pengiriman ulang
// tidak pernah menghasilkan data ganda.

import { isNetworkError } from './supabase.js';

const DB_NAME = 'platform-inti';
const DB_VERSION = 1;
let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => { result = r; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

// ---------------- key-value cache ----------------
export const kv = {
  get: (key) => run('kv', 'readonly', (os) => reqP(os.get(key))),
  set: (key, value) => run('kv', 'readwrite', (os) => reqP(os.put(value, key))),
  del: (key) => run('kv', 'readwrite', (os) => reqP(os.delete(key))),
};

// ---------------- outbox ----------------
export const outboxEvents = new EventTarget();
const handlers = new Map();
let flushing = false;

export function registerHandler(type, fn) {
  handlers.set(type, fn);
}

export async function enqueue(type, payload) {
  await run('outbox', 'readwrite', (os) =>
    reqP(os.add({ type, payload, createdAt: Date.now(), attempts: 0, lastError: null })));
  await notify();
  flush(); // coba kirim langsung bila online
}

export async function listOutbox() {
  return run('outbox', 'readonly', (os) => reqP(os.getAll()));
}

export async function pendingCount() {
  return run('outbox', 'readonly', (os) => reqP(os.count()));
}

async function notify() {
  const count = await pendingCount();
  outboxEvents.dispatchEvent(new CustomEvent('change', { detail: { count } }));
}

const MAX_ATTEMPTS = 5;

// Kirim antrean berurutan. Berhenti bila internet putus; item yang
// ditolak server dicoba ulang maksimal MAX_ATTEMPTS lalu dipindah ke
// daftar "gagal" agar tidak menyumbat antrean.
export async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  try {
    const items = await listOutbox();
    for (const item of items) {
      const handler = handlers.get(item.type);
      if (!handler) continue;
      try {
        await handler(item.payload);
        await run('outbox', 'readwrite', (os) => reqP(os.delete(item.seq)));
        sent++;
      } catch (err) {
        if (isNetworkError(err)) break;
        item.attempts += 1;
        item.lastError = String(err?.message || err);
        if (item.attempts >= MAX_ATTEMPTS) {
          const failed = (await kv.get('outbox-failed')) || [];
          failed.push(item);
          await kv.set('outbox-failed', failed.slice(-200));
          await run('outbox', 'readwrite', (os) => reqP(os.delete(item.seq)));
        } else {
          await run('outbox', 'readwrite', (os) => reqP(os.put(item)));
        }
      }
    }
  } finally {
    flushing = false;
    await notify();
    if (sent) outboxEvents.dispatchEvent(new CustomEvent('flushed', { detail: { sent } }));
  }
}

window.addEventListener('online', () => flush());
// cadangan: coba kirim tiap 60 detik
setInterval(() => flush(), 60_000);
