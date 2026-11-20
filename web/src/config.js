// Konfigurasi global aplikasi. Judul, logo, dan warna per organisasi
// diatur dari halaman Pengaturan (disimpan di organizations.settings).
// Rapikan Project URL: buang spasi, garis miring di akhir, dan tambahan seperti
// /rest/v1 atau /auth/v1 yang sering ikut tersalin dari dashboard.
function normalizeUrl(raw) {
  let u = String(raw || '').trim().replace(/\s+/g, '');
  u = u.replace(/\/(rest|auth|storage|realtime|functions)\/v1.*$/i, '');
  return u.replace(/\/+$/, '');
}

// Kunci yang DILARANG di frontend (melewati semua aturan keamanan)
export function isSecretKey(key) {
  if (/^sb_secret_/.test(key)) return true;
  if (/^eyJ/.test(key)) {
    try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; }
    catch { return false; }
  }
  return false;
}

export const APP = {
  version: '1.0.1',
  defaultTitle: 'Platform Inti',
  defaultTheme: '#15803d',
  supabaseUrl: normalizeUrl(import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: String(import.meta.env.VITE_SUPABASE_KEY || '').replace(/\s+/g, ''),
  // Pusat peta awal (Tasikmalaya). Ubah sesuai wilayah kerja.
  mapCenter: [-7.35, 108.22],
  mapZoom: 12,
  // Ukuran maksimum unggahan
  maxLogoBytes: 2 * 1024 * 1024,
  maxImportFeatures: 20000,
};

export const ROLES = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};
