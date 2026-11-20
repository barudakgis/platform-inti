import { sb, must } from '../lib/supabase.js';
import { state } from '../lib/store.js';
import { kv } from '../lib/offline.js';
import { esc, fmtDate } from '../lib/ui.js';

// Beranda: daftar aplikasi + status lisensi organisasi aktif
export default async function homeView(el) {
  el.innerHTML = `<h2>Halo, ${esc(state.profile?.full_name || '')} 👋</h2>
    <p class="muted">${esc(state.org.name)}</p>
    <div id="apps" class="grid"><div class="card">Memuat aplikasi…</div></div>`;

  const cacheKey = `home:${state.org.id}`;
  let apps, licenses;
  try {
    [apps, licenses] = await Promise.all([
      sb.from('apps').select('*').neq('status', 'arsip').order('sort').then(must),
      sb.from('licenses').select('*').eq('org_id', state.org.id).then(must),
    ]);
    await kv.set(cacheKey, { apps, licenses });
  } catch (err) {
    const cached = await kv.get(cacheKey);
    if (!cached) throw err;
    ({ apps, licenses } = cached);
  }

  const lic = Object.fromEntries(licenses.map((l) => [l.app_code, l]));
  const today = new Date(new Date().toDateString());

  el.querySelector('#apps').innerHTML = apps.map((a) => {
    const l = lic[a.code];
    let badge = '<span class="badge muted">Belum berlangganan</span>';
    let usable = false;
    if (l) {
      const until = l.valid_until ? new Date(l.valid_until) : null;
      const days = until ? Math.round((until - today) / 86400000) : null;
      usable = l.active && (days === null || days >= 0);
      badge = !usable
        ? '<span class="badge danger">Lisensi berakhir</span>'
        : `<span class="badge ok">${esc(l.plan)}${days !== null ? ` · ${days} hari lagi` : ''}</span>`;
    }
    const link = a.code === 'gis' ? '#/peta' : a.url;
    const open = usable && link && a.status === 'aktif'
      ? `<a class="btn primary small" href="${esc(link)}">Buka</a>`
      : a.status === 'dev' ? '<span class="badge muted">Segera hadir</span>' : '';
    return `<div class="card app-card">
        <div class="app-ico">${esc(a.icon || '📦')}</div>
        <div class="grow">
          <strong>${esc(a.name)}</strong>
          <p class="muted small">${esc(a.description || '')}</p>
          ${badge} ${l?.valid_until ? `<span class="muted small">s.d. ${fmtDate(l.valid_until)}</span>` : ''}
        </div>
        <div>${open}</div>
      </div>`;
  }).join('') || '<div class="card">Belum ada aplikasi di katalog.</div>';
}
