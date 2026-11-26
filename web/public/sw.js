// Service Worker — membuat aplikasi tetap terbuka tanpa internet.
// NAIKKAN VERSION setiap rilis agar cache lama dibersihkan.
const VERSION = 'v1.0.4';
const SHELL = `shell-${VERSION}`;
const TILES = 'tiles-v1';
const MAX_TILES = 1500; // ubin peta yang pernah dilihat (jangan unduh massal: dilarang kebijakan OSM)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      // hanya cache milik Beranda (shell-…) — cache SPMS (spms-…) & UMG (umg-…) di domain yang sama jangan disentuh
      if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Terima daftar file dari halaman (lihat main.js) untuk disimpan
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    event.waitUntil(caches.open(SHELL).then((c) => Promise.all(
      event.data.urls.map((u) => c.add(u).catch(() => null)),
    )));
  }
});

const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com'];

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Aplikasi UMG (/umg/) & SPMS (/spms/) punya penyimpanan offline sendiri — jangan disentuh
  if (url.origin === self.location.origin && (url.pathname.includes('/umg/') || url.pathname.includes('/spms/') || url.pathname.includes('/palmos/'))) return;

  // Logo & foto profil publik dari Supabase Storage: simpan agar tampil saat offline
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) || new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Data Supabase TIDAK di-cache di sini (ditangani IndexedDB di aplikasi)
  if (url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return;

  // Ubin peta: ambil dari cache dulu
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone());
          if (Math.random() < 0.05) trimTiles();
        }
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Halaman: coba jaringan dulu, kalau offline pakai index.html tersimpan
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Aset aplikasi (JS/CSS/ikon) dari domain sendiri: cache dulu, lalu perbarui di belakang
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});
