import { sb, friendlyError } from '../lib/supabase.js';
import { state } from '../lib/store.js';
import { esc, toast, slugify } from '../lib/ui.js';

// Ditampilkan bila user sudah login tapi belum tergabung di organisasi mana pun.
export default async function onboardingView(el, reload) {
  el.innerHTML = `
    <div class="center">
      <div class="card narrow">
        <h2>Selamat datang, ${esc(state.profile?.full_name || '')}</h2>
        <p>Anda belum tergabung di organisasi mana pun. Pilih salah satu:</p>
        <h3>1. Buat organisasi baru</h3>
        <form class="form" id="orgForm">
          <label>Nama organisasi / perusahaan / kebun</label>
          <input name="name" required minlength="2" maxlength="120" placeholder="PT Kebun Contoh">
          <label>Kode singkat (huruf kecil, angka, tanda -)</label>
          <input name="slug" required pattern="[a-z0-9-]{3,40}" placeholder="kebun-contoh">
          <small>Anda otomatis menjadi Owner dan mendapat masa coba untuk semua aplikasi aktif.</small>
          <button class="btn primary block" type="submit">Buat organisasi</button>
        </form>
        <h3>2. Bergabung ke organisasi yang sudah ada</h3>
        <p>Minta admin organisasi menambahkan email <b>${esc(state.session.user.email)}</b>
          di menu Anggota, lalu tekan tombol ini.</p>
        <div class="row">
          <button class="btn" id="reloadBtn">Muat ulang</button>
          <button class="btn ghost" id="logoutBtn">Keluar</button>
        </div>
      </div>
    </div>`;

  const form = el.querySelector('#orgForm');
  form.elements.name.addEventListener('input', () => {
    if (!form.elements.slug.dataset.touched) form.elements.slug.value = slugify(form.elements.name.value);
  });
  form.elements.slug.addEventListener('input', () => (form.elements.slug.dataset.touched = '1'));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    const { error } = await sb.rpc('create_organization', { p_name: form.elements.name.value.trim(), p_slug: form.elements.slug.value.trim() });
    btn.disabled = false;
    if (error) return toast(friendlyError(error), 'error', 6000);
    toast('Organisasi dibuat', 'ok');
    reload();
  };
  el.querySelector('#reloadBtn').onclick = () => reload();
  el.querySelector('#logoutBtn').onclick = () => sb.auth.signOut();
}
