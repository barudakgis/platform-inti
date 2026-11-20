// Router berbasis hash (#/peta, #/anggota, ...).
// Hash routing bekerja di Cloudflare Pages maupun GitHub Pages tanpa
// pengaturan server, dan tombol Back HP berpindah antarhalaman.
//
// Tombol Back di halaman Beranda TIDAK langsung menutup aplikasi:
// muncul pesan "Tekan Back sekali lagi untuk keluar".

import { toast } from './ui.js';

const routes = new Map();
let onRender = null;
let lastBackAt = 0;

export function route(path, render) {
  routes.set(path, render);
}

export function go(path) {
  if (location.hash !== `#${path}`) location.hash = path;
  else render();
}

export function current() {
  return location.hash.replace(/^#/, '') || '/';
}

export function startRouter(renderFn) {
  onRender = renderFn;
  // Pasang "penjaga" di riwayat agar Back pertama di Beranda bisa ditahan
  if (!sessionStorage.getItem('historyGuard')) {
    sessionStorage.setItem('historyGuard', '1');
    const base = location.href.split('#')[0];
    const start = location.hash || '#/';
    history.replaceState({ guard: true }, '', `${base}#/`);
    history.pushState({ app: true }, '', `${base}${start}`);
  }
  window.addEventListener('popstate', (e) => {
    if (e.state?.guard) {
      const now = Date.now();
      if (now - lastBackAt < 2000) {
        history.back(); // keluar sungguhan
        return;
      }
      lastBackAt = now;
      toast('Tekan Back sekali lagi untuk keluar');
      history.pushState({ app: true }, '', location.href.split('#')[0] + '#/');
    }
  });
  window.addEventListener('hashchange', render);
  render();
}

export function render() {
  const path = current();
  const fn = routes.get(path) || routes.get('/');
  onRender?.(path, fn);
}
