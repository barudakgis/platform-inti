-- =====================================================================
-- PLATFORM INTI — 005 KATALOG APLIKASI AWAL
-- Tambahkan baris baru di sini setiap kali sebuah aplikasi selesai
-- dimigrasikan. status: 'aktif' (dapat trial otomatis), 'dev', 'arsip'.
-- =====================================================================

insert into public.apps (code, name, description, category, status, icon, default_trial_days, sort) values
  ('gis',        'Modul Peta (GIS)',      'Layer, titik GPS, poligon, luas otomatis, impor/ekspor GeoJSON', 'GIS',     'aktif', '🗺️', 30, 10),
  ('soil',       'Soil Database',         'Data survei & sampling tanah (SSU)',                             'GIS',     'dev',   '🧪', 30, 20),
  ('palm_os',    'PALM OS',               'Manajemen kebun sawit HO→Estate→Afdeling',                       'Kebun',   'dev',   '🌴', 30, 30),
  ('invoice',    'Invoice Manager',       'Invoice, nota, surat jalan, berita acara',                       'Bisnis',  'dev',   '🧾', 14, 40),
  ('pembukuan',  'Pembukuan',             'Akuntansi & pembukuan',                                          'Bisnis',  'dev',   '📒', 14, 50)
on conflict (code) do update
  set name = excluded.name, description = excluded.description,
      category = excluded.category, icon = excluded.icon, sort = excluded.sort;
