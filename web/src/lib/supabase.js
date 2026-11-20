import { createClient } from '@supabase/supabase-js';
import { APP, isSecretKey } from '../config.js';

export const secretKeyUsed = isSecretKey(APP.supabaseKey);
export const urlValid = /^https?:\/\/[^/\s]+$/.test(APP.supabaseUrl || '');
export const configured = Boolean(APP.supabaseUrl && APP.supabaseKey && urlValid && !secretKeyUsed);

export const sb = configured
  ? createClient(APP.supabaseUrl, APP.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Bedakan "internet putus" dari "ditolak server" agar antrean offline
// hanya menahan data saat memang tidak ada koneksi.
export function isNetworkError(err) {
  if (!navigator.onLine) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('fetch failed')
  );
}

// Lempar error bila respons Supabase gagal; kembalikan data bila sukses.
export function must({ data, error }) {
  if (error) throw error;
  return data;
}

// Pesan error yang ramah untuk ditampilkan ke pengguna
export function friendlyError(err) {
  const msg = String(err?.message || err || 'Terjadi kesalahan');
  if (isNetworkError(err)) return 'Tidak ada koneksi internet.';
  if (msg.includes('row-level security')) return 'Anda tidak punya izin untuk tindakan ini (cek role / lisensi).';
  if (msg.includes('Invalid login credentials')) return 'Email atau password salah.';
  if (msg.includes('Email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (msg.includes('duplicate key') && msg.includes('slug')) return 'Kode organisasi sudah dipakai, pilih yang lain.';
  return msg;
}
