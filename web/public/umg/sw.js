/* Service worker UMG (Platform Inti) — folder /umg/ saja.
 * - Halaman & file aplikasi: ambil dari internet dulu (selalu versi terbaru), simpan cadangan → bisa dibuka tanpa sinyal.
 * - Pustaka peta (unpkg): disimpan sekali, dipakai seterusnya (alamatnya sudah berversi).
 * - Ubin peta dasar yang pernah dilihat: disimpan (maks. ±3000 ubin) agar peta tetap tampil di lapangan.
 * - Supabase (data, login, foto): TIDAK disimpan di sini — data offline diurus antrean Sinkronisasi UMG.
 */
'use strict';
const VERSION = 'umg-3-1';
const CORE = 'umg-core-' + VERSION;
const LIB = 'umg-lib-v1';
const TILES = 'umg-tiles-v1';
const TILE_MAX = 3000;
const NET_TIMEOUT = 5000;

const CORE_FILES = ['./', './index.html', './config.js', './supabase.js', './supa-api.js', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const LIBS = [
  'https://unpkg.com/@tmcw/togeojson@7.1.3/dist/togeojson.umd.js',
  'https://unpkg.com/@turf/turf@7.4.0/turf.min.js',
  'https://unpkg.com/fflate@0.8.2/umd/index.js',
  'https://unpkg.com/geotiff@2.1.3/dist-browser/geotiff.js',
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js',
  'https://unpkg.com/proj4@2.15.0/dist/proj4.js',
  'https://unpkg.com/shpjs@6.2.0/dist/shp.min.js'
];
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|api\.maptiler\.com|server\.arcgisonline\.com|basemaps\.cartocdn\.com)$/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await Promise.all(CORE_FILES.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    // file aplikasi berversi (config.js?v=…) persis seperti yang diminta index.html
    try {
      const html = await (await fetch('./', { cache: 'reload' })).text();
      const own = [...html.matchAll(/src="([^":]+\?v=[^"]+)"/g)].map((m) => m[1]);
      await Promise.all(own.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    } catch (_) { /* offline saat pasang: cukup file dasar */ }
    const l = await caches.open(LIB);
    await Promise.all(LIBS.map(async (u) => { if (!(await l.match(u))) await l.add(new Request(u, { mode: 'cors' })).catch(() => null); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('umg-core-') && k !== CORE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function timeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

async function networkFirst(req, fallbackUrl) {
  const c = await caches.open(CORE);
  try {
    const res = await timeout(fetch(req), NET_TIMEOUT);
    if (res && res.ok && res.type === 'basic') c.put(fallbackUrl || req, res.clone());
    return res;
  } catch (err) {
    const hit = (await c.match(fallbackUrl || req)) || (await c.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}

let tilePuts = 0;
async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
}
async function tile(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => {
    if (res && res.ok) { c.put(req, res.clone()); if (++tilePuts % 100 === 0) trimTiles(); }
    return res;
  }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/\.supabase\.co$/.test(url.hostname)) return;                  // data & login: selalu langsung
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req, './index.html')); return; }
    e.respondWith(networkFirst(req)); return;
  }
  if (url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net') { e.respondWith(cacheFirst(req, LIB)); return; }
  if (TILE_HOSTS.test(url.hostname)) { e.respondWith(tile(req)); return; }
});

self.addEventListener('message', (e) => {
  if (e.data === 'umg-clear-tiles') e.waitUntil(caches.delete(TILES));
});
