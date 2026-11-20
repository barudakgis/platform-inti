// Konfigurasi global aplikasi. Judul, logo, dan warna per organisasi
// diatur dari halaman Pengaturan (disimpan di organizations.settings).
export const APP = {
  version: '1.0.0',
  defaultTitle: 'Platform Inti',
  defaultTheme: '#15803d',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_KEY,
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
