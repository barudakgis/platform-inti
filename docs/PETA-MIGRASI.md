# Peta Migrasi Aplikasi GAS → Platform Baru

Keterangan target:

- **Supabase (Platform Inti)** — PostgreSQL + PostGIS, satu proyek Pro dipakai bersama
- **Cloudflare D1** — Workers + D1, satu langganan $5/bulan untuk semua aplikasi ringan
- **Digabung** — fitur dimasukkan ke aplikasi induk (lihat catatan)
- **Evaluasi / AI proxy** — aplikasi AI: kunci API disimpan di Worker, user & kuota di Platform Inti

> Disusun dari katalog nama & deskripsi aplikasi. Geser fase atau target bila kondisi lapangan berbeda.

## Fase 0 — Fondasi (Minggu 1–2)

Bangun Platform Inti (login, organisasi, role, lisensi, audit) dari template starter. Aplikasi katalog & lisensi langsung menjadi bagian dari inti.

| Aplikasi | Target | Catatan |
|---|---|---|
| Platform Inti (baru) | Supabase (Platform Inti) | Login, organisasi, role, lisensi, audit — fondasi semua aplikasi |
| Beranda Aplikasi / MY APP CENTER | Supabase (Platform Inti) | Menjadi tabel apps + halaman Beranda di Platform Inti |
| App Collection & Universal EULA | Supabase (Platform Inti) | Menjadi tabel licenses + halaman lisensi |
| Generator EULA | Digabung | Gabung ke App Collection & EULA; PDF dibuat di browser |

## Fase 1 — GIS & Survei (Minggu 3–8)

Aplikasi yang paling sering mentok kuota GAS dan paling diuntungkan PostGIS (luas, overlay, buffer, impor SHP/GeoJSON besar).

| Aplikasi | Target | Catatan |
|---|---|---|
| WebGIS Management | Supabase (Platform Inti) | Jadi Modul Peta inti (sudah ada di starter: modul gis) |
| SawitGIS Mandiri (Barudak GIS) | Supabase (Platform Inti) | Live GPS tracking pakai Supabase Realtime |
| TaniPintar | Supabase (Platform Inti) | Pokok, laporan, galeri foto → Storage; impor SHP via GeoJSON |
| GeoUkur GPS | Supabase (Platform Inti) | Luas/keliling dihitung PostGIS (geography) |
| Soil Database Enterprise | Supabase (Platform Inti) | Induk data tanah |
| Soil Survey App | Digabung | Gabung ke Soil Database Enterprise |
| SSU Digital Enterprise | Supabase (Platform Inti) | Modul sampling di skema yang sama dengan Soil DB |
| LSU Enterprise Platform | Supabase (Platform Inti) | Modul sampling daun; berbagi tabel blok dengan SSU |
| LAND-EVAL Enterprise (TakarLahan) | Supabase (Platform Inti) | Kelas kesesuaian lahan = query spasial |
| PALMSTAKE RTK Enterprise | Supabase (Platform Inti) | Titik pancang presisi; ekspor ke QField/CSV |
| Universal Mobile Mapping GIS | Supabase (Platform Inti) | Blueprint aslinya memang PostGIS — paling pas |
| Drone Survey Enterprise (LangitUkur) | Supabase (Platform Inti) | Metadata di Supabase; ortofoto/tiles besar di R2 |
| SawitVision AI GIS | Supabase (Platform Inti) | Hasil deteksi pokok di PostGIS; proses AI di luar (API/PC) |

## Fase 2 — Manajemen Kebun (Minggu 9–14)

PALM OS menjadi induk; aplikasi kebun lain masuk sebagai modul.

| Aplikasi | Target | Catatan |
|---|---|---|
| PALM OS Enterprise | Supabase (Platform Inti) | Induk ERP kebun: HO → Region → Estate → Afdeling → PKS |
| SawitOps | Digabung | Gabung ke PALM OS |
| PalmBudget Enterprise | Supabase (Platform Inti) | Modul budget/RKAP di PALM OS |
| SawitGIS Replanting | Supabase (Platform Inti) | Modul PALM OS + layer GIS |
| SawitGIS Water Management | Supabase (Platform Inti) | Modul PALM OS + layer GIS |
| SawitGIS Hologram 3D | Supabase (Platform Inti) | Data dari PostGIS; viewer 3D tetap di frontend |
| LandSurvey Cost Manager | Supabase (Platform Inti) | Induk RAB survei |
| RAB Survey Lahan | Digabung | Gabung ke LandSurvey Cost Manager |
| Kebun Digital Pintar (Android) | Supabase (Platform Inti) | supabase-js langsung di React Native/Expo |
| Profil Perusahaan Sawit | Cloudflare D1 | Halaman statis + form kontak lewat Worker |

## Fase 3 — Bisnis & Kantor (Minggu 15–22)

Aplikasi transaksi (akuntansi, POS, invoice) — butuh database relasional yang konsisten.

| Aplikasi | Target | Catatan |
|---|---|---|
| Pembukuan Enterprise | Supabase (Platform Inti) | Butuh transaksi (ACID) — alasan terkuat keluar dari Sheets |
| Universal Invoice Manager | Supabase (Platform Inti) | Nomor invoice pakai sequence, bebas bentrok |
| Retail POS Enterprise | Supabase (Platform Inti) | Offline-first wajib; stok per cabang |
| Kasir Toko | Digabung | Gabung ke Retail POS (paket 'basic') |
| Business Automation Enterprise | Supabase (Platform Inti) | Induk workflow & approval |
| Workflow Persetujuan | Digabung | Gabung ke Business Automation Enterprise |
| OMS Enterprise | Supabase (Platform Inti) | Cuti & libur memakai workflow BAE |
| CCMS Kontrak | Supabase (Platform Inti) | Dokumen di Storage privat |
| Housing Contractor ERP | Supabase (Platform Inti) | Modul proyek, RAB, progres |
| SIPONDOK | Supabase (Platform Inti) | Data santri/siswa = data pribadi, RLS ketat |
| Masjid Digital Enterprise | Supabase (Platform Inti) | Keuangan & jamaah |
| WargaNet RT/RW | Supabase (Platform Inti) | Iuran & administrasi warga |
| RukunKas | Supabase (Platform Inti) | Induk keuangan keluarga |
| ArtaPilar (Personal Finance) | Digabung | Gabung ke RukunKas |
| HMIS Enterprise (SIMRS) | Supabase (Platform Inti) | Data kesehatan: wajib audit keamanan & kepatuhan sebelum produksi |

## Fase 4 — Publik Ringan (Paralel, kapan saja)

Aplikasi yang trafiknya publik tapi datanya sederhana: cukup Cloudflare D1 ($5 untuk semuanya).

| Aplikasi | Target | Catatan |
|---|---|---|
| NikahKita | Cloudflare D1 | RSVP & ucapan di D1 |
| UndangKita (Sistem Undangan Digital) | Digabung | Gabung ke NikahKita |
| Silsilah Keluarga Besar | Cloudflare D1 | Data pohon keluarga di D1 |
| Nur Youth | Cloudflare D1 | Konten statis; progres siswa di D1 |
| NutriFit ID | Cloudflare D1 | Data ringan per user |
| SmartSlide Presentasi | Cloudflare D1 | Lisensi dicek ke Platform Inti |
| Aplikasi Islami lain (Quran, jadwal ibadah) | Cloudflare D1 | Sebagian besar cukup statis + cache offline |

## Fase 5 — Aplikasi AI (Setelah fase 3)

Kunci API AI disembunyikan di Cloudflare Worker; user & kuota dikelola Platform Inti.

| Aplikasi | Target | Catatan |
|---|---|---|
| EduPulse AI | Evaluasi / AI proxy | Pertimbangkan gabung dengan Lentera Belajar AI |
| Lentera Belajar AI (AI Education) | Evaluasi / AI proxy | Worker AI proxy + Platform Inti |
| LIFE OS (Sadaya) | Evaluasi / AI proxy | Pakai ulang modul RukunKas & lainnya |
| AI Personal Life Assistant | Evaluasi / AI proxy | Bisa jadi modul LIFE OS |
| AI Magic Studio | Evaluasi / AI proxy | Gambar hasil AI di R2 |
| AI Creative & Content Studio | Evaluasi / AI proxy | Gambar hasil AI di R2 |
| CineAI Studio | Evaluasi / AI proxy | Video besar → R2; biaya API AI jadi faktor utama |
| Cuplikin (video clipper) | Evaluasi / AI proxy | Proses video tidak bisa di GAS/Workers; perlu layanan/server khusus |
| AI Virtual Office 3D | Evaluasi / AI proxy | Prototipe; tunda sampai ada pengguna |
| Sinyal Trading AI | Evaluasi / AI proxy | Data pasar real-time biasanya berbayar; wajib disclaimer |

## Ringkasan

- Total aplikasi dipetakan: 59
- Supabase (Platform Inti): 34
- Digabung: 8
- Cloudflare D1: 7
- Evaluasi / AI proxy: 10
