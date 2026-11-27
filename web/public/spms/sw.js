/* KebunRakyat SPMS (edisi Supabase) — Service Worker untuk /spms/
 * - Aplikasi & Mode Lapangan tetap terbuka tanpa internet (berkas aplikasi tersimpan di perangkat).
 * - Data Supabase TIDAK di-cache di sini (antrean offline ada di aplikasi).
 * - Peta jalan OSM yang pernah dilihat disimpan (maks 2500 ubin); citra Esri TIDAK disimpan (ketentuan Esri).
 * Nama cache diawali "spms-" agar tidak bentrok dengan Beranda Platform Inti / UMG di domain yang sama. */
var BUILD = '133-1';
var SHELL = 'spms-shell-' + BUILD, CDN = 'spms-cdn-v1', TILES = 'spms-tiles-v1', MAX_TILES = 2500;
var V = '?v=' + BUILD;
var SHELL_FILES = ['./', './index.html', './lapangan.html', './manifest.json', './icon-192.png', './icon-512.png',
  './config.js' + V, './supabase.js' + V, './engine.js' + V, './supa-api.js' + V];
var CDN_FILES = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/pmtiles@4.5.0/dist/pmtiles.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'];
var CDN_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
var TILE_HOSTS = ['tile.openstreetmap.org', 'tile.opentopomap.org'];

self.addEventListener('install', function (e) {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(function (c) { return Promise.all(SHELL_FILES.map(function (u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); })); }),
    caches.open(CDN).then(function (c) { return Promise.all(CDN_FILES.map(function (u) { return c.match(u).then(function (hit) { if (hit) return; return fetch(u, { mode: 'cors' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }); })); })
  ]).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('spms-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function trimTiles() {
  return caches.open(TILES).then(function (c) { return c.keys().then(function (k) { if (k.length > MAX_TILES) return Promise.all(k.slice(0, k.length - MAX_TILES).map(function (r) { return c.delete(r); })); }); });
}
function timeout(p, ms) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error('timeout')); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (x) { clearTimeout(t); rej(x); }); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  if (req.headers.get('range') || /\.pmtiles(\?|$)/i.test(req.url)) return;   // PMTiles online: langsung jaringan
  var url = new URL(req.url);
  if (/\.supabase\.(co|in)$/.test(url.hostname) || /(^|\.)google\.com$|googleusercontent\.com$/.test(url.hostname) || url.hostname === 'generativelanguage.googleapis.com') return;
  if (url.pathname.indexOf('/rest/v1/') >= 0 || url.pathname.indexOf('/auth/v1/') >= 0 || url.pathname.indexOf('/storage/v1/') >= 0 || url.pathname.indexOf('/functions/v1/') >= 0) return;

  if (TILE_HOSTS.some(function (h) { return url.hostname.indexOf(h) >= 0; })) {   // ubin peta: cache dulu
    e.respondWith(caches.open(TILES).then(function (c) { return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) { if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (Math.random() < 0.05) trimTiles(); } return r; }).catch(function () { return new Response('', { status: 504 }); });
    }); }));
    return;
  }
  if (CDN_HOSTS.indexOf(url.hostname) >= 0) {   // pustaka CDN: tersimpan, diperbarui di belakang
    e.respondWith(caches.open(CDN).then(function (c) { return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(function () { return hit || new Response('', { status: 504 }); });
      return hit || net;
    }); }));
    return;
  }
  if (url.origin !== location.origin) return;
  var inScope = url.pathname.indexOf(new URL('./', self.registration.scope).pathname) === 0;
  if (!inScope) return;
  if (req.mode === 'navigate') {   // halaman: jaringan dulu (maks 5 dtk), lalu salinan tersimpan
    e.respondWith(timeout(fetch(req), 5000).then(function (r) {
      if (r.ok) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(url.pathname.slice(-1) === '/' ? './' : req, cp); }); }
      return r;
    }).catch(function () {
      return caches.open(SHELL).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || c.match(/lapangan/.test(url.pathname) ? './lapangan.html' : './index.html') || c.match('./');
        });
      }).then(function (hit) { return hit || new Response('<h3>Offline</h3><p>Buka SPMS sekali saat online agar tersimpan di perangkat.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); });
    }));
    return;
  }
  // berkas aplikasi: dari perangkat dulu, diperbarui di belakang (berlaku pada pembukaan berikutnya)
  e.respondWith(caches.open(SHELL).then(function (c) { return c.match(req).then(function (hit) {
    var net = fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; }).catch(function () { return hit || c.match(req, { ignoreSearch: true }).then(function (h2) { return h2 || new Response('', { status: 504 }); }); });
    return hit || net;
  }); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
