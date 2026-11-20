# Platform Inti — Template Starter

Fondasi untuk memindahkan aplikasi GAS + Google Sheets ke **Supabase (PostgreSQL + PostGIS)**
dengan frontend **PWA** (offline-first) yang di-hosting gratis di **Cloudflare Pages** atau **GitHub Pages**.
Untuk aplikasi publik ringan disediakan **Cloudflare Workers + D1**.

Panduan lengkap langkah demi langkah ada di **`Panduan-Setup-Platform-Inti.pdf`**.

## Isi

| Folder | Isi |
|---|---|
| `supabase/migrations/` | 5 file SQL: inti (organisasi, role, lisensi, audit), RLS, modul GIS, storage, katalog aplikasi |
| `supabase/templates/modul_baru.sql` | Template untuk membuat tabel aplikasi baru (sudah lengkap RLS + audit) |
| `web/` | PWA (Vite + JavaScript biasa + Leaflet): login, organisasi, anggota, pengaturan, profil, modul peta |
| `worker-d1/` | API ringan Cloudflare Workers + D1 (RSVP, buku tamu, form kontak) |
| `scripts/impor.mjs` | Impor CSV / GeoJSON ke Supabase |
| `gas/EksporKeCSV.gs` | Skrip GAS untuk mengekspor semua sheet aplikasi lama ke CSV |
| `docs/PETA-MIGRASI.md` | Peta migrasi aplikasi per fase |
| `.github/workflows/` | Deploy otomatis ke GitHub Pages (opsional) |

## Mulai cepat

```bash
# 1. Database: jalankan 5 file di supabase/migrations/ berurutan di Supabase SQL Editor
# 2. Frontend
cd web
cp .env.example .env.local      # isi URL & publishable/anon key
npm install
npm run dev                     # buka http://localhost:5173
```

## Fitur frontend

- Login email + password, daftar, lupa password
- Multi-organisasi (multi-tenant), ganti organisasi, role owner/admin/editor/viewer
- Lisensi per aplikasi + masa trial otomatis
- Judul, logo (bisa di-zoom), dan warna tema per organisasi · mode gelap
- Modul peta: layer, titik GPS (dengan akurasi), titik/garis/poligon, poligon dari jalan keliling pakai GPS,
  luas & panjang dihitung PostGIS, impor/ekspor GeoJSON, ekspor CSV untuk Sheets
- **Offline-first**: data disimpan di HP (IndexedDB) dan dikirim otomatis saat online, tanpa data ganda
- Audit log, halaman S&K dan Privasi, versi aplikasi, tombol Back HP tidak langsung menutup aplikasi

## Keamanan — wajib dibaca

- Frontend **hanya** memakai kunci publik (publishable / anon). Kunci `secret` / `service_role`
  hanya untuk `scripts/.env` di komputer Anda.
- Semua tabel memakai Row Level Security. Tabel baru **wajib** mengikuti `templates/modul_baru.sql`.
- Tabel `licenses` hanya bisa diubah pemilik platform lewat SQL Editor.
