import './styles.css';
import { APP, ROLES } from './config.js';
import { sb, configured, friendlyError, secretKeyUsed, urlValid } from './lib/supabase.js';
import { state, loadContext, selectOrg, orgSetting, applyBranding, can } from './lib/store.js';
import { route, startRouter, render as rerender, go } from './lib/router.js';
import { outboxEvents, pendingCount, flush } from './lib/offline.js';
import { esc, toast, imageDialog, formDialog } from './lib/ui.js';

import loginView from './views/login.js';
import onboardingView from './views/onboarding.js';
import homeView from './views/home.js';
import mapView from './views/map.js';
import membersView from './views/members.js';
import settingsView from './views/settings.js';
import profileView from './views/profile.js';

const app = document.getElementById('app');
let cleanup = null;

// ---------------------------------------------------------------- routes
const NAV = [
  { path: '/', label: 'Beranda', icon: '🏠' },
  { path: '/peta', label: 'Peta', icon: '🗺️' },
  { path: '/anggota', label: 'Anggota', icon: '👥', admin: true },
  { path: '/pengaturan', label: 'Pengaturan', icon: '⚙️', admin: true },
  { path: '/profil', label: 'Profil', icon: '👤' },
];
route('/', homeView);
route('/peta', mapView);
route('/anggota', membersView);
route('/pengaturan', settingsView);
route('/profil', profileView);

// ---------------------------------------------------------------- shell
function shellHtml(path) {
  const title = orgSetting('app_title', APP.defaultTitle) || APP.defaultTitle;
  const logo = orgSetting('logo_url');
  const nav = NAV.filter((n) => !n.admin || can.admin())
    .map((n) => `<a href="#${n.path}" class="${n.path === path ? 'active' : ''}">
        <span class="ico">${n.icon}</span><span>${n.label}</span></a>`).join('');
  const orgSwitch = state.orgs.length > 1
    ? `<select id="orgSwitch" title="Ganti organisasi">${state.orgs.map((o) =>
        `<option value="${o.id}" ${o.id === state.org.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`
    : `<span class="org-name">${esc(state.org.name)}</span>`;
  return `
    <header class="topbar">
      <button class="logo" id="logoBtn" title="Perbesar logo">
        ${logo ? `<img src="${esc(logo)}" alt="logo">` : '<span class="logo-ph">🌱</span>'}
      </button>
      <div class="title">
        <strong>${esc(title)}</strong>
        <div class="sub">${orgSwitch} · <span class="role">${ROLES[state.role] || ''}</span></div>
      </div>
      <span id="netStatus" class="chip"></span>
      <button class="btn icon" id="darkBtn" title="Mode gelap/terang">🌓</button>
    </header>
    <nav class="nav">${nav}</nav>
    <main id="view" class="view"></main>
    <footer class="foot">
      v${APP.version} · <a href="./legal/terms.html" target="_blank">Syarat &amp; Ketentuan</a>
      · <a href="./legal/privacy.html" target="_blank">Privasi</a>
    </footer>`;
}

async function updateNetStatus() {
  const el = document.getElementById('netStatus');
  if (!el) return;
  const n = await pendingCount();
  const online = navigator.onLine;
  el.className = `chip ${online ? 'ok' : 'warn'}`;
  el.textContent = online ? (n ? `⏫ ${n} antre` : '● Online') : `○ Offline${n ? ` · ${n} antre` : ''}`;
  el.title = n ? 'Data menunggu dikirim ke server. Ketuk untuk kirim sekarang.' : '';
  el.onclick = () => flush();
}

async function renderPage(path, viewFn) {
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* abaikan */ } }
  cleanup = null;

  if (!configured) {
    const reason = secretKeyUsed
      ? '<b>Kunci yang dipakai adalah SECRET / service_role key.</b> Kunci ini menembus semua aturan keamanan dan tidak boleh dipakai di aplikasi. Ganti dengan <b>publishable</b> (sb_publishable_…) atau <b>anon</b> key, lalu segera buat ulang (rotate) secret key di Supabase.'
      : APP.supabaseUrl && !urlValid
        ? `Alamat Supabase tidak valid: <code>${esc(APP.supabaseUrl)}</code>. Formatnya harus <code>https://xxxx.supabase.co</code>.`
        : 'Alamat dan/atau kunci Supabase belum diisi.';
    app.innerHTML = `<div class="center"><div class="card narrow"><h2>Belum terhubung ke Supabase</h2>
      <p>${reason}</p>
      <h3>Bila memakai GitHub Pages</h3>
      <p>Repo → Settings → Secrets and variables → Actions → tab <b>Secrets</b>: isi
      <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_KEY</code>, lalu Actions → <b>Run workflow</b>.</p>
      <h3>Bila memakai komputer sendiri</h3>
      <p>Isi kedua nilai itu di <code>web/.env.local</code>, lalu jalankan ulang <code>npm run dev</code>.</p></div></div>`;
    return;
  }
  if (!state.session) { app.innerHTML = ''; cleanup = await loginView(app); return; }
  if (!state.org) { app.innerHTML = ''; cleanup = await onboardingView(app, boot); return; }

  // Halaman admin hanya untuk admin
  if (NAV.find((n) => n.path === path)?.admin && !can.admin()) { go('/'); return; }

  app.innerHTML = shellHtml(path);
  document.getElementById('orgSwitch')?.addEventListener('change', (e) => { selectOrg(e.target.value); rerender(); });
  document.getElementById('logoBtn').onclick = () => {
    const logo = orgSetting('logo_url');
    if (logo) imageDialog(logo, 'Logo');
  };
  document.getElementById('darkBtn').onclick = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    localStorage.setItem('darkMode', dark ? '0' : '1');
    applyBranding();
  };
  updateNetStatus();
  if (state.offlineMode) toast('Mode offline: menampilkan data terakhir yang tersimpan', 'warn');
  try {
    cleanup = await viewFn(document.getElementById('view'), { refreshShell: boot });
  } catch (err) {
    console.error(err);
    document.getElementById('view').innerHTML =
      `<div class="card"><h3>Gagal memuat halaman</h3><p>${esc(friendlyError(err))}</p></div>`;
  }
}

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    if (configured) await loadContext();
  } catch (err) {
    console.error(err);
    toast(friendlyError(err), 'error');
  }
  rerender();
}

outboxEvents.addEventListener('change', updateNetStatus);
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);

if (configured) {
  sb.auth.onAuthStateChange(async (event) => {
    if (event === 'PASSWORD_RECOVERY') {
      const v = await formDialog({
        title: 'Buat password baru',
        fields: [{ name: 'password', label: 'Password baru (min. 8 karakter)', type: 'password', required: true }],
      });
      if (v?.password) {
        const { error } = await sb.auth.updateUser({ password: v.password });
        toast(error ? friendlyError(error) : 'Password berhasil diganti', error ? 'error' : 'ok');
      }
    }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      // tunda sedikit agar tidak bentrok dengan proses internal supabase-js
      setTimeout(boot, 0);
    }
  });
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW gagal', e));
  // Pada kunjungan pertama, file JS/CSS sudah terunduh sebelum SW aktif.
  // Kirim daftarnya ke SW agar ikut disimpan untuk mode offline.
  navigator.serviceWorker.ready.then((reg) => {
    const urls = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && !u.includes('/sw.js'));
    reg.active?.postMessage({ type: 'CACHE_URLS', urls: [...new Set(urls)] });
  });
}

applyBranding();
await boot();
startRouter(renderPage);
