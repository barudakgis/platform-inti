import { sb, must, friendlyError } from '../lib/supabase.js';
import { state, can } from '../lib/store.js';
import { esc, toast, formDialog, confirmDialog, fmtDate } from '../lib/ui.js';
import { ROLES } from '../config.js';

// Kelola anggota organisasi (khusus admin & owner)
export default async function membersView(el) {
  el.innerHTML = `
    <div class="row between"><h2>Anggota</h2>
      <button class="btn primary" id="addBtn">＋ Tambah anggota</button></div>
    <p class="muted small">Orang yang ditambahkan harus sudah mendaftar akun terlebih dahulu.
      <b>Owner &amp; Admin</b> otomatis boleh memakai semua aplikasi berlisensi; <b>Editor &amp; Viewer</b> hanya aplikasi yang dicentang.
      Pengguna yang ditambahkan dari dalam sebuah aplikasi (mis. menu Pengguna di UMG) hanya mendapat aplikasi itu.</p>
    <div class="card"><table class="table" id="tbl"><tbody><tr><td>Memuat…</td></tr></tbody></table></div>`;

  const roleOptions = Object.entries(ROLES)
    .filter(([k]) => k !== 'owner' || can.owner())
    .map(([value, label]) => ({ value, label }));

  // aplikasi yang bisa diberikan = berlisensi aktif di organisasi ini
  const myApps = must(await sb.rpc('my_apps', { p_org: state.org.id }));
  const appOpts = myApps.filter((a) => a.org_licensed).map((a) => ({ value: a.code, label: `${a.icon || ''} ${a.name}`.trim() }));
  const appName = Object.fromEntries(myApps.map((a) => [a.code, a.name]));

  async function load() {
    const access = must(await sb.rpc('app_access_list', { p_org: state.org.id }));
    const rows = must(await sb.from('memberships')
      .select('role, user_id, created_at, profiles(full_name, email, phone, avatar_url)')
      .eq('org_id', state.org.id)
      .order('created_at'));
    el.querySelector('#tbl').innerHTML = `
      <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Aplikasi</th><th>Sejak</th><th></th></tr></thead>
      <tbody>${rows.map((r) => {
        const self = r.user_id === state.session.user.id;
        const locked = (r.role === 'owner' && !can.owner()) || self;
        return `<tr>
          <td>${r.profiles?.avatar_url ? `<img class="avatar sm" src="${esc(r.profiles.avatar_url)}" alt="">` : ''}
              ${esc(r.profiles?.full_name || '—')}${self ? ' <span class="badge muted">Anda</span>' : ''}</td>
          <td>${esc(r.profiles?.email || '')}</td>
          <td>${locked ? esc(ROLES[r.role]) : `<select data-role="${r.user_id}">${roleOptions.map((o) =>
            `<option value="${o.value}" ${o.value === r.role ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`}</td>
          <td>${['owner', 'admin'].includes(r.role) ? '<span class="badge ok">Semua aplikasi</span>'
            : `${(access[r.user_id] || []).map((c) => `<span class="badge">${esc(appName[c] || c)}</span>`).join(' ') || '<span class="badge muted">Belum ada</span>'}
               <button class="btn small ghost" data-apps="${r.user_id}">Atur</button>`}</td>
          <td>${fmtDate(r.created_at)}</td>
          <td>${locked ? '' : `<button class="btn small danger" data-del="${r.user_id}">Keluarkan</button>`}</td>
        </tr>`;
      }).join('')}</tbody>`;

    el.querySelectorAll('[data-role]').forEach((s) => (s.onchange = async () => {
      const { error } = await sb.from('memberships').update({ role: s.value })
        .eq('org_id', state.org.id).eq('user_id', s.dataset.role);
      toast(error ? friendlyError(error) : 'Role diperbarui', error ? 'error' : 'ok');
      if (error) load();
    }));
    el.querySelectorAll('[data-apps]').forEach((b) => (b.onclick = async () => {
      const uid = b.dataset.apps, who = rows.find((x) => x.user_id === uid);
      const v = await formDialog({
        title: `Akses aplikasi — ${who?.profiles?.full_name || who?.profiles?.email || ''}`,
        fields: [{ name: 'apps', label: 'Boleh memakai', type: 'checks', options: appOpts, value: access[uid] || [],
                   hint: 'Hanya aplikasi yang dicentang yang bisa dibuka & lisensinya terlihat oleh anggota ini.' }],
        submitText: 'Simpan akses',
      });
      if (!v) return;
      const { error } = await sb.rpc('app_access_set', { p_org: state.org.id, p_user: uid, p_apps: v.apps || [] });
      toast(error ? friendlyError(error) : 'Akses aplikasi diperbarui', error ? 'error' : 'ok');
      load();
    }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmDialog('Keluarkan anggota ini dari organisasi?', 'Keluarkan'))) return;
      const { error } = await sb.from('memberships').delete()
        .eq('org_id', state.org.id).eq('user_id', b.dataset.del);
      toast(error ? friendlyError(error) : 'Anggota dikeluarkan', error ? 'error' : 'ok');
      load();
    }));
  }

  el.querySelector('#addBtn').onclick = async () => {
    const v = await formDialog({
      title: 'Tambah anggota',
      fields: [
        { name: 'email', label: 'Email (sudah terdaftar)', type: 'email', required: true },
        { name: 'role', label: 'Role', type: 'select', value: 'viewer', options: roleOptions },
        { name: 'apps', label: 'Aplikasi yang boleh dipakai (untuk Editor/Viewer)', type: 'checks', options: appOpts, value: [],
          hint: 'Owner/Admin otomatis mendapat semua aplikasi.' },
      ],
      submitText: 'Tambahkan',
    });
    if (!v) return;
    const { error } = await sb.rpc('add_member', { p_org: state.org.id, p_email: v.email, p_role: v.role, p_apps: v.apps || [] });
    if (error) return toast(friendlyError(error), 'error', 6000);
    toast('Anggota ditambahkan', 'ok');
    load();
  };

  await load();
}
