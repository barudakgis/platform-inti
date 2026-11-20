import { sb, must, friendlyError } from '../lib/supabase.js';
import { state } from '../lib/store.js';
import { esc, toast, imageDialog, confirmDialog } from '../lib/ui.js';
import { ROLES } from '../config.js';

export default async function profileView(el, { refreshShell }) {
  const p = state.profile || {};
  el.innerHTML = `
    <h2>Profil saya</h2>
    <form class="card form narrow" id="pf">
      <div class="row">
        <button type="button" class="avatar-btn" id="avBtn" title="Perbesar foto">
          ${p.avatar_url ? `<img class="avatar" src="${esc(p.avatar_url)}" alt="">` : '<span class="avatar ph">👤</span>'}
        </button>
        <div><strong>${esc(p.email || state.session.user.email)}</strong>
          <div class="muted small">${esc(state.org.name)} · ${esc(ROLES[state.role])}</div></div>
      </div>
      <label>Nama lengkap</label><input name="full_name" value="${esc(p.full_name || '')}" required>
      <label>No. HP / WhatsApp</label><input name="phone" value="${esc(p.phone || '')}" placeholder="08xxxxxxxxxx">
      <label>Foto profil (maks 2 MB)</label><input name="avatar" type="file" accept="image/png,image/jpeg,image/webp">
      <button class="btn primary" type="submit">Simpan</button>
    </form>
    <div class="card narrow row between">
      <span>Keluar dari akun di perangkat ini</span>
      <button class="btn danger" id="logout">Keluar</button>
    </div>`;

  el.querySelector('#avBtn').onclick = () => p.avatar_url && imageDialog(p.avatar_url, 'Foto profil');

  const form = el.querySelector('#pf');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const patch = { full_name: form.elements.full_name.value.trim(), phone: form.elements.phone.value.trim() };
      const file = form.elements.avatar.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) throw new Error('Foto maksimal 2 MB');
        const ext = file.name.split('.').pop().toLowerCase();
        // path wajib: <org_id>/avatars/<user_id>-...
        const path = `${state.org.id}/avatars/${state.session.user.id}-${Date.now()}.${ext}`;
        must(await sb.storage.from('branding').upload(path, file, { contentType: file.type }));
        patch.avatar_url = sb.storage.from('branding').getPublicUrl(path).data.publicUrl;
      }
      state.profile = must(await sb.from('profiles').update(patch).eq('id', state.session.user.id).select().single());
      toast('Profil disimpan', 'ok');
      refreshShell();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  };

  el.querySelector('#logout').onclick = async () => {
    if (await confirmDialog('Keluar dari akun?', 'Keluar')) await sb.auth.signOut();
  };
}
