/* PALM OS edisi Supabase — service worker (Tahap 3): buka aplikasi tanpa sinyal.
 * - Berkas aplikasi (index, mesin, penghubung, pustaka) disimpan di perangkat.
 * - Data (Supabase) TIDAK disimpan di sini: aplikasi punya penyimpanan offline & antrean sendiri.
 * - Pustaka peta (unpkg) disimpan saat pertama dipakai. */
const VERSION = 'palmos-4-4';
const CORE = ['./', 'index.html', 'engine.html', 'engine.js', 'engine-shim.js', 'supa-api.js', 'supabase.js', 'config.js', 'icon-512.png', 'icon-192.png', 'manifest.webmanifest', 'verify.html'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('palmos-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/supabase\.co$|\/rest\/v1\/|\/auth\/v1\/|\/storage\/v1\/|\/functions\/v1\//.test(url.host + url.pathname)) return; // data: selalu langsung ke server
  const scope = new URL(self.registration.scope);
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    if (req.mode === 'navigate' || /\/(index\.html|config\.js)?$/.test(url.pathname) || /config\.js$/.test(url.pathname)) {
      // halaman & config: utamakan jaringan (versi terbaru), cadangan dari perangkat
      e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(url.pathname.endsWith('/') ? req : stripQ(req), cp)); } return r; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match('index.html'))));
      return;
    }
    // berkas bernomor versi (?v=...) harus sama persis: jangan pernah mencampur versi lama & baru
    const ver = url.searchParams.has('v');
    e.respondWith(caches.match(req, { ignoreSearch: !ver }).then((m) => m || fetch(req, ver ? { cache: 'reload' } : undefined).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(ver ? req : stripQ(req), cp)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }))));
    return;
  }
  if (url.host === 'unpkg.com') {
    e.respondWith(caches.open('palmos-lib').then((c) => c.match(req).then((m) => m || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }))));
  }
});
function stripQ(req) { const u = new URL(req.url); u.search = ''; return new Request(u.toString()); }
