import { sb, must, friendlyError } from '../lib/supabase.js';
import { state, applyBranding } from '../lib/store.js';
import { esc, toast, fmtDate } from '../lib/ui.js';
import { APP } from '../config.js';

// Pengaturan organisasi (admin): nama, judul aplikasi, logo, warna tema,
// status lisensi, dan riwayat perubahan (audit log).
export default async function settingsView(el, { refreshShell }) {
  const s = state.org.settings || {};
  el.innerHTML = `
    <h2>Pengaturan</h2>
    <div class="grid two">
      <form class="card form" id="orgForm">
        <h3>Identitas</h3>
        <label>Nama organisasi</label><input name="name" value="${esc(state.org.name)}" required>
        <label>Judul aplikasi (tampil di atas)</label><input name="app_title" value="${esc(s.app_title || '')}">
        <label>Warna tema</label><input name="theme_color" type="color" value="${esc(s.theme_color || APP.defaultTheme)}">
        <label>Logo (PNG/JPG/WebP, maks 2 MB)</label>
        <div class="row">
          ${s.logo_url ? `<img class="logo-preview" src="${esc(s.logo_url)}" alt="logo">` : ''}
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp">
        </div>
        <button class="btn primary" type="submit">Simpan</button>
      </form>
      <div class="card">
        <h3>Lisensi</h3>
        <table class="table" id="licTbl"><tbody><tr><td>Memuat…</td></tr></tbody></table>
        <p class="muted small">Perpanjangan / upgrade paket hubungi penyedia aplikasi.</p>
      </div>
    </div>
    <div class="card">
      <h3>Riwayat perubahan (50 terakhir)</h3>
      <div class="scroll-x"><table class="table" id="auditTbl"><tbody><tr><td>Memuat…</td></tr></tbody></table></div>
    </div>`;

  const form = el.querySelector('#orgForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const settings = {
        ...s,
        app_title: form.elements.app_title.value.trim(),
        theme_color: form.elements.theme_color.value,
      };
      const file = form.elements.logo.files[0];
      if (file) {
        if (file.size > APP.maxLogoBytes) throw new Error('Logo maksimal 2 MB');
        const ext = file.name.split('.').pop().toLowerCase();
        const path = `${state.org.id}/logo-${Date.now()}.${ext}`;
        must(await sb.storage.from('branding').upload(path, file, { upsert: true, contentType: file.type }));
        settings.logo_url = sb.storage.from('branding').getPublicUrl(path).data.publicUrl;
      }
      const updated = must(await sb.from('organizations')
        .update({ name: form.elements.name.value.trim(), settings })
        .eq('id', state.org.id).select().single());
      Object.assign(state.org, updated);
      applyBranding();
      toast('Pengaturan disimpan', 'ok');
      refreshShell();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  };

  const lic = must(await sb.from('licenses').select('*, apps(name)').eq('org_id', state.org.id).order('app_code'));
  el.querySelector('#licTbl').innerHTML = `
    <thead><tr><th>Aplikasi</th><th>Paket</th><th>Berlaku s.d.</th><th>Status</th></tr></thead>
    <tbody>${lic.map((l) => {
      const ok = l.active && (!l.valid_until || new Date(l.valid_until) >= new Date(new Date().toDateString()));
      return `<tr><td>${esc(l.apps?.name || l.app_code)}</td><td>${esc(l.plan)}</td>
        <td>${l.valid_until ? fmtDate(l.valid_until) : 'Selamanya'}</td>
        <td><span class="badge ${ok ? 'ok' : 'danger'}">${ok ? 'Aktif' : 'Berakhir'}</span></td></tr>`;
    }).join('') || '<tr><td>Belum ada lisensi</td></tr>'}</tbody>`;

  const audit = must(await sb.from('audit_log').select('*').eq('org_id', state.org.id)
    .order('created_at', { ascending: false }).limit(50));
  el.querySelector('#auditTbl').innerHTML = `
    <thead><tr><th>Waktu</th><th>Tabel</th><th>Aksi</th><th>Data</th></tr></thead>
    <tbody>${audit.map((a) => `<tr>
      <td>${new Date(a.created_at).toLocaleString('id-ID')}</td>
      <td>${esc(a.table_name)}</td><td>${esc(a.action)}</td>
      <td class="small">${esc(JSON.stringify(a.new_data?.properties || a.new_data?.name || a.new_data?.role || '').slice(0, 80))}</td>
    </tr>`).join('') || '<tr><td>Belum ada</td></tr>'}</tbody>`;
}
