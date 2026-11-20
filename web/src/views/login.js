import { sb, friendlyError } from '../lib/supabase.js';
import { esc, toast } from '../lib/ui.js';
import { APP } from '../config.js';

export default async function loginView(el) {
  let mode = 'masuk';

  const draw = () => {
    el.innerHTML = `
      <div class="center">
        <div class="card narrow">
          <div class="brand"><span class="logo-ph big">🌱</span><h2>${esc(APP.defaultTitle)}</h2></div>
          <div class="tabs">
            <button data-mode="masuk" class="${mode === 'masuk' ? 'active' : ''}">Masuk</button>
            <button data-mode="daftar" class="${mode === 'daftar' ? 'active' : ''}">Daftar</button>
            <button data-mode="lupa" class="${mode === 'lupa' ? 'active' : ''}">Lupa password</button>
          </div>
          <form class="form" id="authForm">
            ${mode === 'daftar' ? `<label>Nama lengkap</label><input name="full_name" required>` : ''}
            <label>Email</label><input name="email" type="email" autocomplete="email" required>
            ${mode !== 'lupa' ? `<label>Password</label>
              <input name="password" type="password" minlength="8"
                autocomplete="${mode === 'daftar' ? 'new-password' : 'current-password'}" required>` : ''}
            <button class="btn primary block" type="submit">
              ${mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Buat akun' : 'Kirim link reset'}
            </button>
          </form>
          <p class="muted small">Dengan masuk, Anda menyetujui
            <a href="./legal/terms.html" target="_blank">Syarat &amp; Ketentuan</a> dan
            <a href="./legal/privacy.html" target="_blank">Kebijakan Privasi</a>.</p>
        </div>
      </div>`;
    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; draw(); }));
    el.querySelector('#authForm').onsubmit = submit;
  };

  const redirectTo = location.origin + location.pathname;

  async function submit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const v = Object.fromEntries(new FormData(e.target).entries());
    btn.disabled = true;
    try {
      if (mode === 'masuk') {
        const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password });
        if (error) throw error;
      } else if (mode === 'daftar') {
        const { data, error } = await sb.auth.signUp({
          email: v.email,
          password: v.password,
          options: { data: { full_name: v.full_name }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (!data.session) {
          toast('Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.', 'ok', 7000);
          mode = 'masuk';
          draw();
        }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(v.email, { redirectTo });
        if (error) throw error;
        toast('Link reset password sudah dikirim ke email Anda.', 'ok', 7000);
      }
    } catch (err) {
      toast(friendlyError(err), 'error', 6000);
    } finally {
      btn.disabled = false;
    }
  }

  draw();
}
