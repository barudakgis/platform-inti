/* PALM OS 1.3.0 — kode server (.gs) dijalankan di browser. Dibangun otomatis; jangan diedit. */

/* ===== Schema.gs ===== */
/**
 * PALM OS ENTERPRISE — Schema.gs
 * Metadata seluruh modul (single source of truth untuk sheet, form, tabel, validasi).
 * Format field: 'key|tipe|Label|flag'
 *   tipe : text, number, date, textarea, sel:A,B,C, ref:modul, geo, gps, photo, file, lines
 *   flag : r = wajib, u = unik, ro = dihitung server (readonly), h = sembunyi di tabel, s = data sensitif
 */
var APP = {
  NAME: 'PALM OS Enterprise',
  FULL: 'Integrated Oil Palm Plantation Management System',
  TAGLINE: 'One Company. One Data. One Integrated Plantation Ecosystem.',
  VERSION: '1.3.0',
  BUILD: '2026-11-25',
  TZ: 'Asia/Jakarta',
  CHUNK: 45000,            // batas aman < 50.000 karakter per sel
  CELL_LIMIT: 10000000,    // batas 10 juta sel per spreadsheet
  SESSION_HOURS: 12,
  EDITION: 'FULL'          // 'FULL' = versi penuh berlisensi, 'DEMO' = versi demo dengan batasan (lihat DEMO_LIMITS di License.gs)
};

var SYS = {
  USERS: '_Users', SESS: '_Sessions', AUDIT: '_AuditLog', SET: '_Settings',
  CHUNK: '_Chunks', APPR: '_Approvals', NOTIF: '_Notifications', ARCH: '_Archives'
};

var SYS_COLS = ['id', 'status', 'version', 'deleted', 'created_at', 'created_by', 'updated_at', 'updated_by', 'device'];

var GROUPS = [
  ['dash', 'Executive Dashboard'], ['wfx', 'Workflow & Pengajuan'], ['qr', 'QR Code'], ['org', 'Organisasi'], ['plant', 'Plantation'], ['nur', 'Pembibitan'], ['lc', 'Land Clearing (LC)'], ['gis', 'GIS & Peta'],
  ['agro', 'Agronomi'], ['harv', 'Panen'], ['bor', 'Kerja Borongan & Kontraktor'], ['logi', 'Transportasi'], ['mill', 'Pabrik (PKS)'],
  ['hr', 'SDM & Tenaga Kerja'], ['inv', 'Gudang & Stok'], ['proc', 'Pengadaan'], ['fin', 'Keuangan'],
  ['asset', 'Aset & Engineering'], ['comp', 'Sustainability & Compliance'], ['aud', 'Audit & Inspeksi'], ['docs', 'Dokumen (DMS)'],
  ['comm', 'Komersial'], ['rpt', 'Laporan & Analitik'], ['ai', 'AI Intelligence'], ['appr', 'Pusat Persetujuan'], ['sys', 'Administrasi Sistem']
];

var MODULES = {
  // ORGANISASI
  companies: { g: 'org', t: 'Perusahaan', f: ['code|text|Kode|r,u', 'name|text|Nama Perusahaan|r', 'npwp|text|NPWP|h', 'address|textarea|Alamat|h'] },
  regions: { g: 'org', t: 'Region', f: ['code|text|Kode Region|r,u', 'name|text|Nama Region|r', 'company_code|ref:companies|Perusahaan|r', 'manager|text|Regional Manager'] },
  estates: { g: 'org', t: 'Estate / Kebun', sc: 'code', f: ['code|text|Kode Estate|r,u', 'name|text|Nama Estate|r', 'region_code|ref:regions|Region|r', 'hgu_ha|number|Luas HGU (ha)', 'managed_ha|number|Luas Dikelola (ha)', 'manager|text|Estate Manager', 'mill_code|ref:mills|PKS Tujuan'] },
  divisions: { g: 'org', t: 'Afdeling', f: ['code|text|Kode Afdeling|r,u', 'name|text|Nama Afdeling|r', 'estate_code|ref:estates|Estate|r', 'assistant|text|Asisten Afdeling'] },
  mills: { g: 'org', t: 'PKS / Mill', f: ['code|text|Kode PKS|r,u', 'name|text|Nama PKS|r', 'company_code|ref:companies|Perusahaan', 'capacity_tph|number|Kapasitas (ton/jam)'] },

  // PLANTATION
  blocks: { g: 'plant', t: 'Master Blok', f: ['code|text|Kode Blok|r,u', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling|r', 'legal_ha|number|Luas Legal (ha)', 'planted_ha|number|Luas Tanam (ha)|r', 'planting_year|number|Tahun Tanam|r', 'variety|text|Varietas', 'palms|number|Jumlah Pokok', 'sph|number|SPH|ro', 'crop_status|sel:TBM,TM,TT,Non-Produktif|Status Tanaman|r', 'soil|text|Jenis Tanah|h', 'topography|sel:Datar,Bergelombang,Berbukit,Rendahan|Topografi|h', 'geom|geo|Geometri Blok (GeoJSON)|h'] },
  census: { g: 'plant', t: 'Sensus Pokok', wf: 1, f: ['census_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok|r', 'productive|number|Pokok Produktif|r', 'unproductive|number|Pokok Non-Produktif', 'dead|number|Pokok Mati', 'supply|number|Sisipan', 'surveyor|text|Petugas', 'notes|textarea|Catatan|h'] },
  replanting: { g: 'plant', t: 'Rencana Replanting', wf: 1, amt: 'est_cost', f: ['block_code|ref:blocks|Blok|r', 'estate_code|ref:estates|Estate|r', 'target_year|number|Tahun Target|r', 'area_ha|number|Luas (ha)|r', 'est_cost|number|Estimasi Biaya (Rp)', 'reason|textarea|Alasan / Kajian|h'] },

  // PEMBIBITAN
  nurseries: { g: 'nur', t: 'Lokasi Pembibitan', f: ['code|text|Kode Bibitan|r,u', 'name|text|Nama Bibitan|r', 'estate_code|ref:estates|Estate|r', 'n_type|sel:Pre-Nursery,Main Nursery,PN & MN|Tipe|r', 'capacity|number|Kapasitas (bibit)', 'area_ha|number|Luas (ha)', 'water_source|text|Sumber Air|h', 'pic|ref:employees|Penanggung Jawab', 'gps|gps|Lokasi GPS|h'] },
  seed_batches: { g: 'nur', t: 'Batch Kecambah & Bibit', wf: 1, amt: 'seed_cost', f: ['batch_no|text|No. Batch|r,u', 'nursery_code|ref:nurseries|Lokasi Bibitan|r', 'estate_code|ref:estates|Estate|r', 'supplier|text|Sumber Benih (PPKS, Socfindo, dll.)|r', 'variety|text|Varietas|r', 'cert_no|text|No. Sertifikat / DO Benih|h', 'receive_date|date|Tgl Terima Kecambah|r', 'qty_received|number|Kecambah Diterima|r', 'qty_abnormal|number|Abnormal / Afkir Awal', 'unit_price|number|Harga per Kecambah (Rp)', 'seed_cost|number|Nilai Benih (Rp)|ro', 'stage|sel:Pre-Nursery,Main Nursery,Siap Salur,Habis|Tahap', 'qty_culled|number|Total Afkir Seleksi|ro', 'qty_dispatched|number|Total Disalurkan|ro', 'qty_live|number|Stok Bibit Hidup|ro', 'age_month|number|Umur (bulan)|ro', 'notes|textarea|Catatan|h'] },
  nursery_acts: { g: 'nur', t: 'Kegiatan Pembibitan', wf: 1, f: ['act_date|date|Tanggal|r', 'batch_no|ref:seed_batches|Batch|r', 'estate_code|ref:estates|Estate|r', 'activity|sel:Penyiraman,Pemupukan,Penyemprotan Hama/Penyakit,Seleksi/Culling,Transplanting PN ke MN,Konsolidasi/Penyusunan,Penyiangan,Sensus Bibit|Kegiatan|r', 'qty_culled|number|Bibit Diafkir (seleksi)', 'item_code|ref:items|Bahan (pupuk/pestisida)', 'wh_code|ref:warehouses|Gudang Bahan', 'qty_item|number|Jumlah Bahan', 'hk|number|HK', 'spk_no|ref:bor_spk|No. SPK Borongan (opsional)', 'gps|gps|GPS|h', 'photo|photo|Foto|h', 'notes|textarea|Catatan|h'] },
  seed_dispatch: { g: 'nur', t: 'Penyaluran Bibit ke Lapangan', wf: 1, f: ['sd_no|text|No. Penyaluran|r,u', 'sd_date|date|Tanggal|r', 'batch_no|ref:seed_batches|Batch|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok Tujuan|r', 'purpose|sel:Tanam Baru,Replanting,Sisipan|Tujuan|r', 'qty|number|Jumlah Bibit|r', 'lc_code|ref:lc_projects|Proyek LC (opsional)', 'vehicle_code|ref:vehicles|Kendaraan', 'receiver|text|Penerima Lapangan', 'notes|textarea|Catatan|h'] },

  // LAND CLEARING
  lc_projects: { g: 'lc', t: 'Proyek Land Clearing', wf: 1, amt: 'budget', f: ['lc_code|text|Kode Proyek LC|r,u', 'name|text|Nama Proyek|r', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling', 'block_code|ref:blocks|Blok (bila sudah ada)', 'lc_type|sel:Pembukaan Baru (New Planting),Replanting,Konversi Lahan|Jenis|r', 'area_ha|number|Luas Rencana (ha)|r', 'start_date|date|Mulai|r', 'end_date|date|Target Selesai', 'executor|sel:Internal,Kontraktor|Pelaksana|r', 'vendor_code|ref:vendors|Kontraktor', 'budget|number|Anggaran (Rp)', 'progress_pct|number|Progres Fisik (%)|ro', 'cost_real|number|Biaya Realisasi (Rp)|ro', 'geom|geo|Batas Areal (GeoJSON)|h', 'notes|textarea|Catatan|h'] },
  lc_progress: { g: 'lc', t: 'Progres Harian LC', wf: 1, f: ['p_date|date|Tanggal|r', 'lc_code|ref:lc_projects|Proyek LC|r', 'estate_code|ref:estates|Estate|r', 'stage|sel:Survei & Pancang Batas,Imas,Tumbang,Rencek & Rumpuk,Pembuatan Jalan & Parit,Pancang Tanam,Lubang Tanam,Tanam Kacangan (LCC),Tanam Kelapa Sawit|Tahapan|r', 'ha_done|number|Luas Selesai (ha)|r', 'cost|number|Biaya (Rp)', 'spk_no|ref:bor_spk|No. SPK Borongan', 'equipment|text|Alat Berat / Unit', 'hk|number|HK', 'gps|gps|GPS|h', 'photo|photo|Foto Progres|h', 'notes|textarea|Catatan|h'] },

  // AGRONOMI
  work_orders: { g: 'agro', t: 'Perintah Kerja (SPK)', wf: 1, amt: 'budget_rp', f: ['wo_no|text|No. SPK|r,u', 'wo_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling', 'block_code|ref:blocks|Blok', 'activity|sel:Pemupukan,Semprot Gulma,Pruning,Pengendalian Hama,Perawatan Jalan,Perawatan Drainase,Sensus,Lainnya|Kegiatan|r', 'target_qty|number|Target', 'unit|sel:ha,pokok,m,HK|Satuan', 'mandor|text|Mandor', 'budget_rp|number|Anggaran (Rp)'] },
  work_real: { g: 'agro', t: 'Realisasi Pekerjaan', wf: 1, f: ['wo_no|ref:work_orders|No. SPK|r', 'real_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok', 'real_qty|number|Realisasi|r', 'hk|number|Hari Kerja (HK)', 'cost_rp|number|Biaya (Rp)', 'gps|gps|Lokasi GPS|h', 'photo|photo|Foto Bukti|h'] },
  fert_reco: { g: 'agro', t: 'Rekomendasi Pupuk', wf: 1, f: ['year|number|Tahun|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok|r', 'item_code|ref:items|Jenis Pupuk|r', 'dose_kg_palm|number|Dosis (kg/pokok)|r', 'rounds|number|Rotasi per Tahun', 'basis|textarea|Dasar Rekomendasi (LSU/SSU)|h'] },
  fert_app: { g: 'agro', t: 'Aplikasi Pemupukan', wf: 1, f: ['app_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok|r', 'item_code|ref:items|Pupuk|r', 'wh_code|ref:warehouses|Gudang Asal|r', 'qty_kg|number|Jumlah (kg)|r', 'palms_applied|number|Pokok Dipupuk', 'area_ha|number|Luas (ha)', 'hk|number|HK', 'gps|gps|GPS|h', 'photo|photo|Foto|h'] },
  lsu: { g: 'agro', t: 'Survei LSU & Lab', wf: 1, f: ['sample_no|text|No. Sampel|r,u', 'survey_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok|r', 'frond|sel:Pelepah 9,Pelepah 17,Pelepah 25|Pelepah', 'sample_palms|number|Pokok Sampel', 'officer|text|Petugas', 'lab|text|Laboratorium|h', 'n_pct|number|N (%)', 'p_pct|number|P (%)', 'k_pct|number|K (%)', 'mg_pct|number|Mg (%)', 'b_ppm|number|B (ppm)', 'status_hara|text|Status Hara|ro', 'gps|gps|GPS|h'] },
  pest: { g: 'agro', t: 'Hama & Penyakit', f: ['obs_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'block_code|ref:blocks|Blok|r', 'type|sel:Ulat Api,Ulat Kantong,Tikus,Oryctes,Ganoderma,Lainnya|Jenis|r', 'severity|sel:Ringan,Sedang,Berat|Tingkat|r', 'affected_palms|number|Pokok Terserang', 'action|textarea|Tindakan|h', 'gps|gps|GPS|h', 'photo|photo|Foto|h'] },

  // PANEN
  harvest_plan: { g: 'harv', t: 'Rencana Panen & Ancak', f: ['plan_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling|r', 'block_code|ref:blocks|Blok|r', 'ancak|text|Ancak', 'harvesters|number|Jumlah Pemanen', 'target_jjg|number|Target Janjang', 'target_kg|number|Target (kg)', 'rotation|number|Rotasi ke-'] },
  harvest: { g: 'harv', t: 'Hasil Panen', wf: 1, uq: ['h_date', 'harvester_no', 'block_code', 'tph'], f: ['h_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling|r', 'block_code|ref:blocks|Blok|r', 'harvester_no|ref:employees|Pemanen|r', 'tph|text|TPH', 'janjang|number|Janjang|r', 'kg|number|Berat (kg)|r', 'bjr|number|BJR (kg/jjg)|ro', 'brondolan_kg|number|Brondolan (kg)', 'mentah|number|Buah Mentah (jjg)', 'lewat_matang|number|Lewat Matang (jjg)', 'restan_jjg|number|Restan (jjg)', 'spb_no|text|No. SPB', 'gps|gps|GPS|h', 'photo|photo|Foto TPH|h'] },

  // KERJA BORONGAN (internal & kontraktor)
  bor_spk: { g: 'bor', t: 'SPK Kerja Borongan', wf: 1, amt: 'value', f: ['spk_no|text|No. SPK|r,u', 'spk_date|date|Tanggal SPK|r', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling', 'block_code|ref:blocks|Blok', 'work_cat|sel:Panen,Perawatan,Pemupukan,Pembibitan,Land Clearing,Infrastruktur,Angkutan,Lainnya|Kategori|r', 'work_type|text|Jenis Pekerjaan (mis. Piringan manual, Semprot gulma)|r', 'executor|sel:Internal,Eksternal|Pelaksana|r', 'vendor_code|ref:vendors|Kontraktor (eksternal)', 'mandor_no|ref:employees|Mandor / Ketua Regu (internal)', 'team|text|Anggota Regu Internal (no. karyawan, pisah koma)|h', 'unit|sel:Ha,Janjang,Kg,Ton,Pokok,Meter,Unit,HK,Lumpsum|Satuan|r', 'volume|number|Volume Kontrak|r', 'rate|number|Tarif per Satuan (Rp)|r', 'value|number|Nilai Kontrak (Rp)|ro', 'start_date|date|Mulai|r', 'end_date|date|Selesai|r', 'lc_code|ref:lc_projects|Proyek LC (opsional)', 'retention_pct|number|Retensi (%)|h', 'vol_done|number|Volume Terealisasi|ro', 'paid|number|Nilai Terbayar (Rp)|ro', 'notes|textarea|Lingkup & Spesifikasi|h'] },
  bor_ba: { g: 'bor', t: 'Berita Acara Opname Borongan', wf: 1, amt: 'net', f: ['ba_no|text|No. BA|r,u', 'ba_date|date|Tanggal|r', 'spk_no|ref:bor_spk|No. SPK|r', 'estate_code|ref:estates|Estate|r', 'period_from|date|Periode Dari', 'period_to|date|Periode Sampai', 'volume|number|Volume Diopname|r', 'qc_score|number|Nilai Mutu / QC (%)', 'audit_no|ref:audits|Hasil Audit QC (opsional)', 'deduct_pct|number|Potongan Mutu (%)', 'gross|number|Nilai Kotor (Rp)|ro', 'retention|number|Retensi (Rp)|ro', 'net|number|Nilai Dibayar (Rp)|ro', 'gps|gps|GPS|h', 'photo|photo|Foto Opname|h', 'notes|textarea|Catatan|h'] },

  // TRANSPORTASI
  vehicles: { g: 'logi', t: 'Kendaraan & Alat Berat', f: ['code|text|Kode Unit|r,u', 'plate|text|No. Polisi', 'type|sel:Dump Truck,Truk,Traktor,Excavator,Grader,Pickup,Lainnya|Jenis|r', 'estate_code|ref:estates|Estate', 'capacity_kg|number|Kapasitas (kg)', 'driver|text|Pengemudi', 'hm_km|number|HM/KM Terakhir', 'unit_status|sel:Aktif,Servis,Rusak,Afkir|Kondisi'] },
  deliveries: { g: 'logi', t: 'SPB / Pengiriman TBS', wf: 1, f: ['spb_no|text|No. SPB|r,u', 'd_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling', 'vehicle_code|ref:vehicles|Kendaraan|r', 'driver|text|Pengemudi', 'mill_code|ref:mills|PKS Tujuan|r', 'blocks|text|Asal Blok (pisah koma)', 'janjang|number|Janjang|r', 'est_kg|number|Taksasi (kg)', 'depart_time|text|Jam Berangkat', 'gps|gps|GPS|h'] },

  // PKS
  weighbridge: { g: 'mill', t: 'Timbangan & Grading', wf: 1, f: ['ticket_no|text|No. Tiket|r,u', 'w_date|date|Tanggal|r', 'mill_code|ref:mills|PKS|r', 'spb_no|ref:deliveries|No. SPB|r,u', 'estate_code|ref:estates|Estate Asal|ro', 'bruto_kg|number|Bruto (kg)|r', 'tara_kg|number|Tara (kg)|r', 'netto_kg|number|Netto (kg)|ro', 'unripe_pct|number|Mentah (%)', 'overripe_pct|number|Lewat Matang (%)', 'dirt_pct|number|Kotoran (%)', 'cut_pct|number|Potongan (%)', 'netto_final_kg|number|Netto Diterima (kg)|ro', 'input_mode|sel:Manual,Adapter Timbangan|Sumber Data'] },
  mill_prod: { g: 'mill', t: 'Produksi PKS (OER/KER)', wf: 1, f: ['p_date|date|Tanggal|r', 'mill_code|ref:mills|PKS|r', 'ffb_processed_kg|number|TBS Diolah (kg)|r', 'cpo_kg|number|Produksi CPO (kg)|r', 'kernel_kg|number|Produksi Kernel (kg)|r', 'oer|number|OER (%)|ro', 'ker|number|KER (%)|ro', 'op_hours|number|Jam Olah', 'downtime_h|number|Downtime (jam)', 'oil_loss_pct|number|Oil Losses (%)', 'ffa_pct|number|FFA CPO (%)', 'notes|textarea|Catatan|h'] },
  mill_dispatch: { g: 'mill', t: 'Dispatch Produk', wf: 1, f: ['do_no|text|No. DO|r,u', 'dp_date|date|Tanggal|r', 'mill_code|ref:mills|PKS|r', 'product|sel:CPO,Kernel,Cangkang,Fiber,Tankos|Produk|r', 'qty_kg|number|Jumlah (kg)|r', 'customer_code|ref:customers|Pembeli', 'contract_no|ref:sales_contracts|Kontrak', 'vehicle|text|Kendaraan/Tongkang'] },

  // SDM
  employees: { g: 'hr', t: 'Karyawan', f: ['emp_no|text|No. Karyawan|r,u', 'name|text|Nama|r', 'estate_code|ref:estates|Estate (kosongkan bila Head Office)', 'division_code|ref:divisions|Afdeling', 'position|sel:Pemanen,Perawatan,Mandor,Krani,Asisten,Operator,Driver,Staf,Kepala Bagian,Manajer,Direksi,Lainnya|Jabatan|r', 'job_title|text|Nama Jabatan (mis. Asisten Afdeling II)', 'gender|sel:L,P|Jenis Kelamin', 'work_cal|sel:KEBUN,HO|Kalender Kerja (KEBUN/Region = Sen-Sab, HO = Sen-Jum)', 'supervisor|ref:employees|Atasan Langsung', 'supervisor2|ref:employees|Atasan ke-2 (opsional)', 'username|text|Akun Login Aplikasi (username)|h', 'email|text|Email|h', 'emp_type|sel:SKU,PKWT,BHL,Staf|Status Kerja', 'join_date|date|Tgl Masuk|h', 'nik|text|NIK|h,s', 'phone|text|No. WhatsApp (08xx/62xx)|h,s', 'bank_acct|text|No. Rekening|h,s', 'base_wage|number|Upah Pokok/Hari|h,s', 'active|sel:Ya,Tidak|Aktif'] },
  attendance: { g: 'hr', t: 'Absensi Harian', uq: ['a_date', 'emp_no'], f: ['a_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'emp_no|ref:employees|Karyawan|r', 'att|sel:H,S,I,C,M,L|Kehadiran|r', 'activity|text|Pekerjaan', 'hk|number|HK', 'ot_hours|number|Lembur (jam)', 'gps|gps|GPS|h'] },

  // HARI LIBUR (diatur admin; dipakai perhitungan cuti per kalender kerja)
  holidays: { g: 'sys', t: 'Hari Libur Nasional & Perusahaan', uq: ['h_date', 'applies'], f: ['h_date|date|Tanggal|r', 'name|text|Keterangan|r', 'h_type|sel:Libur Nasional,Cuti Bersama,Libur Perusahaan,Libur Daerah|Jenis|r', 'applies|sel:Semua,HO,KEBUN|Berlaku Untuk|r', 'deduct|sel:Tidak,Ya|Memotong Saldo Cuti Tahunan', 'region_code|ref:regions|Region (khusus libur daerah)|h', 'notes|textarea|Catatan / Dasar Hukum|h'] },

  // GUDANG
  items: { g: 'inv', t: 'Master Barang', f: ['code|text|Kode Barang|r,u', 'name|text|Nama Barang|r', 'category|sel:Pupuk,Pestisida,Herbisida,BBM,Pelumas,Suku Cadang,APD,Material,ATK,Lainnya|Kategori|r', 'uom|text|Satuan|r', 'min_stock|number|Stok Minimum', 'price|number|Harga Standar (Rp)'] },
  warehouses: { g: 'inv', t: 'Gudang', f: ['code|text|Kode Gudang|r,u', 'name|text|Nama Gudang|r', 'estate_code|ref:estates|Estate|r', 'keeper|text|Kepala Gudang'] },
  stock_moves: { g: 'inv', t: 'Mutasi Stok', wf: 1, f: ['m_date|date|Tanggal|r', 'wh_code|ref:warehouses|Gudang|r', 'estate_code|ref:estates|Estate|r', 'item_code|ref:items|Barang|r', 'move_type|sel:IN,OUT,ADJ+,ADJ-,TRF-IN,TRF-OUT|Jenis Mutasi|r', 'qty|number|Qty|r', 'unit_cost|number|Harga Satuan', 'batch|text|Batch / Lot', 'ref_doc|text|Dokumen Referensi', 'cost_center|ref:cost_centers|Cost Center', 'block_code|ref:blocks|Blok Tujuan'] },

  // PENGADAAN
  vendors: { g: 'proc', t: 'Vendor', f: ['code|text|Kode Vendor|r,u', 'name|text|Nama Vendor|r', 'category|text|Kategori', 'phone|text|Telepon', 'npwp|text|NPWP|h', 'rating|sel:A,B,C,D|Rating'] },
  pr: { g: 'proc', t: 'Purchase Request', wf: 1, amt: 'total', f: ['pr_no|text|No. PR|r,u', 'pr_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'item_code|ref:items|Barang|r', 'qty|number|Qty|r', 'est_price|number|Estimasi Harga Satuan|r', 'total|number|Total (Rp)|ro', 'need_date|date|Tgl Dibutuhkan', 'purpose|textarea|Keperluan|h'] },
  po: { g: 'proc', t: 'Purchase Order', wf: 1, amt: 'total', f: ['po_no|text|No. PO|r,u', 'po_date|date|Tanggal|r', 'pr_no|ref:pr|No. PR', 'vendor_code|ref:vendors|Vendor|r', 'estate_code|ref:estates|Estate|r', 'item_code|ref:items|Barang|r', 'qty|number|Qty|r', 'price|number|Harga Satuan|r', 'total|number|Total (Rp)|ro', 'delivery_date|date|Tgl Kirim'] },

  // KEUANGAN
  coa: { g: 'fin', t: 'Chart of Accounts', f: ['code|text|Kode Akun|r,u', 'name|text|Nama Akun|r', 'acc_type|sel:Aset,Kewajiban,Ekuitas,Pendapatan,Beban|Tipe|r', 'normal|sel:D,K|Saldo Normal|r'] },
  cost_centers: { g: 'fin', t: 'Cost Center', f: ['code|text|Kode CC|r,u', 'name|text|Nama|r', 'estate_code|ref:estates|Estate', 'category|sel:Land Development,Nursery,Agronomy,Harvesting,Transport,Engineering,HR,General Affair,Sustainability,Mill|Kategori|r'] },
  budgets: { g: 'fin', t: 'Anggaran / RKAP', wf: 1, amt: 'amount', f: ['year|number|Tahun|r', 'estate_code|ref:estates|Estate|r', 'cost_center|ref:cost_centers|Cost Center|r', 'coa_code|ref:coa|Akun|r', 'amount|number|Nilai Anggaran (Rp)|r', 'prod_target_ton|number|Target Produksi (ton)', 'description|textarea|Uraian|h'] },
  journals: { g: 'fin', t: 'Jurnal Umum', wf: 1, amt: 'total_debit', f: ['j_no|text|No. Jurnal|r,u', 'j_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'description|text|Uraian|r', 'lines|lines|Baris Jurnal|r,h', 'total_debit|number|Total Debit|ro', 'total_credit|number|Total Kredit|ro'] },

  // ASET
  assets: { g: 'asset', t: 'Register Aset', f: ['code|text|Kode Aset|r,u', 'name|text|Nama Aset|r', 'category|sel:Kendaraan,Alat Berat,Bangunan,Jalan,Jembatan,Mesin PKS,IT,Lainnya|Kategori|r', 'estate_code|ref:estates|Estate', 'acq_date|date|Tgl Perolehan|r', 'acq_cost|number|Harga Perolehan (Rp)|r', 'life_years|number|Umur Ekonomis (th)|r', 'salvage|number|Nilai Sisa (Rp)', 'book_value|number|Nilai Buku (Rp)|ro', 'condition|sel:Baik,Perlu Perbaikan,Rusak,Dihapus|Kondisi'] },
  maintenance: { g: 'asset', t: 'Work Order Workshop', wf: 1, amt: 'cost', f: ['mt_no|text|No. WO|r,u', 'mt_date|date|Tanggal|r', 'asset_code|ref:assets|Aset|r', 'estate_code|ref:estates|Estate|r', 'mt_type|sel:Servis Rutin,Perbaikan,Overhaul,Ban|Jenis|r', 'hm_km|number|HM/KM', 'cost|number|Biaya (Rp)', 'parts|textarea|Suku Cadang|h'] },
  fuel: { g: 'asset', t: 'Konsumsi BBM', f: ['f_date|date|Tanggal|r', 'vehicle_code|ref:vehicles|Unit|r', 'estate_code|ref:estates|Estate|r', 'liters|number|Liter|r', 'hm_km|number|HM/KM', 'cost|number|Biaya (Rp)'] },

  // COMPLIANCE
  permits: { g: 'comp', t: 'Legal & Perizinan', f: ['doc_no|text|No. Dokumen|r,u', 'title|text|Judul|r', 'doc_type|sel:HGU,IUP,KKPR,AMDAL/UKL-UPL,Persetujuan Lingkungan,Sertifikat ISPO,Lainnya|Jenis|r', 'estate_code|ref:estates|Estate', 'issue_date|date|Tgl Terbit', 'expiry_date|date|Tgl Berakhir', 'issuer|text|Penerbit|h', 'file|file|Berkas|h', 'doc_state|text|Status Masa Berlaku|ro'] },
  ispo: { g: 'comp', t: 'ISPO Assessment', f: ['criteria_code|text|Kode Kriteria|r', 'principle|text|Prinsip|r', 'criteria|textarea|Kriteria / Indikator|r', 'reg_ref|text|Acuan Regulasi', 'estate_code|ref:estates|Estate|r', 'compliance|sel:Terpenuhi,Sebagian,Belum,N/A|Pemenuhan|r', 'evidence|file|Bukti|h', 'owner|text|PIC', 'due_date|date|Target'] },
  // AUDIT & INSPEKSI
  aud_templates: { g: 'aud', t: 'Template Checklist Audit', f: ['code|text|Kode Template|r,u', 'name|text|Nama Template|r', 'category|sel:Lapangan - Panen,Lapangan - Perawatan,Lapangan - Pemupukan,Lapangan - Infrastruktur,Pembibitan,Land Clearing,Borongan / QC Kontraktor,Administrasi Kantor,Gudang & Stock Opname,Keuangan & Kas,K3/HSE,ISPO/RSPO,Lainnya|Kategori|r', 'scoring|sel:Ya/Tidak,Skala 1-5|Metode Penilaian|r', 'pass_score|number|Nilai Lulus (%)', 'items|textarea|Butir Pemeriksaan (1 baris = 1 butir: Pertanyaan | bobot | KRITIS)|r'] },
  audits: { g: 'aud', t: 'Pelaksanaan Audit', wf: 1, f: ['audit_no|text|No. Audit|r,u', 'audit_date|date|Tanggal|r', 'template_code|ref:aud_templates|Template|r', 'category|text|Kategori|ro', 'estate_code|ref:estates|Estate|r', 'division_code|ref:divisions|Afdeling', 'block_code|ref:blocks|Blok / Lokasi', 'target_ref|text|Objek (No. SPK / Gudang / Dokumen)', 'auditor|text|Auditor|r', 'auditee|text|Auditee / PIC Unit', 'pic_user|text|Akun PIC Tindak Lanjut (username)|h', 'score|number|Nilai (%)|ro', 'result|text|Hasil|ro', 'findings_n|number|Jumlah Temuan|ro', 'answers|json|Jawaban Checklist|h', 'gps|gps|GPS|h', 'photo|photo|Foto Utama|h', 'summary|textarea|Ringkasan / Kesimpulan|h'] },
  findings: { g: 'aud', t: 'Temuan Audit & CAPA', wf: 1, f: ['f_no|text|No. Temuan|r,u', 'f_date|date|Tanggal|r', 'source|sel:Audit Internal,Audit Eksternal,Audit Lapangan,Audit Administrasi,ISPO,K3,Inspeksi Region|Sumber|r', 'estate_code|ref:estates|Estate|r', 'audit_no|ref:audits|No. Audit|h', 'block_code|ref:blocks|Blok / Lokasi|h', 'finding|textarea|Temuan|r', 'risk|sel:Rendah,Sedang,Tinggi,Kritis|Risiko|r', 'capa|textarea|Tindakan Korektif|h', 'pic|text|PIC', 'pic_user|text|Akun PIC (username)|h', 'due_date|date|Batas Waktu', 'close_status|sel:Open,In Progress,Closed|Status Tindak Lanjut', 'evidence|photo|Foto Bukti Perbaikan|h', 'closed_date|date|Tanggal Ditutup|h'] },
  k3: { g: 'comp', t: 'K3, Kebakaran & Lingkungan', wf: 1, f: ['inc_date|date|Tanggal|r', 'estate_code|ref:estates|Estate|r', 'inc_type|sel:Kecelakaan Kerja,Near Miss,Kebakaran,Titik Api,Pencemaran,Inspeksi APD|Jenis|r', 'severity|sel:Ringan,Sedang,Berat,Fatal|Tingkat|r', 'description|textarea|Uraian|r', 'action|textarea|Tindakan|h', 'gps|gps|GPS|h', 'photo|photo|Foto|h'] },

  // DMS
  documents: { g: 'docs', t: 'Arsip & Persuratan', wf: 1, f: ['doc_no|text|No. Dokumen|r,u', 'd_date|date|Tanggal|r', 'doc_type|sel:Surat Masuk,Surat Keluar,Memo Internal,SK,SPK,Kontrak,SOP,Berita Acara,Lainnya|Jenis|r', 'title|text|Perihal|r', 'estate_code|ref:estates|Unit', 'from_to|text|Dari / Kepada', 'doc_version|text|Versi', 'confidentiality|sel:Publik,Internal,Rahasia|Klasifikasi', 'retention_years|number|Retensi (th)|h', 'file|file|Berkas|h'] },

  // KOMERSIAL
  customers: { g: 'comm', t: 'Pelanggan', f: ['code|text|Kode|r,u', 'name|text|Nama|r', 'npwp|text|NPWP|h', 'address|textarea|Alamat|h'] },
  sales_contracts: { g: 'comm', t: 'Kontrak Penjualan', wf: 1, amt: 'total', f: ['contract_no|text|No. Kontrak|r,u', 'c_date|date|Tanggal|r', 'customer_code|ref:customers|Pelanggan|r', 'product|sel:CPO,Kernel,TBS,Cangkang|Produk|r', 'qty_kg|number|Volume (kg)|r', 'price_kg|number|Harga/kg (Rp)|r', 'total|number|Nilai (Rp)|ro', 'period_end|date|Akhir Periode'] },
  invoices: { g: 'comm', t: 'Invoice & Piutang', wf: 1, amt: 'grand_total', f: ['inv_no|text|No. Invoice|r,u', 'inv_date|date|Tanggal|r', 'customer_code|ref:customers|Pelanggan|r', 'contract_no|ref:sales_contracts|Kontrak', 'qty_kg|number|Volume (kg)|r', 'price_kg|number|Harga/kg|r', 'total|number|DPP (Rp)|ro', 'ppn_pct|number|PPN (%)', 'grand_total|number|Total Tagihan (Rp)|ro', 'paid|sel:Belum,Sebagian,Lunas|Pembayaran', 'due_date|date|Jatuh Tempo'] }
};

/** Peran minimum sesuai master prompt. Huruf: V lihat, E input/ubah, P verifikasi/setujui, D hapus, A admin */
var ROLES = {
  SUPER_ADMIN: { t: 'Super Administrator', all: 'VEPDA' },
  DIRECTOR: { t: 'Director', all: 'VP' },
  CORP_ADMIN: { t: 'Corporate Administrator', all: 'VE', org: 'VED', docs: 'VED' },
  REG_MANAGER: { t: 'Regional Manager', all: 'V', nur: 'VEP', lc: 'VEP', bor: 'VEP', aud: 'VEP', plant: 'VEP', agro: 'VEP', harv: 'VEP', logi: 'VEP', comp: 'VEP', proc: 'VP', fin: 'V' },
  REG_CONTROLLER: { t: 'Regional Controller', all: 'V', bor: 'VP', aud: 'VEP', fin: 'VEP', proc: 'VP', inv: 'VP', comp: 'VE' },
  ESTATE_MANAGER: { t: 'Estate Manager', all: 'V', nur: 'VEP', lc: 'VEP', bor: 'VEP', aud: 'VEP', plant: 'VEP', agro: 'VEP', harv: 'VEP', logi: 'VEP', inv: 'VEP', hr: 'VEP', asset: 'VEP', comp: 'VEP', docs: 'VEP', proc: 'VEP' },
  ASST_MANAGER: { t: 'Assistant Manager (Askep)', all: 'V', nur: 'VEP', lc: 'VEP', bor: 'VEP', aud: 'VE', plant: 'VEP', agro: 'VEP', harv: 'VEP', logi: 'VE' },
  KTU: { t: 'Chief Clerk / KTU', all: 'V', bor: 'VE', aud: 'VE', inv: 'VEP', proc: 'VE', hr: 'VE', docs: 'VE', fin: 'VE' },
  ASST_AFD: { t: 'Asisten Afdeling', all: 'V', nur: 'VEP', lc: 'VE', bor: 'VE', aud: 'VE', plant: 'VE', agro: 'VEP', harv: 'VEP', logi: 'VE', hr: 'VE' },
  MANDOR: { t: 'Foreman / Mandor', all: 'V', nur: 'VE', lc: 'VE', bor: 'VE', agro: 'VE', harv: 'VE', hr: 'VE', fin: '', comm: '' },
  KRANI: { t: 'Clerk / Krani', all: 'V', nur: 'VE', lc: 'VE', bor: 'VE', harv: 'VE', logi: 'VE', agro: 'VE', hr: 'VE', fin: '', comm: '' },
  WAREHOUSE: { t: 'Warehouse Officer', all: 'V', aud: 'V', inv: 'VE', fin: '' },
  HR_OFFICER: { t: 'HR Officer', all: 'V', hr: 'VEP', fin: '' },
  FIN_OFFICER: { t: 'Finance Officer', all: 'V', bor: 'V', fin: 'VE', comm: 'VE' },
  PROC_OFFICER: { t: 'Procurement Officer', all: 'V', proc: 'VE', inv: 'V', fin: '' },
  MILL_MANAGER: { t: 'Mill Manager', all: 'V', mill: 'VEP', logi: 'VP', comm: 'VE' },
  MILL_OPERATOR: { t: 'Mill Operator', all: 'V', mill: 'VE', fin: '', hr: '' },
  AUDITOR: { t: 'Internal Auditor', all: 'V', comp: 'VE', aud: 'VEP' },
  FIELD_WORKER: { t: 'Field Worker', all: '', dash: 'V', harv: 'V', gis: 'V', qr: 'V' }
};

var WF = { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', VERIFIED: 'VERIFIED', APPROVED: 'APPROVED', POSTED: 'POSTED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED', ACTIVE: 'ACTIVE' };

/** Batas persetujuan default (Rp). Dapat diubah di Pengaturan. */
var DEFAULT_SETTINGS = {
  app_title: 'PALM OS Enterprise',
  app_subtitle: 'Integrated Plantation Management',
  logo: '',
  theme: { preset: 'sawit', primary: '#0f6b4b', accent: '#c8962e', mode: 'light', radius: 14, font: 'Inter' },
  approval_limits: { ESTATE_MANAGER: 50000000, REG_MANAGER: 250000000, REG_CONTROLLER: 250000000, MILL_MANAGER: 100000000, DIRECTOR: -1, SUPER_ADMIN: -1, ASST_MANAGER: 10000000, ASST_AFD: 5000000, KTU: 10000000, HR_OFFICER: 10000000 },
  lsu_std: { n: [2.4, 2.8], p: [0.15, 0.18], k: [0.9, 1.2], mg: [0.25, 0.4], b: [15, 25] },
  premi: { basis_kg: 1000, rate_over: 40, rate_brondolan: 150 },
  strict_sod: true,
  ai_enabled: false,
  /* Operasional baru */
  ops: { lc_weights: {}, nur_update_palms: true, bor_qc: [[90, 0], [80, 5], [70, 10], [0, 20]], bor_coa: { expense_ext: '5101', payable_ext: '2101', retention: '2101', expense_int: '5101', payable_int: '2101' }, tph_default: 20 },
  /* Kalender kerja: 0=Minggu ... 6=Sabtu */
  work_calendars: { KEBUN: { t: 'Kebun / Region (Senin-Sabtu)', days: [1, 2, 3, 4, 5, 6] }, HO: { t: 'Head Office (Senin-Jumat)', days: [1, 2, 3, 4, 5] } },
  /* Jenis cuti. q = kuota (hari, 0 = tanpa batas), u = kerja|kalender, ded = memotong saldo tahunan, g = khusus L/P, att = wajib lampiran, min = minimal masa kerja (bulan) */
  leave_types: [
    { c: 'CT', t: 'Cuti Tahunan', q: 12, u: 'kerja', ded: 1, min: 12, yearly: 1 },
    { c: 'CM', t: 'Cuti Melahirkan', q: 90, u: 'kalender', g: 'P', att: 1 },
    { c: 'CK', t: 'Cuti Keguguran', q: 45, u: 'kalender', g: 'P', att: 1 },
    { c: 'CHD', t: 'Cuti Haid', q: 2, u: 'kerja', g: 'P' },
    { c: 'CN', t: 'Cuti Menikah', q: 3, u: 'kerja', att: 1 },
    { c: 'CNA', t: 'Menikahkan Anak', q: 2, u: 'kerja' },
    { c: 'CKA', t: 'Khitanan / Baptis Anak', q: 2, u: 'kerja' },
    { c: 'CIM', t: 'Istri Melahirkan / Keguguran', q: 2, u: 'kerja', g: 'L' },
    { c: 'CD', t: 'Duka (Suami/Istri/Orang Tua/Mertua/Anak/Menantu)', q: 2, u: 'kerja' },
    { c: 'CDS', t: 'Duka (Anggota Keluarga Serumah)', q: 1, u: 'kerja' },
    { c: 'CS', t: 'Sakit dengan Surat Dokter', q: 0, u: 'kerja', att: 1 },
    { c: 'CL', t: 'Cuti Lapangan (Staf Kebun)', q: 12, u: 'kerja', yearly: 1 },
    { c: 'CB', t: 'Cuti Besar / Panjang', q: 30, u: 'kerja', min: 72 },
    { c: 'CHJ', t: 'Ibadah Haji / Umrah', q: 40, u: 'kalender', att: 1 },
    { c: 'CTB', t: 'Cuti di Luar Tanggungan (Tidak Dibayar)', q: 0, u: 'kerja' },
    { c: 'CP', t: 'Cuti Pengganti / Cuti Khusus (kompensasi dinas & kerja hari libur)', q: 0, u: 'kerja', comp: 1 }
  ],
  /* Rute persetujuan per jenis workflow (urutan langkah). SPV1 = atasan langsung, SPV2? = atasan ke-2 bila diisi,
     HR/FIN/PROC/WH/GA/DIR = pihak terkait sesuai role & scope, LIMIT = pejabat sesuai batas nilai, akhiran $ = hanya bila ada nilai uang */
  wf_routes: {},
  wf_conf: { token_hours: 72, sla_hours: 24, email: true, wa_mode: 'link', wa_gateway_url: '', wa_gateway_token: '', base_url: '', sppd_cats: ['Tiket / Transport', 'Hotel / Penginapan', 'Uang Makan', 'Uang Saku Harian', 'Transport Lokal', 'Lainnya'], sppd_daily: { Staf: 250000, Asisten: 350000, Manajer: 500000, Direksi: 750000 },
    /* Persetujuan Keuangan untuk pengajuan bernilai uang: true = tambah langkah Keuangan bila nilai > fin_min, false = tanpa Keuangan */
    fin_types: { SPPD: true, DEKLARASI: true, KASBON: true, PENGADAAN: true, KLAIM: true, BAYARCP: true, BON: false }, fin_min: 0,
    /* Kebijakan cuti pengganti (kompensasi): tiap sppd_per_days hari dinas = sppd_earn hari; kerja di hari libur x holiday_ratio; kedaluwarsa expiry_days;
       sisa dapat dicairkan: pay_mode 'tetap' (pay_rate per golongan) atau 'gaji' (upah harian x pay_pct %) */
    comp: { sppd_per_days: 30, sppd_earn: 2, holiday_ratio: 1, expiry_days: 90, max_days: 0, pay_mode: 'tetap', pay_rate: { Staf: 150000, Asisten: 250000, Manajer: 400000, Direksi: 600000 }, pay_pct: 100, max_pay_days: 0 } }
};

var _schemaMemo = null;
/** Ubah DSL menjadi objek field. */
function getSchema_() {
  if (_schemaMemo) return _schemaMemo;
  var out = {};
  Object.keys(MODULES).forEach(function (k) {
    var m = MODULES[k];
    var fields = m.f.map(function (s) {
      var p = s.split('|'), ty = p[1], flags = (p[3] || '').split(','), o = { key: p[0], label: p[2], type: ty };
      if (ty.indexOf('sel:') === 0) { o.type = 'sel'; o.options = ty.substr(4).split(','); }
      if (ty.indexOf('ref:') === 0) { o.type = 'ref'; o.ref = ty.substr(4); }
      o.req = flags.indexOf('r') > -1; o.uniq = flags.indexOf('u') > -1; o.ro = flags.indexOf('ro') > -1;
      o.hidden = flags.indexOf('h') > -1; o.sens = flags.indexOf('s') > -1;
      o.big = ['geo', 'photo', 'file', 'lines', 'textarea', 'json'].indexOf(o.type) > -1;
      return o;
    });
    var scope = m.sc || (fields.some(function (f) { return f.key === 'estate_code'; }) ? 'estate_code' : null);
    out[k] = { key: k, g: m.g, t: m.t, wf: !!m.wf, amt: m.amt || null, uq: m.uq || null, scope: scope, sheet: 'M_' + k, fields: fields };
  });
  _schemaMemo = out;
  return out;
}


/* ===== Data.gs ===== */
/**
 * PALM OS ENTERPRISE — Data.gs
 * Lapisan penyimpanan Google Sheets: cache, chunking >45.000 karakter, CRUD generik,
 * validasi, idempotensi, scope organisasi, audit trail, workflow & SoD, monitor 10 juta sel.
 */
var _memo = {};

function ss_() {
  if (_memo.ss) return _memo.ss;
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  _memo.ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _memo.ss;
}

function now_() { return new Date().toISOString(); }
function uid_() { return Utilities.getUuid(); }
function err_(msg, code) { var e = new Error(msg); e.code = code || 'ERR'; return e; }

/** Ambil / buat sheet dan pastikan header (migrasi kolom baru otomatis). */
function sh_(name, headers) {
  var ss = ss_(), s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    if (headers && headers.length) {
      s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0f6b4b').setFontColor('#ffffff');
      s.setFrozenRows(1);
      // hemat sel: buang kolom kosong bawaan (26 kolom) agar kuota 10 juta sel tidak terbuang
      var extra = s.getMaxColumns() - headers.length;
      if (extra > 0) s.deleteColumns(headers.length + 1, extra);
      if (s.getMaxRows() > 200) s.deleteRows(201, s.getMaxRows() - 200);
    }
    return s;
  }
  if (headers && headers.length) {
    var lc = s.getLastColumn();
    var cur = lc ? s.getRange(1, 1, 1, lc).getValues()[0] : [];
    var miss = headers.filter(function (h) { return cur.indexOf(h) < 0; });
    if (miss.length) {
      if (s.getMaxColumns() < cur.length + miss.length) s.insertColumnsAfter(Math.max(1, s.getMaxColumns()), cur.length + miss.length - s.getMaxColumns());
      s.getRange(1, cur.length + 1, 1, miss.length).setValues([miss]).setFontWeight('bold');
    }
  }
  return s;
}

function modHeaders_(sc) { return SYS_COLS.concat(sc.fields.map(function (f) { return f.key; })); }

/* ---------------- CACHE (CacheService, dipecah 90KB) ---------------- */
function cacheVer_(name) {
  var c = CacheService.getScriptCache(), v = c.get('V:' + name);
  if (!v) { v = Date.now().toString(36) + Utilities.getUuid().substr(0, 8); c.put('V:' + name, v, 21600); } // unik: cegah tabrakan versi pada milidetik sama
  return v;
}
function cacheGetTable_(name) {
  try {
    var c = CacheService.getScriptCache(), v = cacheVer_(name), n = c.get('T:' + name + ':' + v + ':n');
    if (!n) return null;
    var keys = []; for (var i = 0; i < Number(n); i++) keys.push('T:' + name + ':' + v + ':' + i);
    var got = c.getAll(keys), s = '';
    for (var j = 0; j < keys.length; j++) { if (got[keys[j]] == null) return null; s += got[keys[j]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function cachePutTable_(name, obj) {
  try {
    var s = JSON.stringify(obj); if (s.length > 4000000) return;
    var c = CacheService.getScriptCache(), v = cacheVer_(name), map = {}, n = 0;
    for (var i = 0; i < s.length; i += 90000) { map['T:' + name + ':' + v + ':' + n] = s.substr(i, 90000); n++; }
    map['T:' + name + ':' + v + ':n'] = String(n);
    c.putAll(map, 21600);
  } catch (e) { /* cache opsional */ }
}
function invalidate_(name) {
  delete _memo['t:' + name];
  try { CacheService.getScriptCache().remove('V:' + name); } catch (e) { }
}

/** Baca tabel menjadi array objek (memo per eksekusi + cache lintas eksekusi). */
function table_(name) {
  var mk = 't:' + name;
  if (_memo[mk]) return _memo[mk];
  var cached = cacheGetTable_(name);
  if (cached) { _memo[mk] = cached; return cached; }
  var s = ss_().getSheetByName(name), out = { h: [], rows: [] };
  if (s && s.getLastRow() >= 1) {
    var v = s.getRange(1, 1, s.getLastRow(), Math.max(1, s.getLastColumn())).getValues();
    out.h = v.shift().map(String);
    out.rows = v.map(function (r, i) {
      var o = { _row: i + 2 };
      for (var j = 0; j < out.h.length; j++) { if (out.h[j]) o[out.h[j]] = cellOut_(r[j]); }
      return o;
    }).filter(function (o) {
      var k = out.h.indexOf('id') > -1 ? 'id' : out.h[0]; // _Chunks memakai chunk_id
      return o[k] !== '' && o[k] != null;
    });
  }
  _memo[mk] = out;
  cachePutTable_(name, out);
  return out;
}

function cellOut_(x) {
  if (x instanceof Date) {
    var t = Utilities.formatDate(x, APP.TZ, 'HH:mm:ss');
    return t === '00:00:00' ? Utilities.formatDate(x, APP.TZ, 'yyyy-MM-dd') : x.toISOString();
  }
  return x;
}

/** Cegah formula injection & pecah nilai panjang ke sheet _Chunks. */
function cellIn_(v, owner) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  if (typeof v === 'string') {
    if (v.length > APP.CHUNK) return chunkPut_(v, owner);
    if (/^[=+@]/.test(v) || /^-[^0-9.]/.test(v)) return "'" + v;
  }
  return v;
}

function chunkPut_(str, owner) {
  var s = sh_(SYS.CHUNK, ['chunk_id', 'seq', 'data', 'owner', 'created_at']), id = uid_(), rows = [], n = 0;
  for (var i = 0; i < str.length; i += APP.CHUNK) { rows.push([id, n, str.substr(i, APP.CHUNK), owner || '', now_()]); n++; }
  s.getRange(s.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  invalidate_(SYS.CHUNK);
  return '@@CHUNK:' + id + ':' + n;
}

function chunkGet_(ptr) {
  if (typeof ptr !== 'string' || ptr.indexOf('@@CHUNK:') !== 0) return ptr;
  var id = ptr.split(':')[1], parts = table_(SYS.CHUNK).rows.filter(function (r) { return r.chunk_id === id; });
  parts.sort(function (a, b) { return Number(a.seq) - Number(b.seq); });
  return parts.map(function (r) { return String(r.data); }).join('');
}

function chunkDelete_(ptr) {
  if (typeof ptr !== 'string' || ptr.indexOf('@@CHUNK:') !== 0) return;
  var id = ptr.split(':')[1], s = ss_().getSheetByName(SYS.CHUNK); if (!s) return;
  var rows = table_(SYS.CHUNK).rows.filter(function (r) { return r.chunk_id === id; }).map(function (r) { return r._row; });
  rows.sort(function (a, b) { return b - a; }).forEach(function (r) { s.deleteRow(r); });
  invalidate_(SYS.CHUNK);
}

function appendObj_(name, headers, obj) {
  var s = sh_(name, headers), h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  var row = h.map(function (k) { return cellIn_(obj[k], name + ':' + obj.id + ':' + k); });
  s.getRange(s.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  invalidate_(name);
}

function updateObj_(name, rowNum, obj) {
  var s = ss_().getSheetByName(name), h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  var row = h.map(function (k) { return cellIn_(obj[k], name + ':' + obj.id + ':' + k); });
  s.getRange(rowNum, 1, 1, row.length).setValues([row]);
  invalidate_(name);
}

/* ---------------- AUDIT ---------------- */
function audit_(ctx, action, mod, id, before, after) {
  try {
    var b = before ? JSON.stringify(stripBig_(before)) : '', a = after ? JSON.stringify(stripBig_(after)) : '';
    appendObj_(SYS.AUDIT, ['id', 'ts', 'user', 'role', 'action', 'module', 'rec_id', 'before', 'after', 'device'], {
      id: uid_(), ts: now_(), user: ctx ? ctx.user.username : 'system', role: ctx ? ctx.user.role : '-',
      action: action, module: mod, rec_id: id || '', before: b.substr(0, 40000), after: a.substr(0, 40000), device: ctx ? ctx.device || '' : ''
    });
  } catch (e) { console.error('audit gagal: ' + e); }
}
function stripBig_(o) {
  var c = {}; Object.keys(o).forEach(function (k) { if (k === '_row') return; var v = o[k]; c[k] = (typeof v === 'string' && v.length > 300) ? v.substr(0, 60) + '…[' + v.length + ' chr]' : v; });
  return c;
}

/* ---------------- HELPER SKEMA ---------------- */
function sc_(mod) { var s = getSchema_()[mod]; if (!s) throw err_('Modul tidak dikenal: ' + mod, 'NOMOD'); return s; }
function refKey_(mod) { var s = sc_(mod), f = s.fields.filter(function (x) { return x.uniq; })[0]; return f ? f.key : 'id'; }
function labelKey_(mod) {
  var s = sc_(mod), names = ['name', 'title', 'description', 'activity', 'plate'];
  for (var i = 0; i < names.length; i++) if (s.fields.some(function (f) { return f.key === names[i]; })) return names[i];
  return null;
}
function rowsOf_(mod) {
  return table_(sc_(mod).sheet).rows.filter(function (r) { return !isDel_(r); });
}
function isDel_(r) { return r.deleted === true || String(r.deleted).toUpperCase() === 'TRUE'; }
function findBy_(mod, key, val) {
  // indeks per permintaan (dibuang otomatis saat tabel berubah karena objek tabel diganti)
  var t = table_(sc_(mod).sheet), ix = t._ix || (t._ix = {});
  if (!ix[key]) { var m = {}; t.rows.forEach(function (r) { if (isDel_(r)) return; var k = String(r[key]); if (!(k in m)) m[k] = r; }); ix[key] = m; }
  return ix[key][String(val)] || null;
}
function num_(v) { if (v === '' || v === null || v === undefined) return ''; var n = Number(String(v).replace(/,/g, '.')); return isNaN(n) ? NaN : n; }

/** Apakah baris berada dalam scope organisasi user. */
function inScope_(ctx, sc, r) {
  if (!sc.scope || !ctx.estates) return true;
  var e = String(r[sc.scope] || '');
  if (!e) return true; // master non-estate (misal kendaraan pool HO)
  if (!ctx.estates[e]) return false;
  if (ctx.divisions && r.division_code && !ctx.divisions[String(r.division_code)]) return false;
  return true;
}

/** Data pribadi/gaji hanya utuh untuk role berwenang (UU PDP: minimisasi data). */
var SENS_ROLES = ['SUPER_ADMIN', 'HR_OFFICER', 'KTU', 'ESTATE_MANAGER'];
function maskSens_(ctx, sc, r) {
  if (SENS_ROLES.indexOf(ctx.user.role) > -1 && perm_(ctx, 'hr', 'V')) return r;
  var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
  sc.fields.forEach(function (f) { if (f.sens && o[f.key] !== '' && o[f.key] != null) { var s = String(o[f.key]); o[f.key] = '••••' + s.substr(-2); } });
  return o;
}

/* ---------------- API: LIST / GET ---------------- */
function apiList(ctx, p) {
  var sc = sc_(p.mod); need_(ctx, sc.g, 'V');
  var rows = rowsOf_(p.mod).filter(function (r) { return inScope_(ctx, sc, r); });
  var f = p.filters || {};
  Object.keys(f).forEach(function (k) {
    if (f[k] === '' || f[k] == null) return;
    if (k === '_from') rows = rows.filter(function (r) { return dateOf_(sc, r) >= f[k]; });
    else if (k === '_to') rows = rows.filter(function (r) { return dateOf_(sc, r) <= f[k]; });
    else rows = rows.filter(function (r) { return String(r[k]) === String(f[k]); });
  });
  if (p.q) {
    var q = String(p.q).toLowerCase();
    rows = rows.filter(function (r) { return sc.fields.some(function (fl) { return !fl.big && String(r[fl.key]).toLowerCase().indexOf(q) > -1; }) || String(r.status).toLowerCase().indexOf(q) > -1; });
  }
  var sortK = p.sort || 'updated_at', dir = p.dir === 'asc' ? 1 : -1;
  rows.sort(function (a, b) { var x = a[sortK], y = b[sortK]; if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir; return String(x).localeCompare(String(y)) * dir; });
  var total = rows.length, size = Math.min(Number(p.size) || 50, 1000), page = Math.max(1, Number(p.page) || 1);
  var slice = rows.slice((page - 1) * size, page * size).map(function (r) {
    var o = maskSens_(ctx, sc, r);
    var c = {}; Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (typeof v === 'string' && (v.indexOf('@@CHUNK:') === 0 || v.length > 2000)) v = p.full ? chunkGet_(v) : '[[BIG]]';
      c[k] = v;
    });
    return c;
  });
  return { rows: slice, total: total, page: page, size: size };
}

function dateOf_(sc, r) {
  var df = sc.fields.filter(function (f) { return f.type === 'date'; })[0];
  return String(df ? r[df.key] : r.created_at).substr(0, 10);
}

function apiGet(ctx, p) {
  var sc = sc_(p.mod); need_(ctx, sc.g, 'V');
  var r = findBy_(p.mod, 'id', p.id); if (!r) throw err_('Data tidak ditemukan', 'NOTFOUND');
  if (!inScope_(ctx, sc, r)) throw err_('Di luar kewenangan organisasi Anda', 'SCOPE');
  var o = {}; Object.keys(r).forEach(function (k) { o[k] = chunkGet_(r[k]); });
  o = maskSens_(ctx, sc, o);
  var hist = table_(SYS.APPR).rows.filter(function (a) { return a.rec_id === p.id; }).map(function (a) { return { ts: a.ts, action: a.action, user: a.user, comment: a.comment, to: a.to_status }; });
  var aud = table_(SYS.AUDIT).rows.filter(function (a) { return a.rec_id === p.id; }).slice(-15).map(function (a) { return { ts: a.ts, user: a.user, action: a.action }; });
  return { rec: o, approvals: hist, audit: aud };
}

/* ---------------- API: SAVE ---------------- */
function apiSave(ctx, p) {
  var sc = sc_(p.mod); need_(ctx, sc.g, 'E'); licenseGuardWrite_(ctx, sc);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return saveCore_(ctx, sc, p.rec || {}); } finally { lock.releaseLock(); }
}

function saveCore_(ctx, sc, input) {
  var mod = sc.key, existing = input.id ? findBy_(mod, 'id', input.id) : null;
  // IDEMPOTENSI: data offline yang dikirim ulang dengan id sama tidak diduplikasi
  if (existing && input._new) return { rec: existing, duplicate: true };
  if (existing) {
    if (!inScope_(ctx, sc, existing)) throw err_('Di luar kewenangan organisasi Anda', 'SCOPE');
    if (sc.wf && [WF.DRAFT, WF.REJECTED].indexOf(existing.status) < 0) throw err_('Data berstatus ' + existing.status + ' terkunci. Gunakan pembatalan/koreksi.', 'LOCKED');
    if (input.version && Number(input.version) < Number(existing.version)) {
      var e = err_('Konflik: data sudah diubah pengguna lain (versi server ' + existing.version + ').', 'CONFLICT'); e.server = existing; throw e;
    }
  }
  var rec = {};
  if (existing) Object.keys(existing).forEach(function (k) { rec[k] = existing[k]; });
  sc.fields.forEach(function (f) {
    if (f.ro) return;
    if (!(f.key in input)) return;
    var v = input[f.key];
    if (f.sens && typeof v === 'string' && v.indexOf('••••') === 0) return; // nilai masked tidak menimpa
    if (v === '[[BIG]]') return;
    if (f.type === 'number') { v = num_(v); if (typeof v === 'number' && isNaN(v)) throw err_(f.label + ' harus berupa angka', 'VALID'); }
    else if (f.type === 'date') { v = String(v || '').substr(0, 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err_(f.label + ' format tanggal tidak valid (YYYY-MM-DD)', 'VALID'); }
    else if (f.type === 'sel') { if (v && f.options.indexOf(String(v)) < 0) throw err_(f.label + ': pilihan "' + v + '" tidak valid', 'VALID'); }
    else if (f.type === 'photo' || f.type === 'file') { v = storeFile_(v, mod + '_' + f.key); }
    else if (f.type === 'lines' || f.type === 'geo' || f.type === 'gps' || f.type === 'json') { if (v && typeof v !== 'string') v = JSON.stringify(v); }
    else if (typeof v === 'string') v = v.trim();
    rec[f.key] = v;
  });
  // Business rules (hitung field ro, validasi lintas modul)
  var hb = HOOKS.before[mod] || (typeof OPS_HOOKS !== 'undefined' ? OPS_HOOKS.before[mod] : null); if (hb) hb(rec, ctx, existing);
  // Wajib
  sc.fields.forEach(function (f) { if (f.req && (rec[f.key] === '' || rec[f.key] == null)) throw err_(f.label + ' wajib diisi', 'VALID'); });
  // Referensi
  sc.fields.forEach(function (f) {
    if (f.type !== 'ref' || rec[f.key] === '' || rec[f.key] == null) return;
    if (!findBy_(f.ref, refKey_(f.ref), rec[f.key])) throw err_(f.label + ' "' + rec[f.key] + '" tidak terdaftar di ' + sc_(f.ref).t, 'REF');
  });
  // Scope
  if (!inScope_(ctx, sc, rec)) throw err_('Anda tidak berwenang menginput data untuk ' + rec[sc.scope], 'SCOPE');
  // Unik
  var all = rowsOf_(mod), selfId = rec.id;
  sc.fields.forEach(function (f) {
    if (!f.uniq || rec[f.key] === '') return;
    var dup = all.filter(function (r) { return r.id !== selfId && String(r[f.key]).toLowerCase() === String(rec[f.key]).toLowerCase() && r.status !== WF.CANCELLED; })[0];
    if (dup) throw err_(f.label + ' "' + rec[f.key] + '" sudah digunakan', 'DUP');
  });
  if (sc.uq) {
    var dup2 = all.filter(function (r) { return r.id !== selfId && r.status !== WF.CANCELLED && sc.uq.every(function (k) { return String(r[k]) === String(rec[k]); }); })[0];
    if (dup2) throw err_('Duplikat: kombinasi ' + sc.uq.join(' + ') + ' sudah tercatat', 'DUP');
  }
  licenseGuardCount_(ctx, sc, existing);
  var ts = now_();
  if (existing) {
    rec.version = Number(existing.version || 1) + 1; rec.updated_at = ts; rec.updated_by = ctx.user.username;
    if (sc.wf && existing.status === WF.REJECTED) rec.status = WF.DRAFT;
    Object.keys(existing).forEach(function (k) { if (rec[k] !== existing[k] && typeof existing[k] === 'string' && existing[k].indexOf('@@CHUNK:') === 0) chunkDelete_(existing[k]); });
    updateObj_(sc.sheet, existing._row, rec);
    audit_(ctx, 'UPDATE', mod, rec.id, existing, rec);
  } else {
    rec.id = input.id || uid_(); rec.status = sc.wf ? WF.DRAFT : WF.ACTIVE; rec.version = 1; rec.deleted = false;
    rec.created_at = ts; rec.created_by = ctx.user.username; rec.updated_at = ts; rec.updated_by = ctx.user.username; rec.device = input._device || ctx.device || '';
    appendObj_(sc.sheet, modHeaders_(sc), rec);
    audit_(ctx, 'CREATE', mod, rec.id, null, rec);
  }
  delete rec._row;
  return { rec: rec };
}

/** Simpan data URL foto/berkas ke Google Drive; fallback ke chunk bila Drive tidak tersedia. */
function storeFile_(v, prefix) {
  if (typeof v !== 'string' || v.indexOf('data:') !== 0) return v;
  try {
    var m = v.match(/^data:([^;]+);base64,(.*)$/); if (!m) return v;
    var folder = driveFolder_(), ext = (m[1].split('/')[1] || 'bin').replace('jpeg', 'jpg');
    var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], prefix + '_' + Date.now() + '.' + ext);
    var file = folder.createFile(blob);
    return JSON.stringify({ id: file.getId(), url: 'https://drive.google.com/uc?export=view&id=' + file.getId(), name: file.getName(), mime: m[1] });
  } catch (e) {
    return v; // akan otomatis di-chunk oleh cellIn_ bila > 45.000 karakter
  }
}
function driveFolder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('DRIVE_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var f = DriveApp.createFolder('PALM OS Enterprise — Lampiran'); p.setProperty('DRIVE_FOLDER', f.getId()); return f;
}

/* ---------------- API: DELETE (soft) ---------------- */
function apiRemove(ctx, p) {
  var sc = sc_(p.mod), r = findBy_(p.mod, 'id', p.id);
  if (!r) throw err_('Data tidak ditemukan', 'NOTFOUND');
  if (!inScope_(ctx, sc, r)) throw err_('Di luar kewenangan', 'SCOPE');
  var own = r.created_by === ctx.user.username && (r.status === WF.DRAFT || r.status === WF.ACTIVE);
  if (!perm_(ctx, sc.g, 'D') && !(own && perm_(ctx, sc.g, 'E'))) throw err_('Tidak memiliki hak hapus', 'PERM');
  if (sc.wf && [WF.APPROVED, WF.POSTED].indexOf(r.status) > -1) throw err_('Transaksi yang sudah disetujui/diposting tidak boleh dihapus. Gunakan pembatalan.', 'LOCKED');
  if (!p.reason) throw err_('Alasan penghapusan wajib diisi', 'VALID');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var rec = {}; Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
    rec.deleted = true; rec.updated_at = now_(); rec.updated_by = ctx.user.username; rec.version = Number(r.version || 1) + 1;
    updateObj_(sc.sheet, r._row, rec);
    audit_(ctx, 'DELETE:' + p.reason, p.mod, r.id, r, null);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ---------------- WORKFLOW + SEPARATION OF DUTIES ---------------- */
// Literal string: Apps Script memuat berkas .gs berurutan, WF bisa belum terdefinisi di level atas
var TRANS = {
  submit: { from: ['DRAFT', 'REJECTED'], to: 'SUBMITTED', need: 'E' },
  verify: { from: ['SUBMITTED'], to: 'VERIFIED', need: 'P' },
  approve: { from: ['VERIFIED', 'SUBMITTED'], to: 'APPROVED', need: 'P' },
  post: { from: ['APPROVED'], to: 'POSTED', need: 'P' },
  reject: { from: ['SUBMITTED', 'VERIFIED'], to: 'REJECTED', need: 'P' },
  cancel: { from: ['APPROVED', 'POSTED', 'DRAFT'], to: 'CANCELLED', need: 'P' }
};

function apiTransition(ctx, p) {
  var sc = sc_(p.mod); if (!sc.wf) throw err_('Modul ini tidak memakai workflow', 'NOWF');
  var tr = TRANS[p.action]; if (!tr) throw err_('Aksi tidak dikenal', 'VALID');
  need_(ctx, sc.g, tr.need); licenseGuardWrite_(ctx, sc);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = findBy_(p.mod, 'id', p.id); if (!r) throw err_('Data tidak ditemukan', 'NOTFOUND');
    if (!inScope_(ctx, sc, r)) throw err_('Di luar kewenangan', 'SCOPE');
    if (tr.from.indexOf(r.status) < 0) throw err_('Aksi "' + p.action + '" tidak dapat dilakukan pada status ' + r.status, 'STATE');
    var st = getSettings_(), me = ctx.user.username;
    if (p.action === 'cancel' && r.status === WF.DRAFT && r.created_by !== me && !perm_(ctx, sc.g, 'D')) throw err_('Hanya pembuat yang dapat membatalkan draft', 'PERM');
    if (['verify', 'approve', 'post', 'reject'].indexOf(p.action) > -1 && st.strict_sod && r.created_by === me && ctx.user.role !== 'SUPER_ADMIN')
      throw err_('Separation of Duties: pembuat transaksi tidak boleh memverifikasi/menyetujui transaksinya sendiri', 'SOD');
    if (p.action === 'approve' && st.strict_sod) {
      var ver = table_(SYS.APPR).rows.filter(function (a) { return a.rec_id === r.id && a.action === 'verify'; }).pop();
      if (ver && ver.user === me && ctx.user.role !== 'SUPER_ADMIN') throw err_('Separation of Duties: verifikator dan penyetuju harus berbeda orang', 'SOD');
    }
    if (p.action === 'approve' && sc.amt) {
      var amt = Number(r[sc.amt]) || 0, lim = st.approval_limits[ctx.user.role];
      if (lim === undefined) lim = 0;
      if (lim !== -1 && amt > lim) throw err_('Nilai Rp ' + fmtNum_(amt) + ' melebihi batas kewenangan Anda (Rp ' + fmtNum_(lim) + '). Teruskan ke pejabat berwenang.', 'LIMIT');
    }
    if ((p.action === 'reject' || p.action === 'cancel') && !p.comment) throw err_('Alasan wajib diisi', 'VALID');
    var rec = {}; Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
    var ht = HOOKS.transition[p.mod] || (typeof OPS_HOOKS !== 'undefined' ? OPS_HOOKS.transition[p.mod] : null); if (ht) ht(p.action, rec, ctx);
    var from = r.status; rec.status = tr.to; rec.version = Number(r.version || 1) + 1; rec.updated_at = now_(); rec.updated_by = me;
    updateObj_(sc.sheet, r._row, rec);
    appendObj_(SYS.APPR, ['id', 'ts', 'module', 'rec_id', 'action', 'from_status', 'to_status', 'user', 'role', 'comment'], {
      id: uid_(), ts: now_(), module: p.mod, rec_id: r.id, action: p.action, from_status: from, to_status: tr.to, user: me, role: ctx.user.role, comment: p.comment || ''
    });
    audit_(ctx, 'WF:' + p.action, p.mod, r.id, { status: from }, { status: tr.to });
    notify_(r.created_by, sc.t + ' ' + (r[refKey_(p.mod)] || '') + ' → ' + tr.to + (p.comment ? ' (' + p.comment + ')' : ''), p.mod, r.id);
    delete rec._row;
    return { rec: rec };
  } finally { lock.releaseLock(); }
}

function fmtNum_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

/** Daftar transaksi yang menunggu tindakan user ini. */
function apiPending(ctx) {
  var out = [], sch = getSchema_();
  Object.keys(sch).forEach(function (k) {
    var sc = sch[k]; if (!sc.wf || !perm_(ctx, sc.g, 'P')) return;
    rowsOf_(k).forEach(function (r) {
      if ([WF.SUBMITTED, WF.VERIFIED, WF.APPROVED].indexOf(r.status) < 0 || !inScope_(ctx, sc, r)) return;
      out.push({ mod: k, title: sc.t, id: r.id, code: r[refKey_(k)] || '', status: r.status, by: r.created_by, at: r.updated_at, estate: r.estate_code || r.mill_code || '', amount: sc.amt ? r[sc.amt] : '' });
    });
  });
  if (typeof wfxPendingFor_ === 'function') out = out.concat(wfxPendingFor_(ctx));
  out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  return out.slice(0, 300);
}

/* ---------------- BATCH (sinkronisasi offline & impor) ---------------- */
function apiBatch(ctx, p) {
  var items = p.items || [], res = [];
  if (items.length > 500) throw err_('Maksimal 500 baris per batch', 'VALID');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    items.forEach(function (it, i) {
      try {
        var sc = sc_(it.mod); need_(ctx, sc.g, 'E'); licenseGuardWrite_(ctx, sc);
        var r = saveCore_(ctx, sc, it.rec || {});
        if (it.submit && sc.wf && r.rec.status === WF.DRAFT) { lock.releaseLock(); apiTransition(ctx, { mod: it.mod, id: r.rec.id, action: 'submit' }); lock.waitLock(30000); }
        res.push({ i: i, ok: true, id: r.rec.id, duplicate: !!r.duplicate, qid: it.qid });
      } catch (e) { res.push({ i: i, ok: false, error: String(e.message || e), code: e.code, qid: it.qid, server: e.server || null }); }
    });
  } finally { try { lock.releaseLock(); } catch (e) { } }
  return { results: res, ok: res.filter(function (r) { return r.ok; }).length, fail: res.filter(function (r) { return !r.ok; }).length };
}

/** Opsi dropdown referensi (dibatasi scope). */
function apiRefs(ctx, p) {
  var out = {};
  (p.mods || []).forEach(function (m) {
    var sc = sc_(m); if (!perm_(ctx, sc.g, 'V') && ['estates', 'divisions', 'blocks', 'mills', 'regions', 'companies', 'items', 'warehouses', 'employees', 'vehicles', 'cost_centers', 'coa'].indexOf(m) < 0) { out[m] = []; return; }
    var k = refKey_(m), lk = labelKey_(m);
    out[m] = rowsOf_(m).filter(function (r) { return inScope_(ctx, sc, r) && r.status !== WF.CANCELLED; }).map(function (r) {
      var o = { v: String(r[k]), l: String(r[k]) + (lk && r[lk] ? ' — ' + r[lk] : '') };
      if (r.estate_code) o.e = String(r.estate_code); if (r.division_code) o.d = String(r.division_code);
      return o;
    }).slice(0, 5000);
  });
  return out;
}

/* ---------------- NOTIFIKASI ---------------- */
function notify_(username, msg, mod, id) {
  try { appendObj_(SYS.NOTIF, ['id', 'ts', 'user', 'msg', 'module', 'rec_id', 'read'], { id: uid_(), ts: now_(), user: username, msg: msg, module: mod || '', rec_id: id || '', read: false }); } catch (e) { }
}
function apiNotifs(ctx, p) {
  var s = ss_().getSheetByName(SYS.NOTIF);
  if (p && p.markRead && s) {
    table_(SYS.NOTIF).rows.forEach(function (n) { if (n.user === ctx.user.username && String(n.read) !== 'true') s.getRange(n._row, 7).setValue(true); });
    invalidate_(SYS.NOTIF);
  }
  return table_(SYS.NOTIF).rows.filter(function (n) { return n.user === ctx.user.username; }).slice(-50).reverse();
}

/** Audit trail (hanya baca; tidak ada API untuk mengubah/menghapus audit). */
function apiAudit(ctx, p) {
  if (!perm_(ctx, 'sys', 'V') && ctx.user.role !== 'AUDITOR') throw err_('Hanya administrator/auditor', 'PERM');
  var q = String(p.q || '').toLowerCase(), rows = table_(SYS.AUDIT).rows.filter(function (a) {
    if (p.module && a.module !== p.module) return false;
    if (p.from && String(a.ts).substr(0, 10) < p.from) return false;
    if (p.to && String(a.ts).substr(0, 10) > p.to) return false;
    return !q || (a.user + ' ' + a.action + ' ' + a.module + ' ' + a.rec_id).toLowerCase().indexOf(q) > -1;
  });
  return rows.slice(-500).reverse().map(function (a) { return { ts: a.ts, user: a.user, role: a.role, action: a.action, module: a.module, rec_id: a.rec_id, device: a.device, after: String(a.after || '').substr(0, 300) }; });
}

/* ---------------- 10 JUTA SEL: MONITOR & ARSIP ---------------- */
function apiUsage(ctx) {
  need_(ctx, 'sys', 'V');
  var sheets = ss_().getSheets(), total = 0, list = sheets.map(function (s) {
    var c = s.getMaxRows() * s.getMaxColumns(); total += c;
    return { name: s.getName(), rows: s.getLastRow(), maxRows: s.getMaxRows(), cols: s.getMaxColumns(), cells: c };
  }).sort(function (a, b) { return b.cells - a.cells; });
  var arch = table_(SYS.ARCH).rows;
  return { total: total, limit: APP.CELL_LIMIT, pct: Math.round(total / APP.CELL_LIMIT * 1000) / 10, sheets: list, archives: arch };
}

/** Rapikan sel kosong (baris/kolom berlebih) agar kuota tidak terbuang. */
function apiTrim(ctx) {
  need_(ctx, 'sys', 'A'); var freed = 0;
  ss_().getSheets().forEach(function (s) {
    var lr = Math.max(s.getLastRow(), 1), lc = Math.max(s.getLastColumn(), 1);
    if (s.getMaxRows() > lr + 50) { var n = s.getMaxRows() - lr - 50; s.deleteRows(lr + 51, n); freed += n * s.getMaxColumns(); }
    if (s.getMaxColumns() > lc) { var m = s.getMaxColumns() - lc; s.deleteColumns(lc + 1, m); freed += m * s.getMaxRows(); }
  });
  audit_(ctx, 'TRIM', 'system', '', null, { freed: freed });
  return { freed: freed };
}

/** Pindahkan transaksi tahun tertentu ke spreadsheet arsip (data tetap utuh, dapat dibuka). */
function apiArchive(ctx, p) {
  need_(ctx, 'sys', 'A');
  if (isDemo_()) throw err_('Arsip per tahun tidak tersedia di versi demo', 'DEMO');
  var sc = sc_(p.mod), year = String(p.year); if (!/^\d{4}$/.test(year)) throw err_('Tahun tidak valid', 'VALID');
  var src = ss_().getSheetByName(sc.sheet); if (!src) return { moved: 0 };
  var t = table_(sc.sheet), rows = t.rows.filter(function (r) { return dateOf_(sc, r).substr(0, 4) === year && (!sc.wf || [WF.POSTED, WF.CANCELLED].indexOf(r.status) > -1); });
  if (!rows.length) return { moved: 0 };
  var props = PropertiesService.getScriptProperties(), key = 'ARCH_' + year, aid = props.getProperty(key), arch;
  if (aid) arch = SpreadsheetApp.openById(aid); else { arch = SpreadsheetApp.create('PALM OS Arsip ' + year); props.setProperty(key, arch.getId()); }
  var as = arch.getSheetByName(sc.sheet) || arch.insertSheet(sc.sheet);
  if (as.getLastRow() === 0) as.getRange(1, 1, 1, t.h.length).setValues([t.h]);
  var data = rows.map(function (r) { return t.h.map(function (k) { return r[k] === undefined ? '' : r[k]; }); });
  as.getRange(as.getLastRow() + 1, 1, data.length, t.h.length).setValues(data);
  rows.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rn) { src.deleteRow(rn); });
  invalidate_(sc.sheet);
  appendObj_(SYS.ARCH, ['id', 'ts', 'module', 'year', 'rows', 'spreadsheet_id', 'url', 'by'], { id: uid_(), ts: now_(), module: p.mod, year: year, rows: rows.length, spreadsheet_id: arch.getId(), url: arch.getUrl(), by: ctx.user.username });
  audit_(ctx, 'ARCHIVE', p.mod, '', null, { year: year, rows: rows.length });
  return { moved: rows.length, url: arch.getUrl() };
}


/* ===== Auth.gs ===== */
/**
 * PALM OS ENTERPRISE — Auth.gs
 * Login (hash SHA-256 bergaram + iterasi), sesi token (cache + sheet, token disimpan ter-hash),
 * rate limiting, MFA TOTP (RFC 6238), RBAC + data scope, profil & manajemen pengguna.
 */
var USER_COLS = ['id', 'username', 'name', 'email', 'role', 'scope_type', 'scope_codes', 'salt', 'hash', 'active', 'photo', 'mfa_secret', 'mfa_on', 'must_change', 'last_login', 'created_at', 'updated_at'];
var SESS_COLS = ['id', 'token_hash', 'user_id', 'created_at', 'expires_at', 'device', 'revoked'];

function sha_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPw_(pw, salt) { var d = salt + '|' + pw; for (var i = 0; i < 400; i++) d = sha_(d + salt); return d; }
function randHex_(n) { var s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ''); return s.substr(0, n); }

function users_() { return table_(SYS.USERS).rows; }
function userBy_(k, v) { return users_().filter(function (u) { return String(u[k]).toLowerCase() === String(v).toLowerCase(); })[0] || null; }
function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }

function pwPolicy_(pw) {
  if (!pw || pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw err_('Password minimal 8 karakter, kombinasi huruf dan angka', 'VALID');
}

/* ---------------- LOGIN / LOGOUT ---------------- */
function apiLogin(p) {
  var uname = String(p.username || '').trim().toLowerCase();
  if (!uname || !p.password) throw err_('Username dan password wajib diisi', 'VALID');
  var c = CacheService.getScriptCache(), fk = 'LF:' + uname, fails = Number(c.get(fk) || 0);
  if (fails >= 5) throw err_('Akun dikunci sementara 15 menit karena 5x gagal login', 'LOCKED');
  var u = userBy_('username', uname);
  if (!u || !truthy_(u.active) || hashPw_(String(p.password), u.salt) !== u.hash) {
    c.put(fk, String(fails + 1), 900);
    audit_(null, 'LOGIN_FAIL:' + uname, 'auth', '', null, null);
    throw err_('Username atau password salah', 'AUTH');
  }
  if (truthy_(u.mfa_on)) {
    if (!p.otp) return { mfa_required: true };
    if (!totpCheck_(u.mfa_secret, String(p.otp))) { c.put(fk, String(fails + 1), 900); throw err_('Kode MFA salah', 'AUTH'); }
  }
  c.remove(fk);
  var token = randHex_(48), exp = new Date(Date.now() + APP.SESSION_HOURS * 3600000).toISOString();
  appendObj_(SYS.SESS, SESS_COLS, { id: uid_(), token_hash: sha_(token), user_id: u.id, created_at: now_(), expires_at: exp, device: String(p.device || '').substr(0, 120), revoked: false });
  c.put('S:' + sha_(token), JSON.stringify({ uid: u.id, exp: exp }), Math.min(21600, APP.SESSION_HOURS * 3600));
  updateUserField_(u, { last_login: now_() });
  var ctx = buildCtx_(userBy_('id', u.id), p.device);
  audit_(ctx, 'LOGIN', 'auth', u.id, null, null);
  var boot = bootstrap_(ctx); boot.token = token; boot.expires_at = exp;
  return boot;
}

function apiLogout(ctx) {
  var th = ctx.tokenHash, s = ss_().getSheetByName(SYS.SESS);
  CacheService.getScriptCache().remove('S:' + th);
  var r = table_(SYS.SESS).rows.filter(function (x) { return x.token_hash === th; })[0];
  if (r && s) { s.getRange(r._row, SESS_COLS.indexOf('revoked') + 1).setValue(true); invalidate_(SYS.SESS); }
  audit_(ctx, 'LOGOUT', 'auth', ctx.user.id, null, null);
  return { ok: true };
}

/** Validasi token → konteks user (dipanggil setiap RPC). */
function ctx_(token, device) {
  if (!token) throw err_('Sesi berakhir, silakan login kembali', 'NOSESSION');
  var th = sha_(String(token)), c = CacheService.getScriptCache(), raw = c.get('S:' + th), sess = raw ? JSON.parse(raw) : null;
  if (!sess) {
    var r = table_(SYS.SESS).rows.filter(function (x) { return x.token_hash === th; })[0];
    if (!r || truthy_(r.revoked)) throw err_('Sesi berakhir, silakan login kembali', 'NOSESSION');
    sess = { uid: r.user_id, exp: r.expires_at };
    c.put('S:' + th, JSON.stringify(sess), 21600);
  }
  if (new Date(sess.exp).getTime() < Date.now()) throw err_('Sesi kedaluwarsa, silakan login kembali', 'NOSESSION');
  var u = userBy_('id', sess.uid);
  if (!u || !truthy_(u.active)) throw err_('Akun dinonaktifkan', 'NOSESSION');
  var ctx = buildCtx_(u, device); ctx.tokenHash = th; return ctx;
}

function buildCtx_(u, device) {
  var ctx = { user: u, device: device || '', estates: null, divisions: null };
  var codes = String(u.scope_codes || '').split(',').map(function (s) { return s.trim(); }).filter(String), st = u.scope_type || 'ALL';
  if (u.role === 'SUPER_ADMIN' || u.role === 'DIRECTOR' || st === 'ALL') return ctx;
  var est = {};
  if (st === 'REGION') rowsOf_('estates').forEach(function (e) { if (codes.indexOf(String(e.region_code)) > -1) est[e.code] = 1; });
  else if (st === 'ESTATE') codes.forEach(function (c) { est[c] = 1; });
  else if (st === 'DIVISION') {
    ctx.divisions = {};
    rowsOf_('divisions').forEach(function (d) { if (codes.indexOf(String(d.code)) > -1) { est[d.estate_code] = 1; ctx.divisions[d.code] = 1; } });
  }
  ctx.estates = est;
  return ctx;
}

/** Hak akses efektif: role × grup, dipotong oleh tier lisensi. */
function perm_(ctx, g, letter) {
  var r = ROLES[ctx.user.role]; if (!r) return false;
  var letters = (r[g] !== undefined) ? r[g] : r.all;
  if (['dash', 'rpt', 'gis', 'ai', 'appr'].indexOf(g) > -1 && r[g] === undefined) letters = r.all.indexOf('V') > -1 ? 'V' : '';
  if (g === 'appr') letters = 'V';
  if (g === 'wfx') letters = 'VE';
  if (g === 'qr') letters = 'V'; // pemindai & label QR: semua akun; aksi lanjutan tetap mengikuti hak modul tujuan // swalayan karyawan: semua akun aktif dapat mengajukan; persetujuan per orang (Workflow.gs)
  if (g === 'sys') letters = ctx.user.role === 'SUPER_ADMIN' ? 'VEPDA' : (ctx.user.role === 'CORP_ADMIN' ? 'VE' : '');
  if (!licenseAllowsGroup_(g)) return false;
  if (letter !== 'V' && g !== 'sys' && licenseReadOnly_()) return false; // admin tetap bisa aktivasi lisensi
  return letters.indexOf(letter) > -1;
}
function need_(ctx, g, letter) {
  if (!perm_(ctx, g, letter)) throw err_('Anda tidak memiliki hak ' + ({ V: 'melihat', E: 'menginput/mengubah', P: 'menyetujui', D: 'menghapus', A: 'administrasi' }[letter] || letter) + ' pada modul ini', 'PERM');
}

function publicUser_(u) {
  return { id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, roleTitle: (ROLES[u.role] || {}).t, scope_type: u.scope_type, scope_codes: u.scope_codes, photo: chunkGet_(u.photo || ''), mfa_on: truthy_(u.mfa_on), must_change: truthy_(u.must_change), last_login: u.last_login };
}

/** Semua yang dibutuhkan klien dalam satu panggilan → login & buka aplikasi cepat. */
function bootstrap_(ctx) {
  var perms = {};
  GROUPS.forEach(function (g) { perms[g[0]] = ['V', 'E', 'P', 'D', 'A'].filter(function (l) { return perm_(ctx, g[0], l); }).join(''); });
  var st = getSettings_(); st.logo = chunkGet_(st.logo || '');
  var sch = getSchema_(), slim = {};
  Object.keys(sch).forEach(function (k) { var s = sch[k]; slim[k] = { key: k, g: s.g, t: s.t, wf: s.wf, amt: s.amt, scope: s.scope, refKey: refKey_(k), fields: s.fields }; });
  return {
    app: APP, user: publicUser_(ctx.user), perms: perms, groups: GROUPS, schema: slim, settings: st,
    roles: Object.keys(ROLES).map(function (k) { return { k: k, t: ROLES[k].t }; }), license: licenseInfo_(),
    scope: ctx.estates ? Object.keys(ctx.estates) : null, server_time: now_(), ssid: perm_(ctx, 'sys', 'A') ? ss_().getId() : null,
    refs: apiRefs(ctx, { mods: ['regions', 'estates', 'divisions', 'mills'] }), app_url: typeof wfxBaseUrl_ === 'function' ? wfxBaseUrl_() : ''
  };
}
function apiMe(ctx) { return bootstrap_(ctx); }

/* ---------------- PROFIL ---------------- */
function updateUserField_(u, patch) {
  var rec = {}; Object.keys(u).forEach(function (k) { rec[k] = u[k]; });
  Object.keys(patch).forEach(function (k) { if (k === 'photo' && typeof u.photo === 'string' && u.photo.indexOf('@@CHUNK:') === 0) chunkDelete_(u.photo); rec[k] = patch[k]; });
  rec.updated_at = now_(); updateObj_(SYS.USERS, u._row, rec); return rec;
}
function apiProfile(ctx, p) {
  var patch = {};
  if (p.name) patch.name = String(p.name).substr(0, 120);
  if (p.email !== undefined) patch.email = String(p.email).substr(0, 160);
  if (p.photo !== undefined) {
    if (p.photo && !/^data:image\/(png|jpe?g|webp);base64,/.test(p.photo)) throw err_('Format foto tidak didukung', 'VALID');
    patch.photo = p.photo;
  }
  updateUserField_(ctx.user, patch); audit_(ctx, 'PROFILE', 'auth', ctx.user.id, null, { name: patch.name });
  return publicUser_(userBy_('id', ctx.user.id));
}
function apiChangePw(ctx, p) {
  if (hashPw_(String(p.old || ''), ctx.user.salt) !== ctx.user.hash) throw err_('Password lama salah', 'AUTH');
  pwPolicy_(p.pw); var salt = randHex_(24);
  updateUserField_(ctx.user, { salt: salt, hash: hashPw_(p.pw, salt), must_change: false });
  audit_(ctx, 'CHANGE_PW', 'auth', ctx.user.id, null, null); return { ok: true };
}

/* ---------------- MFA TOTP ---------------- */
var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc_(bytes) { var bits = '', out = ''; bytes.forEach(function (b) { bits += ('00000000' + ((b + 256) % 256).toString(2)).substr(-8); }); for (var i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.substr(i, 5), 2)]; return out; }
function b32dec_(s) { var bits = '', out = []; s = s.replace(/=+$/, '').toUpperCase(); for (var i = 0; i < s.length; i++) { var v = B32.indexOf(s[i]); if (v < 0) continue; bits += ('00000' + v.toString(2)).substr(-5); } for (var j = 0; j + 8 <= bits.length; j += 8) { var n = parseInt(bits.substr(j, 8), 2); out.push(n > 127 ? n - 256 : n); } return out; }
function totp_(secret, step) {
  var msg = [], c = step; for (var i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  msg = msg.map(function (b) { return b > 127 ? b - 256 : b; });
  var h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, b32dec_(secret)).map(function (b) { return (b + 256) % 256; });
  var o = h[19] & 15, code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return ('000000' + (code % 1000000)).substr(-6);
}
function totpCheck_(secret, code) { var s = Math.floor(Date.now() / 30000); return [-1, 0, 1].some(function (d) { return totp_(secret, s + d) === code; }); }
function apiMfaSetup(ctx) {
  var bytes = []; var hex = randHex_(40); for (var i = 0; i < 40; i += 2) { var n = parseInt(hex.substr(i, 2), 16); bytes.push(n > 127 ? n - 256 : n); }
  var secret = b32enc_(bytes); updateUserField_(ctx.user, { mfa_secret: secret, mfa_on: false });
  return { secret: secret, uri: 'otpauth://totp/PALM%20OS:' + encodeURIComponent(ctx.user.username) + '?secret=' + secret + '&issuer=PALM%20OS' };
}
function apiMfaEnable(ctx, p) {
  var u = userBy_('id', ctx.user.id);
  if (p.off) { if (hashPw_(String(p.password || ''), u.salt) !== u.hash) throw err_('Password salah', 'AUTH'); updateUserField_(u, { mfa_on: false, mfa_secret: '' }); return { mfa_on: false }; }
  if (!u.mfa_secret || !totpCheck_(u.mfa_secret, String(p.otp || ''))) throw err_('Kode tidak cocok. Pastikan jam perangkat akurat.', 'VALID');
  updateUserField_(u, { mfa_on: true }); audit_(ctx, 'MFA_ON', 'auth', u.id, null, null); return { mfa_on: true };
}

/* ---------------- MANAJEMEN PENGGUNA (Super Admin) ---------------- */
function apiUsers(ctx) {
  need_(ctx, 'sys', 'V');
  return users_().map(function (u) { var o = publicUser_(u); o.active = truthy_(u.active); o.photo = o.photo ? 1 : 0; return o; });
}
function apiUserSave(ctx, p) {
  need_(ctx, 'sys', 'A');
  var u = p.id ? userBy_('id', p.id) : null, uname = String(p.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(uname)) throw err_('Username 3-40 karakter: huruf kecil, angka, titik, minus, garis bawah', 'VALID');
  if (!ROLES[p.role]) throw err_('Role tidak valid', 'VALID');
  if (['ALL', 'REGION', 'ESTATE', 'DIVISION'].indexOf(p.scope_type || 'ALL') < 0) throw err_('Scope tidak valid', 'VALID');
  var other = userBy_('username', uname); if (other && (!u || other.id !== u.id)) throw err_('Username sudah dipakai', 'DUP');
  if (!u) {
    var lic = licenseInfo_(), active = users_().filter(function (x) { return truthy_(x.active); }).length;
    if (lic.max_users > 0 && active >= lic.max_users) throw err_('Batas pengguna lisensi ' + lic.tier + ' (' + lic.max_users + ') tercapai', 'LICENSE');
    pwPolicy_(p.password); var salt = randHex_(24);
    var rec = { id: uid_(), username: uname, name: p.name || uname, email: p.email || '', role: p.role, scope_type: p.scope_type || 'ALL', scope_codes: p.scope_codes || '', salt: salt, hash: hashPw_(p.password, salt), active: true, photo: '', mfa_secret: '', mfa_on: false, must_change: true, last_login: '', created_at: now_(), updated_at: now_() };
    appendObj_(SYS.USERS, USER_COLS, rec); audit_(ctx, 'USER_CREATE', 'auth', rec.id, null, { username: uname, role: p.role });
    return publicUser_(rec);
  }
  if (u.id === ctx.user.id && p.role !== 'SUPER_ADMIN') throw err_('Tidak dapat menurunkan role akun sendiri', 'VALID');
  var patch = { username: uname, name: p.name, email: p.email || '', role: p.role, scope_type: p.scope_type, scope_codes: p.scope_codes || '', active: p.active !== false };
  if (p.password) { pwPolicy_(p.password); patch.salt = randHex_(24); patch.hash = hashPw_(p.password, patch.salt); patch.must_change = true; }
  if (p.reset_mfa) { patch.mfa_on = false; patch.mfa_secret = ''; }
  updateUserField_(u, patch); audit_(ctx, 'USER_UPDATE', 'auth', u.id, { role: u.role, active: u.active }, { role: p.role, active: patch.active });
  if (!patch.active || p.password) revokeUserSessions_(u.id);
  return publicUser_(userBy_('id', u.id));
}
function revokeUserSessions_(uid) {
  var s = ss_().getSheetByName(SYS.SESS); if (!s) return; var c = CacheService.getScriptCache();
  table_(SYS.SESS).rows.forEach(function (r) { if (r.user_id === uid && !truthy_(r.revoked)) { s.getRange(r._row, SESS_COLS.indexOf('revoked') + 1).setValue(true); c.remove('S:' + r.token_hash); } });
  invalidate_(SYS.SESS);
}

/* ---------------- PENGATURAN ---------------- */
function getSettings_() {
  if (_memo.settings) return _memo.settings;
  var st = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  table_(SYS.SET).rows.forEach(function (r) { try { st[r.id] = JSON.parse(chunkGet_(r.value)); } catch (e) { st[r.id] = r.value; } });
  _memo.settings = st; return st;
}
function apiSettingsSave(ctx, p) {
  var brandOnly = ['app_title', 'app_subtitle', 'logo', 'theme'];
  if (isDemo_() && (p.app_title !== undefined || p.app_subtitle !== undefined || p.logo !== undefined || p.ai_enabled)) throw err_('Versi demo: identitas aplikasi (judul/logo) dan AI eksternal terkunci. Tema tetap dapat diubah.', 'DEMO');
  var keys = Object.keys(p || {});
  keys.forEach(function (k) {
    if (!(k in DEFAULT_SETTINGS)) throw err_('Pengaturan tidak dikenal: ' + k, 'VALID');
    if (brandOnly.indexOf(k) < 0) need_(ctx, 'sys', 'A');
    else if (!perm_(ctx, 'sys', 'A') && ctx.user.role !== 'CORP_ADMIN') throw err_('Hanya administrator yang dapat mengubah identitas aplikasi', 'PERM');
  });
  if (p.logo && !/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(p.logo)) throw err_('Format logo tidak didukung', 'VALID');
  var s = sh_(SYS.SET, ['id', 'value', 'updated_at', 'updated_by']), rows = table_(SYS.SET).rows;
  keys.forEach(function (k) {
    var old = rows.filter(function (r) { return r.id === k; })[0], obj = { id: k, value: JSON.stringify(p[k]), updated_at: now_(), updated_by: ctx.user.username };
    if (old) { chunkDelete_(old.value); updateObj_(SYS.SET, old._row, obj); } else appendObj_(SYS.SET, ['id', 'value', 'updated_at', 'updated_by'], obj);
  });
  delete _memo.settings; delete _memo.wfxConf; audit_(ctx, 'SETTINGS', 'system', keys.join(','), null, null);
  var st = getSettings_(); st.logo = chunkGet_(st.logo || ''); return st;
}


/* ===== License.gs ===== */
/**
 * PALM OS ENTERPRISE — License.gs
 * Format kunci: POS1.<payload base64url>.<HMAC-SHA256 base64url>
 * payload: { lic, cust, tier, max_estates, max_users, exp:'YYYY-MM-DD', bind:'<spreadsheetId>|*' }
 * Rahasia HMAC (LICENSE_SECRET) diset penyedia di Script Properties dan dipakai juga oleh LicenseIssuer.html.
 */
var TIERS = {
  TRIAL: { t: 'Trial 30 Hari', groups: '*', max_estates: 2, max_users: 10 },
  STARTER: { t: 'Starter (Estate)', groups: 'dash,org,plant,nur,gis,agro,harv,rpt,appr,sys', max_estates: 3, max_users: 25 },
  PROFESSIONAL: { t: 'Professional (Region)', groups: 'dash,org,plant,nur,lc,gis,agro,harv,bor,logi,mill,hr,inv,proc,asset,aud,rpt,appr,sys,docs', max_estates: 10, max_users: 150 },
  ENTERPRISE: { t: 'Enterprise (Group)', groups: '*', max_estates: -1, max_users: -1 }
};

function b64url_(bytesOrStr) { return Utilities.base64EncodeWebSafe(bytesOrStr).replace(/=+$/, ''); }
function b64urlDecStr_(s) { while (s.length % 4) s += '='; return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString(); }

function verifyLicenseKey_(key) {
  var secret = PropertiesService.getScriptProperties().getProperty('LICENSE_SECRET');
  if (!secret) return { valid: false, reason: 'LICENSE_SECRET belum dikonfigurasi penyedia' };
  var parts = String(key || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'POS1') return { valid: false, reason: 'Format kunci tidak dikenal' };
  var sig = b64url_(Utilities.computeHmacSha256Signature(parts[0] + '.' + parts[1], secret));
  if (sig !== parts[2]) return { valid: false, reason: 'Tanda tangan kunci tidak valid' };
  var pl; try { pl = JSON.parse(b64urlDecStr_(parts[1])); } catch (e) { return { valid: false, reason: 'Payload rusak' }; }
  if (!TIERS[pl.tier]) return { valid: false, reason: 'Tier tidak dikenal' };
  if (pl.bind && pl.bind !== '*' && pl.bind !== ss_().getId()) return { valid: false, reason: 'Kunci terikat ke spreadsheet lain' };
  if (pl.exp && pl.exp < Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd')) return { valid: false, expired: true, reason: 'Lisensi berakhir ' + pl.exp, payload: pl };
  return { valid: true, payload: pl };
}

/** Batasan versi demo (APP.EDITION = 'DEMO'). Ditegakkan di server; klien hanya menampilkan. */
var DEMO_LIMITS = { estates: 1, divisions: 3, blocks: 30, rows: 100, users: 3, exportRows: 50, layers: 3, layerMB: 200 };
function isDemo_() { return APP.EDITION === 'DEMO'; }

function licenseInfo_() {
  if (_memo.lic) return _memo.lic;
  if (isDemo_()) {
    _memo.lic = { tier: 'DEMO', title: 'Versi Demo', customer: 'Demo publik', exp: 'Tanpa batas waktu (dengan batasan data)', groups: '*', max_estates: DEMO_LIMITS.estates, max_users: DEMO_LIMITS.users, readonly: false, valid: true, demo: true, limits: DEMO_LIMITS,
      reason: 'Versi demo: maks ' + DEMO_LIMITS.estates + ' estate, ' + DEMO_LIMITS.divisions + ' afdeling, ' + DEMO_LIMITS.blocks + ' blok, ' + DEMO_LIMITS.rows + ' data per modul, ' + DEMO_LIMITS.users + ' pengguna; cetak & ekspor diberi tanda air.' };
    return _memo.lic;
  }
  var p = PropertiesService.getScriptProperties(), key = p.getProperty('LICENSE_KEY'), inst = p.getProperty('INSTALLED_AT');
  if (!inst) { inst = now_(); p.setProperty('INSTALLED_AT', inst); }
  var info;
  if (key) {
    var v = verifyLicenseKey_(key);
    if (v.valid) {
      var t = TIERS[v.payload.tier];
      info = { tier: v.payload.tier, title: t.t, customer: v.payload.cust, lic: v.payload.lic, exp: v.payload.exp || 'Selamanya', groups: t.groups,
        max_estates: v.payload.max_estates != null ? Number(v.payload.max_estates) : t.max_estates, max_users: v.payload.max_users != null ? Number(v.payload.max_users) : t.max_users, readonly: false, valid: true };
    } else info = { tier: 'INVALID', title: 'Lisensi tidak valid', reason: v.reason, groups: '*', max_estates: 0, max_users: 0, readonly: true, valid: false };
  } else {
    var days = 30 - Math.floor((Date.now() - new Date(inst).getTime()) / 86400000);
    info = { tier: 'TRIAL', title: TIERS.TRIAL.t, customer: '-', exp: days + ' hari tersisa', days_left: days, groups: '*', max_estates: TIERS.TRIAL.max_estates, max_users: TIERS.TRIAL.max_users, readonly: days < 0, valid: days >= 0 };
    if (days < 0) info.reason = 'Masa trial berakhir. Mode baca-saja aktif sampai lisensi diaktifkan.';
  }
  _memo.lic = info; return info;
}

function licenseAllowsGroup_(g) {
  var l = licenseInfo_(); if (l.groups === '*' || ['dash', 'sys', 'appr', 'rpt', 'wfx', 'qr'].indexOf(g) > -1) return true;
  return l.groups.split(',').indexOf(g) > -1;
}
function licenseReadOnly_() { return !!licenseInfo_().readonly; }
function licenseGuardWrite_(ctx, sc) { if (licenseReadOnly_()) throw err_(licenseInfo_().reason || 'Mode baca-saja (lisensi)', 'LICENSE'); }
function licenseGuardCount_(ctx, sc, existing) {
  if (isDemo_() && !existing) {
    var lim = sc.key === 'estates' ? DEMO_LIMITS.estates : sc.key === 'divisions' ? DEMO_LIMITS.divisions : sc.key === 'blocks' ? DEMO_LIMITS.blocks : DEMO_LIMITS.rows;
    if (rowsOf_(sc.key).length >= lim) throw err_('Batas versi demo: maksimal ' + lim + ' data untuk ' + sc.t + '. Hubungi penyedia untuk versi penuh.', 'DEMO');
  }
  if (existing || sc.key !== 'estates') return;
  var l = licenseInfo_(); if (l.max_estates < 0) return;
  if (rowsOf_('estates').length >= l.max_estates) throw err_('Batas Estate lisensi ' + l.tier + ' (' + l.max_estates + ') tercapai. Upgrade lisensi.', 'LICENSE');
}

function apiLicense(ctx, p) {
  need_(ctx, 'sys', 'A');
  if (isDemo_()) throw err_('Versi demo tidak dapat diaktivasi. Pasang paket versi penuh lalu aktifkan kunci lisensi.', 'DEMO');
  var v = verifyLicenseKey_(p.key);
  if (!v.valid) throw err_('Aktivasi gagal: ' + v.reason, 'LICENSE');
  PropertiesService.getScriptProperties().setProperty('LICENSE_KEY', String(p.key).trim());
  delete _memo.lic; audit_(ctx, 'LICENSE_ACTIVATE', 'system', v.payload.lic, null, v.payload);
  return licenseInfo_();
}


/* ===== Business.gs ===== */
/**
 * PALM OS ENTERPRISE — Business.gs
 * Business rules lintas modul dan integrasi transaksi (pemupukan → stok).
 * Laporan, dashboard, peta, forecast & AI ada di Reports.gs.
 */
function r2_(n, d) { var m = Math.pow(10, d == null ? 2 : d); return Math.round((Number(n) || 0) * m) / m; }
function today_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function blockOf_(code) { var b = findBy_('blocks', 'code', code); if (!b) throw err_('Blok "' + code + '" tidak terdaftar', 'REF'); return b; }
function sameEstate_(rec, code, label) { if (code && rec.estate_code && String(code) !== String(rec.estate_code)) throw err_(label + ' bukan milik Estate ' + rec.estate_code, 'VALID'); }
function nonNeg_(rec, keys) { keys.forEach(function (k) { if (rec[k] !== '' && rec[k] != null && Number(rec[k]) < 0) throw err_(k + ' tidak boleh negatif', 'VALID'); }); }
var OUTFLOW = { 'OUT': -1, 'ADJ-': -1, 'TRF-OUT': -1, 'IN': 1, 'ADJ+': 1, 'TRF-IN': 1 };

function stockBal_(item, wh, excludeId) {
  return rowsOf_('stock_moves').reduce(function (s, m) {
    if (m.status !== WF.POSTED || m.id === excludeId) return s;
    if (String(m.item_code) !== String(item) || (wh && String(m.wh_code) !== String(wh))) return s;
    return s + (OUTFLOW[m.move_type] || 0) * (Number(m.qty) || 0);
  }, 0);
}

var HOOKS = {
  before: {
    blocks: function (r) {
      var d = findBy_('divisions', 'code', r.division_code); if (d) sameEstate_(r, d.estate_code, 'Afdeling ' + r.division_code);
      nonNeg_(r, ['legal_ha', 'planted_ha', 'palms']);
      r.sph = Number(r.planted_ha) > 0 && Number(r.palms) > 0 ? Math.round(Number(r.palms) / Number(r.planted_ha)) : '';
      if (r.planting_year && (r.planting_year < 1900 || r.planting_year > 2100)) throw err_('Tahun tanam tidak wajar', 'VALID');
      if (r.geom) {
        var g; try { g = JSON.parse(r.geom); } catch (e) { throw err_('Geometri bukan GeoJSON valid', 'VALID'); }
        var gt = g.type === 'Feature' ? (g.geometry || {}).type : (g.type === 'FeatureCollection' ? 'FC' : g.type);
        if (['Polygon', 'MultiPolygon', 'FC'].indexOf(gt) < 0) throw err_('Geometri blok harus Polygon/MultiPolygon', 'VALID');
      }
    },
    census: function (r) { var b = blockOf_(r.block_code); r.estate_code = b.estate_code; nonNeg_(r, ['productive', 'unproductive', 'dead', 'supply']); },
    replanting: function (r) { var b = blockOf_(r.block_code); r.estate_code = b.estate_code; },
    work_real: function (r) { var w = findBy_('work_orders', 'wo_no', r.wo_no); if (w) { r.estate_code = w.estate_code; if (!r.block_code) r.block_code = w.block_code; } nonNeg_(r, ['real_qty', 'hk', 'cost_rp']); },
    fert_reco: function (r) { var b = blockOf_(r.block_code); r.estate_code = b.estate_code; },
    fert_app: function (r) {
      var b = blockOf_(r.block_code); r.estate_code = b.estate_code;
      var w = findBy_('warehouses', 'code', r.wh_code); if (w) sameEstate_(r, w.estate_code, 'Gudang ' + r.wh_code);
      if (!(Number(r.qty_kg) > 0)) throw err_('Jumlah pupuk harus > 0', 'VALID');
    },
    lsu: function (r) {
      var b = blockOf_(r.block_code); r.estate_code = b.estate_code;
      var std = getSettings_().lsu_std, map = { n: 'n_pct', p: 'p_pct', k: 'k_pct', mg: 'mg_pct', b: 'b_ppm' }, out = [];
      Object.keys(map).forEach(function (k) {
        var v = r[map[k]]; if (v === '' || v == null || !std[k]) return;
        out.push(k.toUpperCase() + ' ' + (v < std[k][0] ? 'Defisien' : v > std[k][1] ? 'Tinggi' : 'Optimum'));
      });
      r.status_hara = out.join(', ');
    },
    pest: function (r) { var b = blockOf_(r.block_code); r.estate_code = b.estate_code; },
    harvest_plan: function (r) { var b = blockOf_(r.block_code); r.estate_code = b.estate_code; r.division_code = b.division_code; },
    harvest: function (r) {
      var b = blockOf_(r.block_code);
      if (r.division_code && String(r.division_code) !== String(b.division_code)) throw err_('Blok ' + r.block_code + ' bukan milik Afdeling ' + r.division_code, 'VALID');
      r.estate_code = b.estate_code; r.division_code = b.division_code;
      var h = findBy_('employees', 'emp_no', r.harvester_no); if (h) sameEstate_(r, h.estate_code, 'Pemanen ' + r.harvester_no);
      nonNeg_(r, ['janjang', 'kg', 'brondolan_kg', 'mentah', 'lewat_matang', 'restan_jjg']);
      if (!(Number(r.janjang) > 0)) throw err_('Janjang harus > 0', 'VALID');
      r.bjr = r2_(Number(r.kg) / Number(r.janjang), 2);
      if (r.bjr < 1 || r.bjr > 60) throw err_('BJR ' + r.bjr + ' kg/jjg tidak wajar, periksa janjang/berat', 'VALID');
      if (r.h_date > today_()) throw err_('Tanggal panen tidak boleh di masa depan', 'VALID');
    },
    vehicles: function (r) { nonNeg_(r, ['capacity_kg', 'hm_km']); },
    deliveries: function (r) {
      var v = findBy_('vehicles', 'code', r.vehicle_code);
      if (v && v.unit_status && ['Rusak', 'Afkir'].indexOf(v.unit_status) > -1) throw err_('Kendaraan ' + r.vehicle_code + ' berstatus ' + v.unit_status, 'VALID');
      if (r.division_code) { var d = findBy_('divisions', 'code', r.division_code); if (d) sameEstate_(r, d.estate_code, 'Afdeling'); }
      nonNeg_(r, ['janjang', 'est_kg']);
    },
    weighbridge: function (r) {
      var d = findBy_('deliveries', 'spb_no', r.spb_no);
      if (!d) throw err_('SPB ' + r.spb_no + ' tidak ditemukan', 'REF');
      if ([WF.CANCELLED, WF.REJECTED, WF.DRAFT].indexOf(d.status) > -1) throw err_('SPB ' + r.spb_no + ' berstatus ' + d.status + ', ajukan SPB terlebih dahulu', 'STATE');
      if (String(d.mill_code) !== String(r.mill_code)) throw err_('SPB ditujukan ke PKS ' + d.mill_code + ', bukan ' + r.mill_code, 'VALID');
      r.estate_code = d.estate_code;
      var b = Number(r.bruto_kg), t = Number(r.tara_kg), cut = Number(r.cut_pct) || 0;
      if (!(b > 0) || !(t > 0) || b <= t) throw err_('Bruto harus lebih besar dari tara dan keduanya > 0', 'VALID');
      if (cut < 0 || cut > 30) throw err_('Potongan grading 0–30%', 'VALID');
      r.netto_kg = b - t; r.netto_final_kg = Math.round((b - t) * (1 - cut / 100));
      if (!r.input_mode) r.input_mode = 'Manual';
    },
    mill_prod: function (r) {
      var f = Number(r.ffb_processed_kg); if (!(f > 0)) throw err_('TBS diolah harus > 0', 'VALID');
      nonNeg_(r, ['cpo_kg', 'kernel_kg', 'op_hours', 'downtime_h']);
      if (Number(r.cpo_kg) + Number(r.kernel_kg) > f) throw err_('Produk melebihi TBS diolah', 'VALID');
      if ((Number(r.op_hours) || 0) + (Number(r.downtime_h) || 0) > 24) throw err_('Jam olah + downtime > 24 jam', 'VALID');
      r.oer = r2_(Number(r.cpo_kg) / f * 100, 2); r.ker = r2_(Number(r.kernel_kg) / f * 100, 2);
    },
    employees: function (r) {
      if (r.username) r.username = String(r.username).trim().toLowerCase();
      if (r.supervisor && String(r.supervisor) === String(r.emp_no)) throw err_('Atasan langsung tidak boleh diri sendiri', 'VALID');
      if (r.supervisor2 && (String(r.supervisor2) === String(r.emp_no) || String(r.supervisor2) === String(r.supervisor))) throw err_('Atasan ke-2 harus berbeda dari karyawan dan atasan langsung', 'VALID');
      if (r.phone && String(r.phone).indexOf('••') !== 0 && !/^(\+?62|0)8[0-9]{7,12}$/.test(String(r.phone).replace(/[\s.-]/g, ''))) throw err_('No. WhatsApp tidak valid (contoh 081234567890)', 'VALID');
      if (!r.work_cal) r.work_cal = r.estate_code ? 'KEBUN' : 'HO';
    },
    attendance: function (r) { var e = findBy_('employees', 'emp_no', r.emp_no); if (e) r.estate_code = e.estate_code; nonNeg_(r, ['hk', 'ot_hours']); },
    stock_moves: function (r) {
      var w = findBy_('warehouses', 'code', r.wh_code); if (w) r.estate_code = w.estate_code;
      if (!(Number(r.qty) > 0)) throw err_('Qty harus > 0', 'VALID');
      if (r.unit_cost === '' || r.unit_cost == null) { var it = findBy_('items', 'code', r.item_code); if (it) r.unit_cost = Number(it.price) || ''; }
    },
    pr: function (r) { nonNeg_(r, ['qty', 'est_price']); r.total = Math.round(Number(r.qty) * Number(r.est_price)); },
    po: function (r) {
      nonNeg_(r, ['qty', 'price']); r.total = Math.round(Number(r.qty) * Number(r.price));
      if (r.pr_no) { var pr = findBy_('pr', 'pr_no', r.pr_no); if (pr && [WF.APPROVED, WF.POSTED].indexOf(pr.status) < 0) throw err_('PR ' + r.pr_no + ' belum disetujui (' + pr.status + ')', 'STATE'); }
    },
    journals: function (r) {
      var lines; try { lines = JSON.parse(r.lines || '[]'); } catch (e) { throw err_('Baris jurnal tidak valid', 'VALID'); }
      if (!Array.isArray(lines) || lines.length < 2) throw err_('Jurnal minimal 2 baris', 'VALID');
      var d = 0, k = 0;
      lines.forEach(function (l, i) {
        if (!findBy_('coa', 'code', l.acct)) throw err_('Baris ' + (i + 1) + ': akun "' + l.acct + '" tidak ada di COA', 'REF');
        var dv = Number(l.debit) || 0, kv = Number(l.credit) || 0;
        if (dv < 0 || kv < 0 || (dv > 0 && kv > 0)) throw err_('Baris ' + (i + 1) + ': isi debit ATAU kredit (positif)', 'VALID');
        d += dv; k += kv;
      });
      r.total_debit = r2_(d); r.total_credit = r2_(k);
      if (Math.abs(d - k) > 0.005 || d <= 0) throw err_('Jurnal tidak seimbang: debit ' + fmtNum_(d) + ' ≠ kredit ' + fmtNum_(k), 'VALID');
      r.lines = JSON.stringify(lines);
    },
    assets: function (r) {
      var cost = Number(r.acq_cost) || 0, sal = Number(r.salvage) || 0, life = Number(r.life_years) || 0;
      if (life <= 0) throw err_('Umur ekonomis harus > 0', 'VALID');
      var yrs = Math.max(0, (new Date(today_()) - new Date(r.acq_date)) / (365.25 * 86400000));
      r.book_value = Math.round(cost - (cost - sal) / life * Math.min(yrs, life));
    },
    permits: function (r) {
      if (!r.expiry_date) { r.doc_state = 'Tanpa masa berlaku'; return; }
      var days = (new Date(r.expiry_date) - new Date(today_())) / 86400000;
      r.doc_state = days < 0 ? 'Kedaluwarsa' : days <= 90 ? 'Segera berakhir (' + Math.ceil(days) + ' hari)' : 'Aktif';
    },
    sales_contracts: function (r) { r.total = Math.round(Number(r.qty_kg) * Number(r.price_kg)); },
    invoices: function (r) { r.total = Math.round(Number(r.qty_kg) * Number(r.price_kg)); r.grand_total = Math.round(r.total * (1 + (Number(r.ppn_pct) || 0) / 100)); },
    maintenance: function (r) { var a = findBy_('assets', 'code', r.asset_code); if (a && a.estate_code) r.estate_code = r.estate_code || a.estate_code; }
  },

  transition: {
    stock_moves: function (action, r) {
      if (action === 'post' && OUTFLOW[r.move_type] < 0) {
        var bal = stockBal_(r.item_code, r.wh_code);
        if (bal < Number(r.qty)) throw err_('Stok tidak cukup: saldo ' + bal + ', diminta ' + r.qty + '. Saldo negatif memerlukan penyesuaian (ADJ+) yang disetujui.', 'STOCK');
      }
    },
    fert_app: function (action, r, ctx) {
      var sm = sc_('stock_moves');
      if (action === 'post') {
        var bal = stockBal_(r.item_code, r.wh_code);
        if (bal < Number(r.qty_kg)) throw err_('Stok pupuk ' + r.item_code + ' di gudang ' + r.wh_code + ' tidak cukup (saldo ' + bal + ' kg)', 'STOCK');
        var it = findBy_('items', 'code', r.item_code);
        appendObj_(sm.sheet, modHeaders_(sm), { id: uid_(), status: WF.POSTED, version: 1, deleted: false, created_at: now_(), created_by: 'system:' + ctx.user.username, updated_at: now_(), updated_by: ctx.user.username, device: 'auto',
          m_date: r.app_date, wh_code: r.wh_code, estate_code: r.estate_code, item_code: r.item_code, move_type: 'OUT', qty: Number(r.qty_kg), unit_cost: it ? Number(it.price) || '' : '', batch: '', ref_doc: 'FERT:' + r.id, cost_center: '', block_code: r.block_code });
      }
      if (action === 'cancel') {
        var mv = rowsOf_('stock_moves').filter(function (m) { return m.ref_doc === 'FERT:' + r.id && m.status === WF.POSTED; })[0];
        if (mv) { var c = {}; Object.keys(mv).forEach(function (k) { c[k] = mv[k]; }); c.status = WF.CANCELLED; c.updated_at = now_(); c.updated_by = ctx.user.username; updateObj_(sm.sheet, mv._row, c); }
      }
    },
    journals: function (action, r) { if (action === 'post') HOOKS.before.journals(r); }
  }
};


/* ===== Reports.gs ===== */
/**
 * PALM OS ENTERPRISE — Reports.gs
 * KPI dashboard, laporan master, data peta, forecasting statistik, deteksi anomali, dan AI assistant.
 * (Dipisah dari Business.gs agar tiap berkas lebih kecil dan mudah ditempel di editor Apps Script.)
 */
/* ---------------- KUMPULAN DATA TRANSAKSI ---------------- */
// Literal string (bukan WF.*) agar aman terhadap urutan pemuatan berkas .gs
var VALID_ST = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'POSTED', 'ACTIVE'];
function tx_(ctx, mod, p) {
  var sc = sc_(mod); if (!perm_(ctx, sc.g, 'V')) return [];
  var from = p.from || '0000', to = p.to || '9999', inclDraft = !!p.draft;
  return rowsOf_(mod).filter(function (r) {
    if (!inScope_(ctx, sc, r)) return false;
    if (p.estate && sc.scope && String(r[sc.scope]) !== String(p.estate)) return false;
    if (sc.wf && VALID_ST.indexOf(r.status) < 0 && !(inclDraft && r.status === WF.DRAFT)) return false;
    var d = dateOf_(sc, r); return d >= from && d <= to;
  });
}
function sum_(rows, k) { return rows.reduce(function (s, r) { return s + (Number(r[k]) || 0); }, 0); }
function groupBy_(rows, fn) { var m = {}; rows.forEach(function (r) { var k = fn(r); (m[k] = m[k] || []).push(r); }); return m; }
function period_(p) {
  var to = p.to || today_(), d = new Date(to); d.setDate(d.getDate() - 29);
  return { from: p.from || Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'), to: to, estate: p.estate || '', draft: !!p.draft };
}

/* ---------------- DASHBOARD ---------------- */
function apiDashboard(ctx, p) {
  var P = period_(p || {}), all = { from: '0000', to: '9999', estate: P.estate };
  var blocks = tx_(ctx, 'blocks', all);
  var area = sum_(blocks, 'planted_ha'), tm = blocks.filter(function (b) { return b.crop_status === 'TM'; }), tbm = blocks.filter(function (b) { return b.crop_status === 'TBM'; });
  var hv = tx_(ctx, 'harvest', P), kg = sum_(hv, 'kg'), jjg = sum_(hv, 'janjang'), tmHa = sum_(tm, 'planted_ha');
  var days = Math.max(1, (new Date(P.to) - new Date(P.from)) / 86400000 + 1);
  var wb = tx_(ctx, 'weighbridge', P), netto = sum_(wb, 'netto_final_kg');
  var spb = tx_(ctx, 'deliveries', P);
  var mp = tx_(ctx, 'mill_prod', P), ffb = sum_(mp, 'ffb_processed_kg');
  var hvAll = hv.length ? hv : [];
  var series = groupBy_(hvAll, function (r) { return String(r.h_date).substr(0, 10); });
  var dates = []; for (var i = 0; i < Math.min(days, 92); i++) { var dd = new Date(P.from); dd.setDate(dd.getDate() + i); dates.push(Utilities.formatDate(dd, APP.TZ, 'yyyy-MM-dd')); }
  var byEst = groupBy_(hv, function (r) { return r.estate_code; });
  var estName = {}; rowsOf_('estates').forEach(function (e) { estName[e.code] = e.name; });
  var cost = sum_(tx_(ctx, 'work_real', P), 'cost_rp') + sum_(tx_(ctx, 'maintenance', P), 'cost') + sum_(tx_(ctx, 'fuel', P), 'cost')
    + tx_(ctx, 'stock_moves', P).filter(function (m) { return m.status === WF.POSTED && OUTFLOW[m.move_type] < 0; }).reduce(function (s, m) { return s + (Number(m.qty) || 0) * (Number(m.unit_cost) || 0); }, 0);
  // stok di bawah minimum
  var alerts = [];
  if (perm_(ctx, 'inv', 'V')) rowsOf_('items').forEach(function (it) { if (Number(it.min_stock) > 0) { var b = stockBal_(it.code); if (b < Number(it.min_stock)) alerts.push({ type: 'Stok', text: it.name + ' (' + it.code + ') saldo ' + r2_(b) + ' ' + it.uom + ' < minimum ' + it.min_stock }); } });
  tx_(ctx, 'permits', all).forEach(function (d) { if (/Kedaluwarsa|Segera/.test(String(d.doc_state))) alerts.push({ type: 'Legal', text: d.title + ' — ' + d.doc_state }); });
  tx_(ctx, 'findings', all).forEach(function (f) { if (f.close_status !== 'Closed' && (f.risk === 'Tinggi' || f.risk === 'Kritis')) alerts.push({ type: 'Audit', text: f.f_no + ': risiko ' + f.risk + ' belum ditutup' }); });
  var pend = apiPending(ctx).length;
  return {
    period: P, generated: now_(), source: 'Sheet M_blocks, M_harvest, M_weighbridge, M_mill_prod, M_stock_moves (status ≥ SUBMITTED' + (P.draft ? ', termasuk DRAFT' : '') + ')',
    kpi: {
      blocks: blocks.length, area_ha: r2_(area, 1), tm_ha: r2_(tmHa, 1), tbm_ha: r2_(sum_(tbm, 'planted_ha'), 1), palms: sum_(blocks, 'palms'),
      harvest_ton: r2_(kg / 1000, 2), janjang: jjg, bjr: jjg ? r2_(kg / jjg, 2) : 0, ton_ha: tmHa ? r2_(kg / 1000 / tmHa, 3) : 0,
      ton_ha_year: tmHa ? r2_(kg / 1000 / tmHa * 365 / days, 2) : 0, restan_jjg: sum_(hv, 'restan_jjg'),
      mentah_pct: jjg ? r2_(sum_(hv, 'mentah') / jjg * 100, 2) : 0, brondolan_kg: sum_(hv, 'brondolan_kg'),
      harvesters: Object.keys(groupBy_(hv, function (r) { return r.harvester_no; })).length,
      spb: spb.length, netto_ton: r2_(netto / 1000, 2), recon_diff_pct: netto ? r2_((kg - netto) / netto * 100, 2) : 0,
      ffb_ton: r2_(ffb / 1000, 2), oer: ffb ? r2_(sum_(mp, 'cpo_kg') / ffb * 100, 2) : 0, ker: ffb ? r2_(sum_(mp, 'kernel_kg') / ffb * 100, 2) : 0,
      cost_rp: Math.round(cost), cost_per_ton: kg ? Math.round(cost / (kg / 1000)) : 0, cost_per_ha: area ? Math.round(cost / area) : 0, pending: pend
    },
    series: dates.map(function (d) { return { d: d, ton: r2_(sum_(series[d] || [], 'kg') / 1000, 2) }; }),
    by_estate: Object.keys(byEst).map(function (e) {
      var ha = sum_(tm.filter(function (b) { return b.estate_code === e; }), 'planted_ha'), t = sum_(byEst[e], 'kg') / 1000;
      return { estate: e, name: estName[e] || e, ton: r2_(t, 2), ton_ha: ha ? r2_(t / ha, 3) : 0 };
    }).sort(function (a, b) { return b.ton - a.ton; }),
    status_mix: ['TBM', 'TM', 'TT', 'Non-Produktif'].map(function (s) { return { s: s, ha: r2_(sum_(blocks.filter(function (b) { return b.crop_status === s; }), 'planted_ha'), 1) }; }),
    alerts: alerts.slice(0, 30)
  };
}

/* ---------------- LAPORAN ---------------- */
function apiReport(ctx, p) {
  need_(ctx, 'rpt', 'V');
  var P = period_(p), type = p.type || 'production', out = { type: type, period: P, generated: now_(), by: ctx.user.name };
  var C = function (k, l, num) { return { k: k, l: l, num: !!num }; };
  if (typeof opsReport_ === 'function' && opsReport_(ctx, type, P, out, C)) return out;
  if (type === 'production') {
    var g = p.group || 'estate_code', hv = tx_(ctx, 'harvest', P), grp = groupBy_(hv, function (r) { return r[g]; });
    var blk = {}; rowsOf_('blocks').forEach(function (b) { blk[b.code] = b; });
    out.title = 'Laporan Produksi TBS per ' + ({ estate_code: 'Estate', division_code: 'Afdeling', block_code: 'Blok', harvester_no: 'Pemanen', h_date: 'Tanggal' }[g] || g);
    out.cols = [C('key', 'Kelompok'), C('records', 'Transaksi', 1), C('janjang', 'Janjang', 1), C('ton', 'Produksi (ton)', 1), C('bjr', 'BJR', 1), C('ha', 'Luas TM (ha)', 1), C('ton_ha', 'Ton/ha', 1), C('restan', 'Restan (jjg)', 1), C('mentah_pct', 'Mentah (%)', 1)];
    out.rows = Object.keys(grp).sort().map(function (k) {
      var rs = grp[k], kg = sum_(rs, 'kg'), j = sum_(rs, 'janjang'), ha = 0;
      if (g === 'block_code' && blk[k]) ha = Number(blk[k].planted_ha) || 0;
      if (g === 'estate_code' || g === 'division_code') ha = sum_(rowsOf_('blocks').filter(function (b) { return String(b[g]) === String(k) && b.crop_status === 'TM'; }), 'planted_ha');
      return { key: k, records: rs.length, janjang: j, ton: r2_(kg / 1000, 3), bjr: j ? r2_(kg / j) : 0, ha: r2_(ha, 2), ton_ha: ha ? r2_(kg / 1000 / ha, 3) : '', restan: sum_(rs, 'restan_jjg'), mentah_pct: j ? r2_(sum_(rs, 'mentah') / j * 100) : 0 };
    });
  } else if (type === 'harvester') {
    var st = getSettings_().premi, hv2 = tx_(ctx, 'harvest', P), emp = {}; rowsOf_('employees').forEach(function (e) { emp[e.emp_no] = e; });
    var byH = groupBy_(hv2, function (r) { return r.harvester_no; });
    out.title = 'Produktivitas & Premi Pemanen (simulasi — formula sesuai Pengaturan Premi)';
    out.cols = [C('emp', 'No. Pemanen'), C('name', 'Nama'), C('days', 'Hari Panen', 1), C('ton', 'Ton', 1), C('kg_day', 'Kg/Hari', 1), C('brd', 'Brondolan (kg)', 1), C('premi', 'Estimasi Premi (Rp)', 1)];
    out.rows = Object.keys(byH).map(function (h) {
      var rs = byH[h], days = Object.keys(groupBy_(rs, function (r) { return r.h_date; })), premi = 0;
      days.forEach(function (d) { var kgd = sum_(rs.filter(function (r) { return r.h_date === d; }), 'kg'); premi += Math.max(0, kgd - st.basis_kg) * st.rate_over; });
      premi += sum_(rs, 'brondolan_kg') * st.rate_brondolan;
      return { emp: h, name: emp[h] ? emp[h].name : '-', days: days.length, ton: r2_(sum_(rs, 'kg') / 1000, 3), kg_day: r2_(sum_(rs, 'kg') / days.length, 1), brd: sum_(rs, 'brondolan_kg'), premi: Math.round(premi) };
    }).sort(function (a, b) { return b.ton - a.ton; });
    out.note = 'Premi adalah simulasi dari parameter Pengaturan (basis ' + st.basis_kg + ' kg/hari). Payroll resmi wajib divalidasi HR & Finance sesuai kebijakan dan regulasi yang berlaku.';
  } else if (type === 'reconcile') {
    var dl = tx_(ctx, 'deliveries', P), hv3 = tx_(ctx, 'harvest', { from: '0000', to: '9999', estate: P.estate, draft: true }), wbs = rowsOf_('weighbridge').filter(function (w) { return w.status !== WF.CANCELLED; });
    out.title = 'Rekonsiliasi Panen → SPB → Timbangan PKS';
    out.cols = [C('spb', 'No. SPB'), C('date', 'Tanggal'), C('estate', 'Estate'), C('mill', 'PKS'), C('jjg', 'Janjang SPB', 1), C('hv_kg', 'Panen Tercatat (kg)', 1), C('est', 'Taksasi (kg)', 1), C('netto', 'Netto PKS (kg)', 1), C('diff', 'Selisih Panen vs PKS (kg)', 1), C('diff_pct', 'Selisih (%)', 1), C('flag', 'Status')];
    out.rows = dl.map(function (d) {
      var w = wbs.filter(function (x) { return x.spb_no === d.spb_no; })[0], hk = sum_(hv3.filter(function (h) { return h.spb_no === d.spb_no; }), 'kg'), n = w ? Number(w.netto_final_kg) : 0;
      var diff = hk && n ? hk - n : '', pct = hk && n ? r2_((hk - n) / n * 100) : '';
      return { spb: d.spb_no, date: d.d_date, estate: d.estate_code, mill: d.mill_code, jjg: d.janjang, hv_kg: hk, est: d.est_kg, netto: n, diff: diff, diff_pct: pct, flag: !w ? 'Belum ditimbang' : !hk ? 'Panen belum ditautkan' : Math.abs(pct) > 5 ? 'Selisih > 5% — investigasi' : 'Cocok' };
    });
  } else if (type === 'mill') {
    var mp = tx_(ctx, 'mill_prod', P); out.title = 'Laporan Produksi PKS (OER/KER)';
    out.cols = [C('p_date', 'Tanggal'), C('mill_code', 'PKS'), C('ffb', 'TBS Olah (ton)', 1), C('cpo', 'CPO (ton)', 1), C('ker_t', 'Kernel (ton)', 1), C('oer', 'OER (%)', 1), C('ker', 'KER (%)', 1), C('op', 'Jam Olah', 1), C('dt', 'Downtime (jam)', 1), C('loss', 'Oil Loss (%)', 1)];
    out.rows = mp.map(function (m) { return { p_date: m.p_date, mill_code: m.mill_code, ffb: r2_(m.ffb_processed_kg / 1000, 3), cpo: r2_(m.cpo_kg / 1000, 3), ker_t: r2_(m.kernel_kg / 1000, 3), oer: m.oer, ker: m.ker, op: m.op_hours, dt: m.downtime_h, loss: m.oil_loss_pct }; });
  } else if (type === 'stock') {
    need_(ctx, 'inv', 'V'); out.title = 'Saldo & Nilai Persediaan (mutasi POSTED, metode harga standar/terakhir)';
    var items = {}; rowsOf_('items').forEach(function (i) { items[i.code] = i; });
    var mv = rowsOf_('stock_moves').filter(function (m) { return m.status === WF.POSTED && inScope_(ctx, sc_('stock_moves'), m) && (!P.estate || m.estate_code === P.estate) && m.m_date <= P.to; });
    var g2 = groupBy_(mv, function (m) { return m.wh_code + '|' + m.item_code; });
    out.cols = [C('wh', 'Gudang'), C('item', 'Barang'), C('name', 'Nama'), C('in', 'Masuk', 1), C('out', 'Keluar', 1), C('bal', 'Saldo', 1), C('uom', 'Satuan'), C('min', 'Minimum', 1), C('value', 'Nilai (Rp)', 1), C('flag', 'Status')];
    out.rows = Object.keys(g2).map(function (k) {
      var rs = g2[k], it = items[rs[0].item_code] || {}, inn = 0, outq = 0;
      rs.forEach(function (m) { var q = Number(m.qty) || 0; if (OUTFLOW[m.move_type] > 0) inn += q; else outq += q; });
      var bal = inn - outq; return { wh: rs[0].wh_code, item: rs[0].item_code, name: it.name || '', in: inn, out: outq, bal: bal, uom: it.uom || '', min: it.min_stock || 0, value: Math.round(bal * (Number(it.price) || 0)), flag: bal < 0 ? 'NEGATIF' : bal < Number(it.min_stock || 0) ? 'Di bawah minimum' : 'OK' };
    });
  } else if (type === 'fert') {
    var yr = String(P.to).substr(0, 4), reco = tx_(ctx, 'fert_reco', { from: '0000', to: '9999', estate: P.estate }).filter(function (r) { return String(r.year) === yr; });
    var app = tx_(ctx, 'fert_app', { from: yr + '-01-01', to: yr + '-12-31', estate: P.estate }), blk2 = {}; rowsOf_('blocks').forEach(function (b) { blk2[b.code] = b; });
    out.title = 'Realisasi Pemupukan vs Rekomendasi Tahun ' + yr;
    out.cols = [C('block', 'Blok'), C('item', 'Pupuk'), C('palms', 'Pokok', 1), C('reco_kg', 'Rekomendasi (kg)', 1), C('real_kg', 'Realisasi (kg)', 1), C('pct', 'Realisasi (%)', 1)];
    out.rows = reco.map(function (r) {
      var palms = Number((blk2[r.block_code] || {}).palms) || 0, need = palms * Number(r.dose_kg_palm), real = sum_(app.filter(function (a) { return a.block_code === r.block_code && a.item_code === r.item_code; }), 'qty_kg');
      return { block: r.block_code, item: r.item_code, palms: palms, reco_kg: r2_(need, 1), real_kg: real, pct: need ? r2_(real / need * 100, 1) : '' };
    });
  } else if (type === 'lsu') {
    var ls = tx_(ctx, 'lsu', { from: '0000', to: '9999', estate: P.estate }); out.title = 'Histori Status Hara LSU per Blok';
    out.cols = [C('block_code', 'Blok'), C('survey_date', 'Tanggal'), C('sample_no', 'Sampel'), C('n_pct', 'N', 1), C('p_pct', 'P', 1), C('k_pct', 'K', 1), C('mg_pct', 'Mg', 1), C('b_ppm', 'B', 1), C('status_hara', 'Status Hara')];
    out.rows = ls.sort(function (a, b) { return (a.block_code + a.survey_date).localeCompare(b.block_code + b.survey_date); });
  } else if (type === 'budget') {
    need_(ctx, 'fin', 'V'); var yr2 = String(P.to).substr(0, 4);
    var bud = tx_(ctx, 'budgets', { from: '0000', to: '9999', estate: P.estate }).filter(function (b) { return String(b.year) === yr2 && [WF.APPROVED, WF.POSTED].indexOf(b.status) > -1; });
    var jr = tx_(ctx, 'journals', { from: yr2 + '-01-01', to: P.to, estate: P.estate }).filter(function (j) { return j.status === WF.POSTED; }), act = {};
    jr.forEach(function (j) { JSON.parse(chunkGet_(j.lines) || '[]').forEach(function (l) { var k = (l.cc || '') + '|' + l.acct; act[k] = (act[k] || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0); }); });
    out.title = 'Budget vs Actual ' + yr2 + ' (anggaran disetujui vs jurnal POSTED)';
    out.cols = [C('estate', 'Estate'), C('cc', 'Cost Center'), C('acct', 'Akun'), C('budget', 'Anggaran (Rp)', 1), C('actual', 'Realisasi (Rp)', 1), C('var', 'Selisih (Rp)', 1), C('pct', 'Serapan (%)', 1)];
    out.rows = bud.map(function (b) { var a = act[b.cost_center + '|' + b.coa_code] || 0; return { estate: b.estate_code, cc: b.cost_center, acct: b.coa_code, budget: b.amount, actual: Math.round(a), var: Math.round(b.amount - a), pct: b.amount ? r2_(a / b.amount * 100, 1) : '' }; });
  } else if (type === 'trial_balance') {
    need_(ctx, 'fin', 'V'); var coa = {}, tb = {}; rowsOf_('coa').forEach(function (a) { coa[a.code] = a; });
    tx_(ctx, 'journals', { from: '0000', to: P.to, estate: P.estate }).filter(function (j) { return j.status === WF.POSTED; }).forEach(function (j) {
      JSON.parse(chunkGet_(j.lines) || '[]').forEach(function (l) { tb[l.acct] = tb[l.acct] || { d: 0, k: 0 }; tb[l.acct].d += Number(l.debit) || 0; tb[l.acct].k += Number(l.credit) || 0; });
    });
    out.title = 'Neraca Saldo (Trial Balance) s.d. ' + P.to;
    out.cols = [C('acct', 'Akun'), C('name', 'Nama'), C('type', 'Tipe'), C('debit', 'Debit', 1), C('credit', 'Kredit', 1), C('saldo', 'Saldo', 1)];
    out.rows = Object.keys(tb).sort().map(function (a) { var c = coa[a] || {}, s = c.normal === 'K' ? tb[a].k - tb[a].d : tb[a].d - tb[a].k; return { acct: a, name: c.name || '', type: c.acc_type || '', debit: r2_(tb[a].d), credit: r2_(tb[a].k), saldo: r2_(s) }; });
  } else if (type === 'quality') {
    var hq = tx_(ctx, 'harvest', P), gq = groupBy_(hq, function (r) { return r.division_code; });
    out.title = 'Mutu Buah per Afdeling'; out.cols = [C('div', 'Afdeling'), C('jjg', 'Janjang', 1), C('mentah', 'Mentah (%)', 1), C('lewat', 'Lewat Matang (%)', 1), C('brd', 'Brondolan (kg)', 1), C('restan', 'Restan (jjg)', 1)];
    out.rows = Object.keys(gq).map(function (k) { var rs = gq[k], j = sum_(rs, 'janjang'); return { div: k, jjg: j, mentah: j ? r2_(sum_(rs, 'mentah') / j * 100) : 0, lewat: j ? r2_(sum_(rs, 'lewat_matang') / j * 100) : 0, brd: sum_(rs, 'brondolan_kg'), restan: sum_(rs, 'restan_jjg') }; });
  } else if (type === 'attendance') {
    var at = tx_(ctx, 'attendance', P), ga = groupBy_(at, function (r) { return r.estate_code + '|' + r.a_date; });
    out.title = 'Rekap Kehadiran Tenaga Kerja'; out.cols = [C('estate', 'Estate'), C('date', 'Tanggal'), C('H', 'Hadir', 1), C('S', 'Sakit', 1), C('I', 'Izin', 1), C('C', 'Cuti', 1), C('M', 'Mangkir', 1), C('hk', 'Total HK', 1), C('ot', 'Lembur (jam)', 1)];
    out.rows = Object.keys(ga).sort().map(function (k) { var rs = ga[k], o = { estate: k.split('|')[0], date: k.split('|')[1], hk: sum_(rs, 'hk'), ot: sum_(rs, 'ot_hours') }; ['H', 'S', 'I', 'C', 'M'].forEach(function (s) { o[s] = rs.filter(function (r) { return r.att === s; }).length; }); return o; });
  } else if (type === 'compliance') {
    out.title = 'Register Legal, Perizinan & Temuan';
    out.cols = [C('kind', 'Jenis'), C('code', 'Nomor'), C('title', 'Judul/Temuan'), C('estate', 'Unit'), C('state', 'Status'), C('due', 'Tgl Berakhir/Batas')];
    out.rows = tx_(ctx, 'permits', { from: '0000', to: '9999', estate: P.estate }).map(function (d) { return { kind: d.doc_type, code: d.doc_no, title: d.title, estate: d.estate_code, state: d.doc_state, due: d.expiry_date }; })
      .concat(tx_(ctx, 'findings', { from: '0000', to: '9999', estate: P.estate, draft: true }).map(function (f) { return { kind: 'Temuan ' + f.source, code: f.f_no, title: String(f.finding).substr(0, 120), estate: f.estate_code, state: f.close_status + ' / ' + f.risk, due: f.due_date }; }));
  } else throw err_('Jenis laporan tidak dikenal', 'VALID');
  out.totals = {}; (out.cols || []).forEach(function (c) { if (c.num && !/pct|bjr|oer|ker|ton_ha|kg_day|mentah|lewat|loss/.test(c.k)) out.totals[c.k] = r2_(sum_(out.rows, c.k), 3); });
  out.source = 'PALM OS — ' + ss_().getName() + ' (ID ' + ss_().getId().substr(0, 8) + '…)';
  return out;
}

/* ---------------- DATA PETA ---------------- */
function apiMapData(ctx, p) {
  need_(ctx, 'gis', 'V');
  var P = period_(p || {}), hv = tx_(ctx, 'harvest', P), byB = groupBy_(hv, function (r) { return r.block_code; });
  var lsu = {}; tx_(ctx, 'lsu', { from: '0000', to: '9999' }).forEach(function (l) { if (!lsu[l.block_code] || l.survey_date > lsu[l.block_code].d) lsu[l.block_code] = { d: l.survey_date, s: l.status_hara }; });
  var feats = [];
  tx_(ctx, 'blocks', { from: '0000', to: '9999', estate: P.estate }).forEach(function (b) {
    var g = chunkGet_(b.geom); if (!g) return;
    try { g = JSON.parse(g); } catch (e) { return; }
    var geom = g.type === 'Feature' ? g.geometry : g.type === 'FeatureCollection' ? (g.features[0] || {}).geometry : g;
    var t = sum_(byB[b.code] || [], 'kg') / 1000;
    feats.push({ type: 'Feature', geometry: geom, properties: { code: b.code, estate: b.estate_code, division: b.division_code, ha: Number(b.planted_ha) || 0, year: b.planting_year, status: b.crop_status, variety: b.variety, palms: b.palms, sph: b.sph, ton: r2_(t, 2), ton_ha: Number(b.planted_ha) ? r2_(t / b.planted_ha, 3) : 0, lsu: lsu[b.code] ? lsu[b.code].s : '' } });
  });
  var pts = [];
  [['pest', 'Hama/Penyakit', 'type'], ['k3', 'K3/Kebakaran', 'inc_type'], ['work_real', 'Realisasi Kerja', 'wo_no'], ['harvest', 'TPH Panen', 'tph'], ['lsu', 'Titik LSU', 'sample_no']].forEach(function (x) {
    tx_(ctx, x[0], { from: '0000', to: '9999', estate: P.estate, draft: true }).forEach(function (r) {
      if (!r.gps) return; var g; try { g = JSON.parse(chunkGet_(r.gps)); } catch (e) { return; }
      if (g && isFinite(g.lat) && isFinite(g.lng)) pts.push({ layer: x[1], lat: g.lat, lng: g.lng, acc: g.acc || '', label: String(r[x[2]] || ''), block: r.block_code || '', date: dateOf_(sc_(x[0]), r) });
    });
  });
  return { blocks: { type: 'FeatureCollection', features: feats }, points: pts.slice(0, 5000), period: P };
}

/* ---------------- FORECAST & ANOMALI (statistik, bukan klaim AI) ---------------- */
function apiForecast(ctx, p) {
  need_(ctx, 'ai', 'V');
  var hv = tx_(ctx, 'harvest', { from: '0000', to: '9999', estate: p.estate || '' }), m = groupBy_(hv, function (r) { return String(r.h_date).substr(0, 7); });
  var months = Object.keys(m).sort().slice(-24), ys = months.map(function (k) { return sum_(m[k], 'kg') / 1000; });
  var res = { method: 'Regresi linear + rata-rata musiman sederhana atas produksi bulanan (ton)', history: months.map(function (k, i) { return { m: k, ton: r2_(ys[i], 2) }; }), forecast: [], caveat: '' };
  if (months.length < 3) { res.caveat = 'Data historis kurang dari 3 bulan — forecast belum dapat dihitung secara layak.'; }
  else {
    var n = ys.length, xs = ys.map(function (_, i) { return i; }), mx = (n - 1) / 2, my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
    var sxy = 0, sxx = 0; xs.forEach(function (x, i) { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
    var b = sxx ? sxy / sxx : 0, a = my - b * mx, ssr = 0, sst = 0;
    ys.forEach(function (y, i) { var f = a + b * i; ssr += (y - f) * (y - f); sst += (y - my) * (y - my); });
    var rmse = Math.sqrt(ssr / n), last = months[n - 1].split('-');
    for (var k = 1; k <= (Number(p.months) || 3); k++) {
      var d = new Date(Number(last[0]), Number(last[1]) - 1 + k, 1), key = Utilities.formatDate(d, APP.TZ, 'yyyy-MM'), base = a + b * (n - 1 + k);
      var same = months.filter(function (mm) { return mm.substr(5) === key.substr(5); }).map(function (mm) { return ys[months.indexOf(mm)]; });
      if (same.length) base = 0.6 * base + 0.4 * (same.reduce(function (x, y) { return x + y; }, 0) / same.length);
      res.forecast.push({ m: key, ton: r2_(Math.max(0, base), 2), low: r2_(Math.max(0, base - 1.96 * rmse), 2), high: r2_(base + 1.96 * rmse, 2) });
    }
    res.r2 = sst ? r2_(1 - ssr / sst, 3) : 0; res.rmse = r2_(rmse, 2);
    res.caveat = 'Estimasi statistik dari ' + n + ' bulan data tervalidasi. Tidak memperhitungkan curah hujan, umur tanaman, atau pemupukan. Wajib ditinjau agronomist sebelum dipakai untuk perencanaan.';
  }
  // Anomali: z-score kg/hari per pemanen
  var day = groupBy_(hv.filter(function (r) { return r.h_date >= period_({}).from; }), function (r) { return r.harvester_no + '|' + r.h_date; }), vals = Object.keys(day).map(function (k) { return { k: k, kg: sum_(day[k], 'kg') }; });
  var mu = vals.reduce(function (s, v) { return s + v.kg; }, 0) / (vals.length || 1), sd = Math.sqrt(vals.reduce(function (s, v) { return s + Math.pow(v.kg - mu, 2); }, 0) / (vals.length || 1));
  res.anomalies = sd ? vals.filter(function (v) { return Math.abs(v.kg - mu) / sd > 2.5; }).map(function (v) { return { harvester: v.k.split('|')[0], date: v.k.split('|')[1], kg: v.kg, z: r2_((v.kg - mu) / sd, 2) }; }) : [];
  res.anomaly_method = 'Z-score kg/hari per pemanen 30 hari terakhir, ambang |z| > 2,5 (rata-rata ' + r2_(mu, 1) + ' kg, SD ' + r2_(sd, 1) + ')';
  // Kandidat replanting: TM > 25 tahun atau produktivitas rendah
  var yr = Number(today_().substr(0, 4));
  res.replanting = tx_(ctx, 'blocks', { from: '0000', to: '9999', estate: p.estate || '' }).filter(function (b) { return b.planting_year && yr - b.planting_year >= 25; }).map(function (b) { return { block: b.code, estate: b.estate_code, age: yr - b.planting_year, ha: b.planted_ha }; });
  return res;
}

/** AI Assistant: memakai Gemini bila GEMINI_API_KEY diset & diaktifkan; jika tidak, jawaban berbasis aturan dari data. */
function apiAiAsk(ctx, p) {
  need_(ctx, 'ai', 'V');
  var q = String(p.q || '').substr(0, 800); if (!q) throw err_('Pertanyaan kosong', 'VALID');
  var d = apiDashboard(ctx, {}), k = d.kpi;
  var facts = 'Periode ' + d.period.from + ' s.d. ' + d.period.to + '. Luas tanam ' + k.area_ha + ' ha (TM ' + k.tm_ha + ', TBM ' + k.tbm_ha + '). Produksi ' + k.harvest_ton + ' ton, ' + k.janjang + ' janjang, BJR ' + k.bjr + ', ton/ha periode ' + k.ton_ha + ' (setara ' + k.ton_ha_year + ' ton/ha/th). Restan ' + k.restan_jjg + ' jjg, buah mentah ' + k.mentah_pct + '%. Netto PKS ' + k.netto_ton + ' ton, selisih panen vs PKS ' + k.recon_diff_pct + '%. OER ' + k.oer + '%, KER ' + k.ker + '%. Biaya tercatat Rp ' + fmtNum_(k.cost_rp) + ' (Rp ' + fmtNum_(k.cost_per_ton) + '/ton). Produksi per estate: ' + d.by_estate.map(function (e) { return e.estate + ' ' + e.ton + ' t (' + e.ton_ha + ' t/ha)'; }).join('; ') + '. Peringatan: ' + d.alerts.map(function (a) { return a.text; }).join('; ');
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'), st = getSettings_();
  if (key && st.ai_enabled && !isDemo_()) {
    var model = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-2.0-flash';
    var body = { contents: [{ role: 'user', parts: [{ text: 'Anda asisten analis perkebunan kelapa sawit. Jawab dalam Bahasa Indonesia, ringkas, hanya berdasarkan FAKTA berikut; jika data tidak cukup katakan tidak cukup. Pisahkan fakta, analisis, dan rekomendasi; rekomendasi agronomi wajib diverifikasi ahli.\nFAKTA: ' + facts + '\nPERTANYAAN: ' + q }] }] };
    var resp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      var j = JSON.parse(resp.getContentText()), txt = (((j.candidates || [])[0] || {}).content || {}).parts;
      audit_(ctx, 'AI_ASK', 'ai', '', null, { q: q.substr(0, 200) });
      return { answer: txt ? txt.map(function (x) { return x.text; }).join('\n') : '(kosong)', engine: 'Gemini ' + model + ' (data agregat, tanpa data pribadi)', facts: facts };
    }
    return { answer: 'Layanan AI eksternal gagal (HTTP ' + resp.getResponseCode() + '). Menampilkan ringkasan data:\n' + facts, engine: 'Fallback aturan', facts: facts };
  }
  var ql = q.toLowerCase(), ans = [];
  if (/produksi|panen|ton|turun|naik/.test(ql)) ans.push('Produksi periode ini ' + k.harvest_ton + ' ton (BJR ' + k.bjr + ', ' + k.ton_ha_year + ' ton/ha/th). Estate tertinggi: ' + (d.by_estate[0] ? d.by_estate[0].estate + ' ' + d.by_estate[0].ton + ' t' : '-') + '; terendah: ' + (d.by_estate.length ? d.by_estate[d.by_estate.length - 1].estate + ' ' + d.by_estate[d.by_estate.length - 1].ton + ' t' : '-') + '.');
  if (/restan|mutu|mentah/.test(ql)) ans.push('Restan ' + k.restan_jjg + ' janjang dan buah mentah ' + k.mentah_pct + '%. Periksa laporan Mutu Buah per Afdeling untuk lokasi penyebabnya.');
  if (/pks|oer|ker|rendemen|pabrik/.test(ql)) ans.push('OER ' + k.oer + '% dan KER ' + k.ker + '% dari ' + k.ffb_ton + ' ton TBS olah. Selisih panen vs netto PKS ' + k.recon_diff_pct + '%.');
  if (/biaya|cost|anggaran/.test(ql)) ans.push('Biaya operasional tercatat Rp ' + fmtNum_(k.cost_rp) + ' (Rp ' + fmtNum_(k.cost_per_ton) + '/ton, Rp ' + fmtNum_(k.cost_per_ha) + '/ha). Lihat laporan Budget vs Actual untuk per cost center.');
  if (/stok|pupuk|gudang|izin|audit|peringatan/.test(ql)) ans.push(d.alerts.length ? 'Peringatan aktif: ' + d.alerts.slice(0, 8).map(function (a) { return a.text; }).join('; ') : 'Tidak ada peringatan stok/legal/audit aktif.');
  if (/replant|tua|umur/.test(ql)) ans.push('Lihat tab Forecast → Kandidat Replanting (blok berumur ≥ 25 tahun).');
  if (!ans.length) ans.push('Ringkasan data: ' + facts);
  return { answer: ans.join('\n\n'), engine: 'Analitik berbasis aturan (AI eksternal belum diaktifkan)', facts: facts };
}


/* ===== Workflow.gs ===== */
/**
 * PALM OS ENTERPRISE — Workflow.gs
 * Workflow administrasi perkebunan: Cuti (kalender kerja Kebun/Region Sen-Sab vs Head Office Sen-Jum,
 * tidak memotong hari libur & libur nasional), Izin, Lembur (SPL), Perjalanan Dinas (SPPD + Surat Tugas),
 * Deklarasi biaya dinas, Uang Muka/Kasbon, Pengadaan Barang & Jasa, Bon Permintaan Barang Gudang,
 * Klaim Pengobatan/Reimburse, Permintaan Kendaraan Dinas.
 * Persetujuan per ORANG: atasan langsung -> atasan ke-2 (opsional) -> pihak terkait (HRD/Keuangan/Pengadaan/...).
 * Approver dapat menyetujui lewat tautan WhatsApp/email tanpa login (token sekali pakai, kedaluwarsa).
 * Integrasi: absensi (C/S/I + lembur), Purchase Request, Mutasi Stok gudang, Pusat Persetujuan, notifikasi.
 * Aturan muat: tidak ada referensi ke berkas lain di level atas.
 */
var WFX_SHEET = { REQ: 'WF_Requests', TOK: 'WF_Tokens', DEL: 'WF_Delegations' };
var WFX_COLS = ['id', 'code', 'type', 'status', 'emp_no', 'emp_name', 'estate_code', 'work_cal', 'title', 'date_from', 'date_to', 'days', 'amount', 'ref_code', 'payload', 'steps', 'cur', 'attach', 'integ', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'deleted'];
var WFX_TOK_COLS = ['id', 'token_hash', 'req_id', 'step', 'who', 'who_name', 'expires_at', 'used_at', 'created_at'];
var WFX_DEL_COLS = ['id', 'from_user', 'to_user', 'date_from', 'date_to', 'note', 'active', 'created_at'];

var WFX_TYPES = {
  CUTI: { t: 'Cuti Karyawan', p: 'CT', steps: ['SPV1', 'SPV2?', 'HR'] },
  IZIN: { t: 'Izin / Keluar Kebun', p: 'IZ', steps: ['SPV1'] },
  LEMBUR: { t: 'Surat Perintah Lembur (SPL)', p: 'SPL', steps: ['SPV1', 'HR'] },
  SPPD: { t: 'Perjalanan Dinas (SPPD)', p: 'SPPD', steps: ['SPV1', 'SPV2?', 'HR', 'FIN$'] },
  DEKLARASI: { t: 'Deklarasi Biaya Perjalanan Dinas', p: 'DKL', steps: ['SPV1', 'FIN'] },
  KASBON: { t: 'Uang Muka / Kasbon Operasional', p: 'UM', steps: ['SPV1', 'SPV2?', 'FIN'] },
  PENGADAAN: { t: 'Pengadaan Barang & Jasa', p: 'PP', steps: ['SPV1', 'SPV2?', 'PROC', 'LIMIT'] },
  BON: { t: 'Bon Permintaan Barang Gudang', p: 'BPB', steps: ['SPV1', 'WH'] },
  KLAIM: { t: 'Klaim Pengobatan / Reimburse', p: 'KLM', steps: ['SPV1', 'HR', 'FIN'] },
  KENDARAAN: { t: 'Permintaan Kendaraan Dinas', p: 'KDR', steps: ['SPV1', 'GA'] },
  HAKCUTI: { t: 'Klaim Hak Cuti Pengganti', p: 'HCP', steps: ['SPV1', 'HR'] },
  BAYARCP: { t: 'Pencairan Insentif Sisa Cuti Pengganti', p: 'ICP', steps: ['SPV1', 'HR', 'FIN'] }
};
var WFX_POOLS = {
  HR: { t: 'HRD / Personalia', roles: ['HR_OFFICER', 'KTU'] },
  FIN: { t: 'Keuangan', roles: ['FIN_OFFICER', 'REG_CONTROLLER'] },
  PROC: { t: 'Pengadaan', roles: ['PROC_OFFICER'] },
  WH: { t: 'Gudang', roles: ['WAREHOUSE', 'KTU'] },
  GA: { t: 'GA / Traksi', roles: ['KTU', 'CORP_ADMIN'] },
  DIR: { t: 'Direksi', roles: ['DIRECTOR'] },
  LIMIT: { t: 'Pejabat Berwenang (sesuai nilai)', roles: [] }
};
var WFX_VIEW_ALL = ['SUPER_ADMIN', 'DIRECTOR', 'CORP_ADMIN', 'HR_OFFICER', 'FIN_OFFICER', 'PROC_OFFICER', 'AUDITOR', 'REG_CONTROLLER', 'REG_MANAGER', 'ESTATE_MANAGER', 'KTU'];

/* ---------------- UTIL ---------------- */
function wfxD_(s) { return String(s || '').substr(0, 10); }
function wfxDow_(ds) { return new Date(ds + 'T00:00:00Z').getUTCDay(); }
function wfxDates_(from, to) {
  var out = [], a = new Date(wfxD_(from) + 'T00:00:00Z'), b = new Date(wfxD_(to) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return out;
  for (var d = a, n = 0; d <= b && n < 400; d = new Date(d.getTime() + 86400000), n++) out.push(d.toISOString().substr(0, 10));
  return out;
}
function wfxJ_(v, def) { if (v && typeof v === 'object') return v; try { var s = chunkGet_(v); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
function wfxPhone_(p) { var s = String(p || '').replace(/[^0-9+]/g, '').replace(/^\+/, ''); if (!s) return ''; if (s.indexOf('0') === 0) s = '62' + s.substr(1); return /^62[0-9]{8,13}$/.test(s) ? s : ''; }
function wfxRp_(n) { return 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function wfxDateId_(ds) { var b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], p = wfxD_(ds).split('-'); return p.length === 3 ? Number(p[2]) + ' ' + b[Number(p[1]) - 1] + ' ' + p[0] : ds; }
function wfxEsc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function wfxConf_() {
  if (_memo.wfxConf) return _memo.wfxConf;
  var st = getSettings_(), D = DEFAULT_SETTINGS.wf_conf, c = Object.assign({}, D, st.wf_conf || {}), lt = (st.leave_types || DEFAULT_SETTINGS.leave_types).slice();
  c.comp = Object.assign({}, D.comp, (st.wf_conf || {}).comp || {}); c.comp.pay_rate = Object.assign({}, D.comp.pay_rate, c.comp.pay_rate || {});
  c.fin_types = Object.assign({}, D.fin_types, (st.wf_conf || {}).fin_types || {});
  DEFAULT_SETTINGS.leave_types.forEach(function (x) { if ((x.comp || x.c === 'CT') && !lt.some(function (y) { return y.c === x.c; })) lt.push(x); });
  _memo.wfxConf = { cal: st.work_calendars || DEFAULT_SETTINGS.work_calendars, lt: lt, c: c, routes: st.wf_routes || {}, limits: st.approval_limits || {} };
  return _memo.wfxConf;
}
function wfxGrade_(emp) { var j = String((emp && (emp.job_title || emp.position)) || ''); return /direk/i.test(j) ? 'Direksi' : /manaj|manager/i.test(j) ? 'Manajer' : /asisten|kepala|kasie|kabag/i.test(j) ? 'Asisten' : 'Staf'; }
/** Saldo cuti pengganti (kompensasi), FIFO terhadap tanggal kedaluwarsa. */
function wfxCompBalance_(emp, excludeId) {
  var today = today_(), credits = [], uses = [], pend = 0;
  wfxRows_().forEach(function (r) {
    if (r.emp_no !== emp.emp_no || r.id === excludeId) return;
    var p = wfxJ_(r.payload, {});
    if (r.type === 'HAKCUTI' && r.status === 'APPROVED') credits.push({ code: r.code, days: Number(r.days) || 0, at: wfxD_(p.granted_at || r.updated_at), exp: wfxD_(p.expires || '9999-12-31'), left: Number(r.days) || 0 });
    var isUse = (r.type === 'CUTI' && (wfxLt_(p.leave_type) || {}).comp) || r.type === 'BAYARCP';
    if (isUse && ['APPROVED', 'SUBMITTED'].indexOf(r.status) > -1) { uses.push({ d: Number(r.days) || 0, at: wfxD_(r.created_at) }); if (r.status === 'SUBMITTED') pend += Number(r.days) || 0; }
  });
  credits.sort(function (a, b) { return a.exp < b.exp ? -1 : 1; }); uses.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  uses.forEach(function (u) { var need = u.d; credits.forEach(function (c) { if (need <= 0 || c.left <= 0 || c.exp < u.at) return; var t = Math.min(need, c.left); c.left -= t; need -= t; }); });
  var avail = 0, expired = 0, earned = 0, next = null;
  credits.forEach(function (c) { earned += c.days; if (c.exp < today) expired += c.left; else { avail += c.left; if (c.left > 0 && (!next || c.exp < next.exp)) next = { exp: c.exp, days: c.left }; } });
  return { code: 'CP', t: 'Cuti Pengganti', earned: earned, used: earned - avail - expired, pending: pend, expired: expired, available: Math.round(avail * 10) / 10, next_exp: next, credits: credits.map(function (c) { return { code: c.code, days: c.days, left: c.left, exp: c.exp }; }) };
}
function wfxLt_(code) { return wfxConf_().lt.filter(function (x) { return x.c === code; })[0] || null; }
function wfxEmp_(no) { return no ? findBy_('employees', 'emp_no', no) : null; }
function wfxEmpByUser_(u) {
  u = String(u || '').toLowerCase(); if (!u) return null;
  var t = table_(sc_('employees').sheet); if (!t._byUser) { t._byUser = {}; t.rows.forEach(function (e) { if (!isDel_(e) && e.username) { var k = String(e.username).toLowerCase(); if (!t._byUser[k]) t._byUser[k] = e; } }); }
  return t._byUser[u] || null;
}
function wfxCalOf_(emp) { var c = String(emp && emp.work_cal || ''); if (c) return c.indexOf('HO') > -1 ? 'HO' : 'KEBUN'; return emp && emp.estate_code ? 'KEBUN' : 'HO'; }
function wfxRegionOf_(emp) { var e = emp && emp.estate_code ? findBy_('estates', 'code', emp.estate_code) : null; return e ? String(e.region_code || '') : ''; }
function wfxBaseUrl_() { var u = ''; try { u = ScriptApp.getService().getUrl() || ''; } catch (e) { } return u || wfxConf_().c.base_url || ''; }

/* ---------------- KALENDER KERJA & HARI LIBUR ---------------- */
function wfxHolidays_(cal, region, from, to) {
  var f = wfxD_(from), t = wfxD_(to), m = {};
  rowsOf_('holidays').forEach(function (h) {
    var d = wfxD_(h.h_date); if (d < f || d > t) return;
    if (h.applies && h.applies !== 'Semua' && h.applies !== cal) return;
    if (h.h_type === 'Libur Daerah' && h.region_code && String(h.region_code) !== String(region || '')) return;
    m[d] = h;
  });
  return m;
}
/** Hitung hari cuti: hari kerja sesuai kalender karyawan, dikurangi libur mingguan & hari libur. */
function wfxLeaveCalc_(emp, ltCode, from, to) {
  var lt = wfxLt_(ltCode); if (!lt) throw err_('Jenis cuti "' + ltCode + '" tidak dikenal', 'VALID');
  var dates = wfxDates_(from, to); if (!dates.length) throw err_('Rentang tanggal cuti tidak valid', 'VALID');
  if (dates.length > 366) throw err_('Rentang cuti maksimal 1 tahun', 'VALID');
  var conf = wfxConf_(), cal = wfxCalOf_(emp), wd = (conf.cal[cal] || conf.cal.KEBUN).days, hol = wfxHolidays_(cal, wfxRegionOf_(emp), from, to), count = [], off = [];
  dates.forEach(function (d) {
    if (lt.u === 'kalender') { count.push(d); return; }
    if (wd.indexOf(wfxDow_(d)) < 0) { off.push({ d: d, why: wfxDow_(d) === 0 ? 'Minggu' : (wfxDow_(d) === 6 ? 'Sabtu (libur ' + cal + ')' : 'Libur mingguan') }); return; }
    if (hol[d]) { off.push({ d: d, why: String(hol[d].name).indexOf(hol[d].h_type) === 0 ? hol[d].name : hol[d].h_type + ': ' + hol[d].name }); return; }
    count.push(d);
  });
  return { days: count.length, dates: count, off: off, cal: cal, calT: (conf.cal[cal] || {}).t || cal, lt: lt };
}
/** Saldo cuti tahunan (atau jenis berkuota tahunan) untuk tahun tertentu. */
function wfxBalance_(emp, code, year, excludeId) {
  var lt = wfxLt_(code || 'CT') || { c: 'CT', q: 12, yearly: 1, ded: 1 }, y = String(year), used = 0, pend = 0, bersama = 0;
  wfxRows_().forEach(function (r) {
    if (r.type !== 'CUTI' || r.emp_no !== emp.emp_no || r.id === excludeId || ['APPROVED', 'SUBMITTED'].indexOf(r.status) < 0) return;
    var p = wfxJ_(r.payload, {}), l2 = wfxLt_(p.leave_type) || {};
    var counts = p.leave_type === lt.c || (lt.c === 'CT' && l2.ded && p.leave_type !== 'CT');
    if (!counts || wfxD_(r.date_from).substr(0, 4) !== y) return;
    if (r.status === 'APPROVED') used += Number(r.days) || 0; else pend += Number(r.days) || 0;
  });
  if (lt.c === 'CT') {
    var cal = wfxCalOf_(emp), wd = (wfxConf_().cal[cal] || {}).days || [1, 2, 3, 4, 5, 6], hol = wfxHolidays_(cal, wfxRegionOf_(emp), y + '-01-01', y + '-12-31');
    Object.keys(hol).forEach(function (d) { if (hol[d].deduct === 'Ya' && wd.indexOf(wfxDow_(d)) > -1) bersama++; });
  }
  var elig = true, msg = '';
  if (lt.min && emp.join_date) {
    var j = new Date(wfxD_(emp.join_date) + 'T00:00:00Z'), ok = new Date(j.getTime()); ok.setUTCMonth(ok.getUTCMonth() + Number(lt.min));
    if (ok > new Date(y + '-12-31T00:00:00Z')) { elig = false; msg = 'Masa kerja belum ' + lt.min + ' bulan (berhak mulai ' + ok.toISOString().substr(0, 10) + ')'; }
  }
  var q = Number(lt.q) || 0;
  return { code: lt.c, t: lt.t, quota: q, used: used, pending: pend, bersama: bersama, remain: q ? q - used - pend - bersama : null, eligible: elig, msg: msg, year: y };
}

/* ---------------- DATA ---------------- */
function wfxRows_() { var t = table_(WFX_SHEET.REQ); if (!t._live) t._live = t.rows.filter(function (r) { return !isDel_(r); }); return t._live; }
function wfxFind_(id) { return wfxRows_().filter(function (r) { return r.id === id || r.code === id; })[0] || null; }
function wfxFull_(r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.payload = wfxJ_(r.payload, {}); o.steps = wfxJ_(r.steps, []); o.attach = wfxJ_(r.attach, []); o.integ = wfxJ_(r.integ, []); o.cur = Number(r.cur) || 0; return o; }
function wfxWrite_(o, existing) {
  var rec = {}; WFX_COLS.forEach(function (k) { rec[k] = o[k]; });
  ['payload', 'steps', 'attach', 'integ'].forEach(function (k) { if (rec[k] && typeof rec[k] === 'object') rec[k] = JSON.stringify(rec[k]); });
  if (existing) {
    ['payload', 'steps', 'attach', 'integ'].forEach(function (k) { var old = existing[k]; if (typeof old === 'string' && old.indexOf('@@CHUNK:') === 0 && old !== rec[k]) chunkDelete_(old); });
    updateObj_(WFX_SHEET.REQ, existing._row, rec);
  } else appendObj_(WFX_SHEET.REQ, WFX_COLS, rec);
}
function wfxNextCode_(type) {
  var pfx = WFX_TYPES[type].p + '/' + Utilities.formatDate(new Date(), APP.TZ, 'yyyy/MM') + '/', n = 0;
  table_(WFX_SHEET.REQ).rows.forEach(function (r) { var c = String(r.code || ''); if (c.indexOf(pfx) === 0) n = Math.max(n, Number(c.substr(pfx.length)) || 0); });
  return pfx + ('000' + (n + 1)).slice(-4);
}
function wfxLog_(ctx, req, action, from, to, note) {
  appendObj_(SYS.APPR, ['id', 'ts', 'module', 'rec_id', 'action', 'from_status', 'to_status', 'user', 'role', 'comment'], { id: uid_(), ts: now_(), module: 'wfx:' + req.type, rec_id: req.id, action: action, from_status: from, to_status: to, user: ctx ? ctx.user.username : 'wa', role: ctx ? ctx.user.role : 'WA', comment: note || '' });
}

/* ---------------- RUTE PERSETUJUAN ---------------- */
function wfxUserCovers_(u, emp) {
  if (!truthy_(u.active)) return false;
  var st = u.scope_type || 'ALL'; if (u.role === 'SUPER_ADMIN' || u.role === 'DIRECTOR' || st === 'ALL') return true;
  var est = String(emp.estate_code || ''); if (!est) return false;
  var ctx = buildCtx_(u, ''); return !!(ctx.estates && ctx.estates[est]);
}
function wfxPool_(roles, emp, exclude) {
  return users_().filter(function (u) { return roles.indexOf(u.role) > -1 && wfxUserCovers_(u, emp) && exclude.indexOf(String(u.username).toLowerCase()) < 0; })
    .map(function (u) { return String(u.username).toLowerCase(); });
}
function wfxLimitPool_(amount, emp, exclude, g) {
  var lim = wfxConf_().limits, cands = Object.keys(lim).filter(function (r) { var R = ROLES[r] || { all: '' }, L = g && R[g] !== undefined ? R[g] : R.all; return (lim[r] === -1 || Number(lim[r]) >= amount) && (r === 'SUPER_ADMIN' || !g || L.indexOf('P') > -1); });
  cands.sort(function (a, b) { var x = lim[a] === -1 ? 1e18 : lim[a], y = lim[b] === -1 ? 1e18 : lim[b]; return x - y; });
  for (var i = 0; i < cands.length; i++) {
    var lvl = lim[cands[i]], roles = cands.filter(function (r) { return lim[r] === lvl; }), pool = wfxPool_(roles, emp, exclude);
    if (pool.length) return { users: pool, t: 'Pejabat Berwenang (' + roles.map(function (r) { return (ROLES[r] || {}).t || r; }).join(' / ') + ')' };
  }
  return { users: [], t: 'Pejabat Berwenang' };
}
function wfxRoute_(type, emp, amount, opt, requester) {
  var conf = wfxConf_(), def = (conf.routes[type] && conf.routes[type].length ? conf.routes[type] : WFX_TYPES[type].steps).slice(), steps = [], seen = {}, ex = [String(requester || '').toLowerCase(), String(emp.username || '').toLowerCase()].filter(String);
  var finOn = conf.c.fin_types[type], isFin = function (k) { return String(k).replace(/[?$]/g, '') === 'FIN'; };
  if (finOn === false) def = def.filter(function (k) { return !isFin(k); });
  else if (finOn === true && Number(amount) > 0 && Number(amount) >= (Number(conf.c.fin_min) || 0) && !def.some(isFin)) def.push('FIN$');
  def.forEach(function (k0) {
    var k = String(k0).replace(/[?$]/g, ''), optional = k0.indexOf('?') > -1, money = k0.indexOf('$') > -1;
    if (money && !(Number(amount) > 0)) return;
    var st = { k: k, st: 'WAIT', users: [], by: '', via: '', at: '', note: '' };
    if (k === 'SPV1' || k === 'SPV2') {
      if (k === 'SPV2' && opt && opt.spv2 === false) return;
      var sno = k === 'SPV1' ? emp.supervisor : emp.supervisor2, s = wfxEmp_(sno);
      if (!s) { if (optional) return; throw err_('Atasan langsung untuk ' + emp.name + ' belum diisi di data Karyawan. Hubungi HRD/Admin.', 'ROUTE'); }
      if (String(s.active || 'Ya') === 'Tidak') { if (optional) return; throw err_('Atasan ' + s.name + ' berstatus nonaktif. Perbarui data atasan di Karyawan.', 'ROUTE'); }
      st.t = k === 'SPV1' ? 'Atasan Langsung' : 'Atasan ke-2'; st.emp = s.emp_no; st.name = s.name + (s.job_title ? ' (' + s.job_title + ')' : '');
      if (s.username && ex.indexOf(String(s.username).toLowerCase()) < 0) st.users = [String(s.username).toLowerCase()];
      if (seen['E:' + s.emp_no]) return; seen['E:' + s.emp_no] = 1;
    } else if (k === 'LIMIT') {
      var lp = wfxLimitPool_(Number(amount) || 0, emp, ex, { PENGADAAN: 'proc', KASBON: 'fin', KLAIM: 'fin', SPPD: 'fin' }[type]), prev = [].concat.apply([], steps.map(function (x) { return x.users; }));
      if (lp.users.some(function (u) { return prev.indexOf(u) > -1; })) return;
      st.t = lp.t; st.users = lp.users; st.name = wfxNames_(lp.users);
    } else {
      var pd = WFX_POOLS[k]; if (!pd) throw err_('Langkah rute "' + k + '" tidak dikenal', 'ROUTE');
      st.t = pd.t; st.users = wfxPool_(pd.roles, emp, ex);
      if (!st.users.length) { st.users = wfxPool_(['SUPER_ADMIN', 'CORP_ADMIN', 'DIRECTOR'], emp, ex); st.note = 'Tidak ada pengguna ' + pd.t + ' untuk unit ini; dialihkan ke Administrator'; }
      if (!st.users.length && k !== 'HR') { st.users = wfxPool_(WFX_POOLS.HR.roles, emp, ex); st.note = 'Tidak ada pengguna ' + pd.t + '/Administrator lain; sementara dialihkan ke HRD'; }
      st.name = wfxNames_(st.users);
    }
    if (!st.users.length && !st.emp) { if (optional) return; throw err_('Tidak ada approver untuk langkah "' + (st.t || k) + '". Atur pengguna/role terkait.', 'ROUTE'); }
    var sig = st.emp ? 'E:' + st.emp : 'U:' + st.users.join(',');
    var pv = steps[steps.length - 1];
    if (pv && (pv.emp ? 'E:' + pv.emp : 'U:' + pv.users.join(',')) === sig) { if (pv.t.indexOf(st.t) < 0) pv.t += ' + ' + st.t; return; }
    steps.push(st);
  });
  if (!steps.length) throw err_('Rute persetujuan kosong', 'ROUTE');
  steps[0].st = 'PEND'; return steps;
}
function wfxNames_(us) { return us.map(function (u) { var e = wfxEmpByUser_(u), x = userBy_('username', u); return (e && e.name) || (x && x.name) || u; }).join(', '); }
function wfxDelegatesFor_(users) {
  var today = today_(), out = [], t = table_(WFX_SHEET.DEL); if (!t.rows.length) return out;
  t.rows.forEach(function (d) { if (truthy_(d.active) && users.indexOf(String(d.from_user).toLowerCase()) > -1 && wfxD_(d.date_from) <= today && wfxD_(d.date_to) >= today) out.push(String(d.to_user).toLowerCase()); });
  return out;
}
function wfxCanAct_(ctx, req, allowOverride) {
  if (req.status !== 'SUBMITTED') return false;
  var s = req.steps[req.cur]; if (!s || s.st !== 'PEND') return false;
  var me = String(ctx.user.username).toLowerCase();
  if (me === String(req.created_by).toLowerCase()) return false;
  if (s.users.indexOf(me) > -1) return true;
  if (wfxDelegatesFor_(s.users).indexOf(me) > -1) return true;
  return allowOverride && ctx.user.role === 'SUPER_ADMIN' ? 'override' : false;
}
function wfxCanView_(ctx, req) {
  var me = String(ctx.user.username).toLowerCase();
  if (me === String(req.created_by).toLowerCase()) return true;
  var emp = wfxEmpByUser_(me); if (emp && emp.emp_no === req.emp_no) return true;
  if (req.steps.some(function (s) { return s.users.indexOf(me) > -1 || s.by === me; })) return true;
  if (wfxDelegatesFor_([].concat.apply([], req.steps.map(function (s) { return s.users; }))).indexOf(me) > -1) return true;
  if (WFX_VIEW_ALL.indexOf(ctx.user.role) > -1) { if (!ctx.estates) return true; return !!(req.estate_code && ctx.estates[req.estate_code]); }
  return false;
}
function wfxContact_(step) {
  var out = [];
  if (step.emp) { var e = wfxEmp_(step.emp); if (e) out.push({ who: 'E:' + e.emp_no, name: e.name, phone: wfxPhone_(e.phone), email: e.email || ((step.users[0] && userBy_('username', step.users[0])) || {}).email || '' }); }
  else step.users.forEach(function (u) { var usr = userBy_('username', u), e = wfxEmpByUser_(u); out.push({ who: 'U:' + u, name: (e && e.name) || (usr && usr.name) || u, phone: wfxPhone_(e && e.phone), email: (usr && usr.email) || (e && e.email) || '' }); });
  return out;
}

/* ---------------- VALIDASI PER JENIS ---------------- */
function wfxNorm_(type, p, emp, excludeId) {
  var o = { title: '', date_from: '', date_to: '', days: '', amount: '', ref_code: '' }, lines = Array.isArray(p.lines) ? p.lines : [];
  function need(k, lab) { if (p[k] === undefined || p[k] === null || String(p[k]).trim() === '') throw err_(lab + ' wajib diisi', 'VALID'); }
  function sumLines(key) { return lines.reduce(function (s, l) { return s + (Number(l[key]) || 0); }, 0); }
  if (type === 'CUTI') {
    need('leave_type', 'Jenis cuti'); need('date_from', 'Tanggal mulai'); need('date_to', 'Tanggal selesai'); need('reason', 'Alasan cuti');
    var c = wfxLeaveCalc_(emp, p.leave_type, p.date_from, p.date_to), lt = c.lt;
    if (lt.g && emp.gender && lt.g !== emp.gender) throw err_(lt.t + ' hanya untuk karyawan ' + (lt.g === 'P' ? 'perempuan' : 'laki-laki'), 'VALID');
    if (!c.days) throw err_('Rentang tanggal tidak mengandung hari kerja (semua libur/akhir pekan)', 'VALID');
    if (lt.comp) { var cb = wfxCompBalance_(emp, excludeId); if (c.days > cb.available) throw err_('Saldo cuti pengganti tidak cukup: tersedia ' + cb.available + ' hari, diajukan ' + c.days + ' hari. Ajukan "Klaim Hak Cuti Pengganti" terlebih dahulu.', 'VALID'); }
    if (lt.q && !lt.yearly && c.days > lt.q) throw err_(lt.t + ' maksimal ' + lt.q + ' hari ' + lt.u + ' per kejadian (diajukan ' + c.days + ')', 'VALID');
    if (lt.yearly) {
      var b = wfxBalance_(emp, lt.c, wfxD_(p.date_from).substr(0, 4), excludeId);
      if (!b.eligible) throw err_(b.msg, 'VALID');
      if (b.remain !== null && c.days > b.remain) throw err_('Saldo ' + lt.t + ' tidak cukup: sisa ' + b.remain + ' hari, diajukan ' + c.days + ' hari', 'VALID');
    }
    if (wfxD_(p.date_from).substr(0, 4) !== wfxD_(p.date_to).substr(0, 4) && lt.yearly) throw err_('Cuti tahunan lintas tahun: ajukan terpisah per tahun', 'VALID');
    o.title = lt.t + ' ' + c.days + ' hari'; o.date_from = wfxD_(p.date_from); o.date_to = wfxD_(p.date_to); o.days = c.days;
    p.calc = { dates: c.dates, off: c.off, cal: c.cal, calT: c.calT, unit: lt.u, lt_t: lt.t };
    var overlap = wfxRows_().filter(function (r) { return r.id !== excludeId && r.type === 'CUTI' && r.emp_no === emp.emp_no && ['SUBMITTED', 'APPROVED'].indexOf(r.status) > -1 && wfxD_(r.date_from) <= o.date_to && wfxD_(r.date_to) >= o.date_from; })[0];
    if (overlap) throw err_('Bertabrakan dengan pengajuan cuti ' + overlap.code + ' (' + overlap.date_from + ' s.d. ' + overlap.date_to + ')', 'DUP');
    if (p.substitute && p.substitute === emp.emp_no) throw err_('Pengganti tugas tidak boleh diri sendiri', 'VALID');
  } else if (type === 'IZIN') {
    need('izin_type', 'Jenis izin'); need('date_from', 'Tanggal'); need('reason', 'Keperluan');
    o.date_from = wfxD_(p.date_from); o.date_to = wfxD_(p.date_to || p.date_from); o.days = wfxDates_(o.date_from, o.date_to).length; o.title = p.izin_type + (p.time_from ? ' ' + p.time_from + '-' + (p.time_to || '') : '');
  } else if (type === 'LEMBUR') {
    need('date_from', 'Tanggal lembur'); need('activity', 'Uraian pekerjaan');
    if (!lines.length) throw err_('Isi minimal 1 karyawan peserta lembur', 'VALID');
    lines.forEach(function (l, i) { if (!wfxEmp_(l.emp_no)) throw err_('Peserta baris ' + (i + 1) + ': karyawan "' + l.emp_no + '" tidak terdaftar', 'REF'); l.hours = Number(l.hours) || 0; if (l.hours <= 0 || l.hours > 12) throw err_('Jam lembur baris ' + (i + 1) + ' harus 0-12 jam', 'VALID'); });
    o.date_from = o.date_to = wfxD_(p.date_from); o.days = sumLines('hours'); o.title = 'Lembur ' + lines.length + ' orang \u00B7 ' + o.days + ' jam';
  } else if (type === 'SPPD') {
    need('destination', 'Tujuan'); need('purpose', 'Maksud perjalanan'); need('date_from', 'Tanggal berangkat'); need('date_to', 'Tanggal kembali'); need('transport', 'Alat transportasi');
    var dd = wfxDates_(p.date_from, p.date_to); if (!dd.length) throw err_('Tanggal kembali harus sesudah tanggal berangkat', 'VALID');
    lines.forEach(function (l) { l.qty = Number(l.qty) || 0; l.price = Number(l.price) || 0; l.total = Math.round(l.qty * l.price); });
    o.date_from = dd[0]; o.date_to = dd[dd.length - 1]; o.days = dd.length; o.amount = sumLines('total'); o.title = 'Dinas ke ' + p.destination + ' (' + dd.length + ' hari)';
    if (p.vehicle_code && !findBy_('vehicles', 'code', p.vehicle_code)) throw err_('Kendaraan tidak terdaftar', 'REF');
  } else if (type === 'DEKLARASI') {
    need('ref_code', 'No. SPPD');
    var sp = wfxFind_(p.ref_code); if (!sp || sp.type !== 'SPPD') throw err_('SPPD ' + p.ref_code + ' tidak ditemukan', 'REF');
    if (sp.status !== 'APPROVED') throw err_('SPPD ' + sp.code + ' belum disetujui penuh', 'STATE');
    if (sp.emp_no !== emp.emp_no) throw err_('Deklarasi harus atas nama pelaksana SPPD (' + sp.emp_name + ')', 'VALID');
    var dup = wfxRows_().filter(function (r) { return r.id !== excludeId && r.type === 'DEKLARASI' && r.ref_code === sp.code && ['DRAFT', 'SUBMITTED', 'APPROVED', 'REVISI'].indexOf(r.status) > -1; })[0];
    if (dup) throw err_('SPPD ini sudah dideklarasikan pada ' + dup.code, 'DUP');
    if (!lines.length) throw err_('Isi rincian realisasi biaya', 'VALID');
    lines.forEach(function (l) { l.amount = Math.round(Number(l.amount) || 0); });
    o.ref_code = sp.code; o.amount = sumLines('amount'); o.date_from = sp.date_from; o.date_to = sp.date_to; o.days = sp.days;
    p.advance = Number(sp.amount) || 0; p.diff = o.amount - p.advance; o.title = 'Realisasi ' + sp.code + (p.diff > 0 ? ' \u00B7 kurang bayar ' + wfxRp_(p.diff) : p.diff < 0 ? ' \u00B7 lebih bayar ' + wfxRp_(-p.diff) : ' \u00B7 sesuai');
  } else if (type === 'KASBON') {
    need('purpose', 'Keperluan'); need('amount', 'Nilai'); need('settle_date', 'Tanggal pertanggungjawaban');
    o.amount = Math.round(Number(p.amount) || 0); if (o.amount <= 0) throw err_('Nilai harus lebih dari 0', 'VALID'); o.date_from = wfxD_(p.need_date || today_()); o.date_to = wfxD_(p.settle_date); o.title = 'Uang muka: ' + p.purpose;
  } else if (type === 'PENGADAAN') {
    need('kind', 'Jenis (barang/jasa)'); need('justification', 'Justifikasi kebutuhan');
    if (!lines.length) throw err_('Isi minimal 1 baris barang/jasa', 'VALID');
    lines.forEach(function (l, i) { if (!l.desc && !l.item_code) throw err_('Baris ' + (i + 1) + ': isi nama barang/jasa', 'VALID'); if (l.item_code && !findBy_('items', 'code', l.item_code)) throw err_('Baris ' + (i + 1) + ': kode barang tidak terdaftar', 'REF'); l.qty = Number(l.qty) || 0; l.price = Number(l.price) || 0; if (l.qty <= 0) throw err_('Baris ' + (i + 1) + ': qty harus > 0', 'VALID'); l.total = Math.round(l.qty * l.price); });
    o.amount = sumLines('total'); o.date_from = wfxD_(p.need_date || today_()); o.title = p.kind + ' ' + lines.length + ' item \u00B7 ' + wfxRp_(o.amount);
  } else if (type === 'BON') {
    need('wh_code', 'Gudang'); if (!findBy_('warehouses', 'code', p.wh_code)) throw err_('Gudang tidak terdaftar', 'REF');
    if (!lines.length) throw err_('Isi minimal 1 barang', 'VALID');
    lines.forEach(function (l, i) { var it = findBy_('items', 'code', l.item_code); if (!it) throw err_('Baris ' + (i + 1) + ': barang tidak terdaftar', 'REF'); l.qty = Number(l.qty) || 0; if (l.qty <= 0) throw err_('Baris ' + (i + 1) + ': qty harus > 0', 'VALID'); l.uom = it.uom; l.name = it.name; });
    o.amount = lines.reduce(function (s, l) { var it = findBy_('items', 'code', l.item_code); return s + Math.round((Number(l.qty) || 0) * (Number(it && it.price) || 0)); }, 0);
    o.date_from = wfxD_(p.need_date || today_()); o.title = 'Bon ' + lines.length + ' barang dari ' + p.wh_code;
  } else if (type === 'KLAIM') {
    need('claim_type', 'Jenis klaim'); need('patient', 'Pasien'); need('date_from', 'Tanggal'); need('amount', 'Nilai klaim');
    o.amount = Math.round(Number(p.amount) || 0); if (o.amount <= 0) throw err_('Nilai harus lebih dari 0', 'VALID'); o.date_from = o.date_to = wfxD_(p.date_from); o.title = p.claim_type + ' (' + p.patient + ')';
  } else if (type === 'KENDARAAN') {
    need('date_from', 'Tanggal pakai'); need('destination', 'Tujuan'); need('purpose', 'Keperluan');
    o.date_from = wfxD_(p.date_from); o.date_to = wfxD_(p.date_to || p.date_from); o.days = wfxDates_(o.date_from, o.date_to).length; o.title = 'Kendaraan ke ' + p.destination;
    if (p.vehicle_code) {
      if (!findBy_('vehicles', 'code', p.vehicle_code)) throw err_('Kendaraan tidak terdaftar', 'REF');
      var clash = wfxRows_().filter(function (r) { if (r.id === excludeId || ['SUBMITTED', 'APPROVED'].indexOf(r.status) < 0 || ['KENDARAAN', 'SPPD'].indexOf(r.type) < 0) return false; var q = wfxJ_(r.payload, {}); return q.vehicle_code === p.vehicle_code && wfxD_(r.date_from) <= o.date_to && wfxD_(r.date_to) >= o.date_from; })[0];
      if (clash) throw err_('Kendaraan ' + p.vehicle_code + ' sudah dipesan pada ' + clash.code + ' (' + clash.date_from + ' s.d. ' + clash.date_to + ')', 'DUP');
    }
  }
  else if (type === 'HAKCUTI') {
    need('basis', 'Dasar hak cuti pengganti'); need('reason', 'Keterangan');
    var cp = wfxConf_().c.comp, earn = 0;
    if (p.basis === 'Dinas Luar (SPPD)') {
      var codes = (Array.isArray(p.sppd_codes) ? p.sppd_codes : String(p.sppd_codes || '').split(',')).map(function (x) { return String(x).trim(); }).filter(String);
      if (!codes.length) throw err_('Pilih minimal 1 SPPD yang sudah disetujui', 'VALID');
      var tot = 0, d1 = '', d2 = '';
      codes.forEach(function (cd) {
        var sp = wfxFind_(cd); if (!sp || sp.type !== 'SPPD') throw err_('SPPD ' + cd + ' tidak ditemukan', 'REF');
        if (sp.status !== 'APPROVED') throw err_('SPPD ' + cd + ' belum disetujui penuh', 'STATE');
        if (sp.emp_no !== emp.emp_no) throw err_('SPPD ' + cd + ' bukan atas nama ' + emp.name, 'VALID');
        var used = wfxRows_().filter(function (r) { return r.id !== excludeId && r.type === 'HAKCUTI' && ['DRAFT', 'SUBMITTED', 'APPROVED', 'REVISI'].indexOf(r.status) > -1 && (wfxJ_(r.payload, {}).sppd_codes || []).indexOf(cd) > -1; })[0];
        if (used) throw err_('SPPD ' + cd + ' sudah diklaim pada ' + used.code, 'DUP');
        tot += Number(sp.days) || 0; if (!d1 || sp.date_from < d1) d1 = sp.date_from; if (!d2 || sp.date_to > d2) d2 = sp.date_to;
      });
      earn = Math.floor(tot / (Number(cp.sppd_per_days) || 30)) * (Number(cp.sppd_earn) || 0);
      if (earn <= 0) throw err_('Total dinas ' + tot + ' hari belum mencapai ' + cp.sppd_per_days + ' hari (kebijakan: tiap ' + cp.sppd_per_days + ' hari dinas = ' + cp.sppd_earn + ' hari cuti pengganti)', 'VALID');
      p.sppd_codes = codes; p.basis_days = tot; o.date_from = d1; o.date_to = d2; o.ref_code = codes.join(', ');
      o.title = 'Hak cuti pengganti ' + earn + ' hari (dinas ' + tot + ' hari)';
    } else if (p.basis === 'Kerja di Hari Libur') {
      need('date_from', 'Tanggal mulai'); var hd = wfxDates_(p.date_from, p.date_to || p.date_from); if (!hd.length) throw err_('Tanggal tidak valid', 'VALID');
      var cal = wfxCalOf_(emp), wd = (wfxConf_().cal[cal] || {}).days || [1, 2, 3, 4, 5, 6], hol = wfxHolidays_(cal, wfxRegionOf_(emp), hd[0], hd[hd.length - 1]);
      var offd = hd.filter(function (d) { return wd.indexOf(wfxDow_(d)) < 0 || hol[d]; });
      if (!offd.length) throw err_('Tidak ada hari libur (mingguan/nasional) dalam rentang tanggal tersebut sesuai kalender ' + cal, 'VALID');
      earn = Math.round(offd.length * (Number(cp.holiday_ratio) || 1) * 2) / 2;
      p.off_dates = offd; p.basis_days = offd.length; o.date_from = hd[0]; o.date_to = hd[hd.length - 1];
      o.title = 'Hak cuti pengganti ' + earn + ' hari (kerja ' + offd.length + ' hari libur)';
    } else if (p.basis === 'Kebijakan Khusus') {
      need('days', 'Jumlah hari'); earn = Number(p.days) || 0; if (earn <= 0 || earn > 60) throw err_('Jumlah hari 0,5-60', 'VALID');
      o.date_from = wfxD_(p.date_from || today_()); o.title = 'Hak cuti pengganti ' + earn + ' hari (kebijakan khusus)';
    } else throw err_('Dasar tidak dikenal', 'VALID');
    if (Number(cp.max_days) > 0 && earn > Number(cp.max_days)) earn = Number(cp.max_days);
    o.days = earn;
  } else if (type === 'BAYARCP') {
    need('days', 'Jumlah hari dicairkan'); var dd2 = Number(p.days) || 0, cp2 = wfxConf_().c.comp, bal = wfxCompBalance_(emp, excludeId);
    if (dd2 <= 0) throw err_('Jumlah hari harus > 0', 'VALID');
    if (dd2 > bal.available) throw err_('Saldo cuti pengganti tersedia ' + bal.available + ' hari, diajukan ' + dd2 + ' hari', 'VALID');
    if (Number(cp2.max_pay_days) > 0 && dd2 > Number(cp2.max_pay_days)) throw err_('Maksimal pencairan ' + cp2.max_pay_days + ' hari per pengajuan', 'VALID');
    var rate = 0, basisT = '';
    if (cp2.pay_mode === 'gaji') { var w = Number(emp.base_wage) || 0; if (!w) throw err_('Upah harian karyawan belum diisi HRD (dasar perhitungan insentif)', 'VALID'); rate = Math.round(w * (Number(cp2.pay_pct) || 100) / 100); basisT = (Number(cp2.pay_pct) || 100) + '% upah harian'; }
    else { var g = wfxGrade_(emp); rate = Number(cp2.pay_rate[g]) || 0; basisT = 'tarif golongan ' + g; if (!rate) throw err_('Tarif insentif golongan ' + g + ' belum diatur', 'VALID'); }
    p.rate = rate; p.rate_basis = basisT; p.balance_before = bal.available;
    o.days = dd2; o.amount = Math.round(dd2 * rate); o.date_from = today_(); o.title = 'Insentif sisa cuti pengganti ' + dd2 + ' hari \u00B7 ' + wfxRp_(o.amount);
  }
  p.lines = lines;
  return o;
}

/* ---------------- API ---------------- */
function apiWfMeta(ctx, p) {
  var me = wfxEmpByUser_(ctx.user.username), conf = wfxConf_(), y = String((p && p.year) || today_().substr(0, 4)), out = {
    types: Object.keys(WFX_TYPES).map(function (k) { return { k: k, t: WFX_TYPES[k].t, steps: conf.routes[k] && conf.routes[k].length ? conf.routes[k] : WFX_TYPES[k].steps }; }),
    pools: WFX_POOLS, leave_types: conf.lt, calendars: conf.cal, conf: { sla_hours: conf.c.sla_hours, token_hours: conf.c.token_hours, wa_mode: conf.c.wa_mode, sppd_cats: conf.c.sppd_cats, sppd_daily: conf.c.sppd_daily, email: conf.c.email, gateway: !!conf.c.wa_gateway_url },
    me: me ? { emp_no: me.emp_no, name: me.name, estate_code: me.estate_code, cal: wfxCalOf_(me), job_title: me.job_title || me.position, gender: me.gender, supervisor: me.supervisor, supervisor2: me.supervisor2 } : null,
    on_behalf: perm_(ctx, 'hr', 'E') || ctx.user.role === 'SUPER_ADMIN', view_all: WFX_VIEW_ALL.indexOf(ctx.user.role) > -1, admin: perm_(ctx, 'sys', 'E'), sysA: perm_(ctx, 'sys', 'A'),
    users: users_().filter(function (u) { return truthy_(u.active) && u.username !== ctx.user.username; }).map(function (u) { return { u: u.username, n: u.name }; }),
    routes_raw: conf.routes, conf_full: perm_(ctx, 'sys', 'A') ? conf.c : null,
    holidays: rowsOf_('holidays').filter(function (h) { return wfxD_(h.h_date).substr(0, 4) >= String(Number(y) - 1); }).map(function (h) { return { d: wfxD_(h.h_date), n: h.name, ty: h.h_type, ap: h.applies, ded: h.deduct }; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; }),
    base_url: wfxBaseUrl_(), year: y
  };
  if (me) { out.balance = ['CT', 'CL'].map(function (c) { return wfxBalance_(me, c, y); }).filter(function (b) { return b.code === 'CT' || wfxCalOf_(me) === 'KEBUN'; }); out.comp = wfxCompBalance_(me); }
  out.comp_policy = conf.c.comp; out.fin_types = conf.c.fin_types; out.fin_min = conf.c.fin_min;
  out.todo = wfxPendingFor_(ctx).length;
  var today = today_();
  out.today_off = wfxRows_().filter(function (r) { return r.type === 'CUTI' && r.status === 'APPROVED' && wfxD_(r.date_from) <= today && wfxD_(r.date_to) >= today && (!ctx.estates || !r.estate_code || ctx.estates[r.estate_code]); }).map(function (r) { return { code: r.code, emp: r.emp_name, to: r.date_to, t: r.title }; }).slice(0, 50);
  out.delegations = table_(WFX_SHEET.DEL).rows.filter(function (d) { return truthy_(d.active) && (String(d.from_user).toLowerCase() === String(ctx.user.username).toLowerCase() || String(d.to_user).toLowerCase() === String(ctx.user.username).toLowerCase()) && wfxD_(d.date_to) >= today; }).map(function (d) { return { id: d.id, from: d.from_user, to: d.to_user, df: wfxD_(d.date_from), dt: wfxD_(d.date_to), note: d.note }; });
  return out;
}

function apiWfCalc(ctx, p) {
  var emp = wfxEmp_(p.emp_no) || wfxEmpByUser_(ctx.user.username); if (!emp) throw err_('Data karyawan tidak ditemukan', 'NOEMP');
  if (p.type && p.type !== 'CUTI') {
    var pl = JSON.parse(JSON.stringify(p.payload || {})), n = wfxNorm_(p.type, pl, emp, p.id);
    return { days: n.days, amount: n.amount, title: n.title, payload: pl, comp: wfxCompBalance_(emp, p.id) };
  }
  var c = wfxLeaveCalc_(emp, p.leave_type, p.date_from, p.date_to), out = { days: c.days, dates: c.dates, off: c.off, cal: c.cal, calT: c.calT, unit: c.lt.u, quota: c.lt.q };
  if (c.lt.yearly) out.balance = wfxBalance_(emp, c.lt.c, wfxD_(p.date_from).substr(0, 4), p.id);
  if (c.lt.comp) out.comp = wfxCompBalance_(emp, p.id);
  return out;
}

function apiWfList(ctx, p) {
  var me = String(ctx.user.username).toLowerCase(), emp = wfxEmpByUser_(me), box = p.box || 'mine', q = String(p.q || '').toLowerCase();
  if (box === 'all' && WFX_VIEW_ALL.indexOf(ctx.user.role) < 0) throw err_('Hanya HRD/Keuangan/Manajemen/Admin', 'PERM');
  var base = wfxRows_();
  if (box === 'todo') base = base.filter(function (r) { return r.status === 'SUBMITTED'; });
  if (box === 'cal') base = base.filter(function (r) { return r.type === 'CUTI'; });
  if (p.type) base = base.filter(function (r) { return r.type === p.type; });
  var rows = base.map(wfxFull_).filter(function (r) {
    if (box === 'mine' && String(r.created_by).toLowerCase() !== me && !(emp && emp.emp_no === r.emp_no)) return false;
    if (box === 'todo' && !wfxCanAct_(ctx, r)) return false;
    if (box === 'done' && !r.steps.some(function (s) { return s.by === me; })) return false;
    if (box === 'all' && !wfxCanView_(ctx, r)) return false;
    if (box === 'cal' && !(r.type === 'CUTI' && ['APPROVED', 'SUBMITTED'].indexOf(r.status) > -1 && (WFX_VIEW_ALL.indexOf(ctx.user.role) > -1 ? wfxCanView_(ctx, r) : true))) return false;
    if (p.type && r.type !== p.type) return false;
    if (p.status && r.status !== p.status) return false;
    if (p.from && wfxD_(r.date_to || r.date_from || r.created_at) < p.from) return false;
    if (p.to && wfxD_(r.date_from || r.created_at) > p.to) return false;
    if (q && (r.code + ' ' + r.emp_name + ' ' + r.title + ' ' + r.emp_no).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
  return { total: rows.length, rows: rows.slice(0, Number(p.limit) || 300).map(function (r) {
    var s = r.steps[r.cur] || {};
    return { id: r.id, code: r.code, type: r.type, typeT: (WFX_TYPES[r.type] || {}).t, status: r.status, emp_no: r.emp_no, emp_name: r.emp_name, estate_code: r.estate_code, title: r.title, date_from: r.date_from, date_to: r.date_to, days: r.days, amount: r.amount, cur: r.status === 'SUBMITTED' ? (s.t || s.k) + (s.name ? ': ' + s.name : '') : '', updated_at: r.updated_at, created_by: r.created_by, nsteps: r.steps.length, done: r.steps.filter(function (x) { return x.st === 'OK'; }).length, wait_h: r.status === 'SUBMITTED' ? Math.round((Date.now() - new Date(r.updated_at).getTime()) / 36e5) : 0 };
  }) };
}

function apiWfGet(ctx, p) {
  var r0 = wfxFind_(p.id); if (!r0) throw err_('Pengajuan tidak ditemukan', 'NOTFOUND');
  var r = wfxFull_(r0); if (!wfxCanView_(ctx, r)) throw err_('Anda tidak berhak melihat pengajuan ini', 'PERM');
  var emp = wfxEmp_(r.emp_no) || {}, hist = table_(SYS.APPR).rows.filter(function (a) { return a.rec_id === r.id; }).map(function (a) { return { ts: a.ts, action: a.action, user: a.user, comment: a.comment, to: a.to_status }; });
  var can = wfxCanAct_(ctx, r, true), mine = String(r.created_by).toLowerCase() === String(ctx.user.username).toLowerCase();
  r.steps.forEach(function (s) { delete s.sign_raw; });
  var rel = [];
  if (r.type === 'SPPD') rel = wfxRows_().filter(function (x) { return x.type === 'DEKLARASI' && x.ref_code === r.code; }).map(function (x) { return { id: x.id, code: x.code, status: x.status, amount: x.amount }; });
  if (r.type === 'DEKLARASI') { var sp = wfxFind_(r.ref_code); if (sp) rel = [{ id: sp.id, code: sp.code, status: sp.status, amount: sp.amount, payload: wfxJ_(sp.payload, {}) }]; }
  var sup = wfxEmp_(emp.supervisor), comp = rowsOf_('companies')[0] || {}, est = emp.estate_code ? findBy_('estates', 'code', emp.estate_code) : null;
  return { rec: r, emp: { emp_no: emp.emp_no, name: emp.name, job_title: emp.job_title || emp.position, position: emp.position, estate_code: emp.estate_code, estate: est ? est.name : 'Head Office', division_code: emp.division_code, cal: wfxCalOf_(emp), gender: emp.gender, emp_type: emp.emp_type, supervisor: sup ? sup.name : '' },
    company: { name: comp.name || '', address: comp.address || '', npwp: comp.npwp || '' }, history: hist, can_act: !!can, override: can === 'override', mine: mine,
    can_edit: mine && ['DRAFT', 'REVISI', 'REJECTED'].indexOf(r.status) > -1, can_cancel: mine && ['DRAFT', 'SUBMITTED', 'REVISI'].indexOf(r.status) > -1 && !r.steps.some(function (s) { return s.st === 'OK'; }), related: rel,
    verify: sha_(r.id + '|' + r.code + '|' + r.status).replace(/[^A-Za-z0-9]/g, '').substr(0, 10).toUpperCase(), vk: typeof opsVk_ === 'function' ? opsVk_(r.id, r.code) : '', app_url: wfxBaseUrl_() };
}

function apiWfSave(ctx, p) {
  var t = p.type, rec = p.rec || {}; if (!WFX_TYPES[t]) throw err_('Jenis workflow tidak dikenal', 'VALID');
  licenseGuardWrite_(ctx, { g: 'wfx', key: 'wfx' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ex = rec.id ? wfxFind_(rec.id) : null, full = ex ? wfxFull_(ex) : null;
    if (ex && ex.created_by !== ctx.user.username && ctx.user.role !== 'SUPER_ADMIN') throw err_('Hanya pembuat pengajuan yang dapat mengubah', 'PERM');
    if (ex && ['DRAFT', 'REVISI', 'REJECTED'].indexOf(ex.status) < 0) throw err_('Pengajuan berstatus ' + ex.status + ' terkunci', 'LOCKED');
    if (ex && rec.version && Number(rec.version) < Number(ex.version)) throw err_('Konflik: pengajuan sudah berubah, muat ulang', 'CONFLICT');
    var me = wfxEmpByUser_(ctx.user.username), emp = me;
    if (rec.emp_no && (!me || rec.emp_no !== me.emp_no)) {
      if (!(perm_(ctx, 'hr', 'E') || ctx.user.role === 'SUPER_ADMIN')) throw err_('Anda hanya dapat mengajukan atas nama sendiri', 'PERM');
      emp = wfxEmp_(rec.emp_no); if (!emp) throw err_('Karyawan tidak ditemukan', 'REF');
      if (!inScope_(ctx, sc_('employees'), emp)) throw err_('Karyawan di luar kewenangan Anda', 'SCOPE');
    }
    if (!emp) throw err_('Akun Anda belum ditautkan ke data Karyawan. Minta HRD mengisi kolom "Akun Login Aplikasi" pada data karyawan Anda.', 'NOEMP');
    if (String(emp.active || 'Ya') === 'Tidak') throw err_('Karyawan nonaktif', 'VALID');
    if (isDemo_() && !ex && wfxRows_().length >= DEMO_LIMITS.rows) throw err_('Versi demo: maksimal ' + DEMO_LIMITS.rows + ' pengajuan workflow', 'DEMO');
    var payload = {}; Object.keys(rec.payload || {}).forEach(function (k) { if (k.charAt(0) !== '_') payload[k] = rec.payload[k]; });
    var norm = wfxNorm_(t, payload, emp, ex ? ex.id : null);
    var att = full ? full.attach : [];
    (rec.new_attach || []).forEach(function (a) { att.push(wfxStoreAtt_(a, ctx, t)); });
    if (rec.remove_attach && rec.remove_attach.length) att = att.filter(function (a, i) { return rec.remove_attach.indexOf(i) < 0; });
    if (att.length > 15) throw err_('Maksimal 15 lampiran per pengajuan', 'VALID');
    var lt = t === 'CUTI' ? wfxLt_(payload.leave_type) : null;
    if (p.submit && ((lt && lt.att) || (t === 'DEKLARASI' || t === 'KLAIM')) && !att.length) throw err_('Lampiran bukti wajib (foto/scan dokumen) untuk ' + (lt ? lt.t : WFX_TYPES[t].t), 'VALID');
    var o = full || { id: uid_(), code: wfxNextCode_(t), type: t, status: 'DRAFT', created_at: now_(), created_by: ctx.user.username, version: 0, deleted: false, steps: [], cur: 0, integ: [] };
    o.type = t; o.emp_no = emp.emp_no; o.emp_name = emp.name; o.estate_code = emp.estate_code || ''; o.work_cal = wfxCalOf_(emp);
    Object.keys(norm).forEach(function (k) { o[k] = norm[k]; }); o.payload = payload; o.attach = att;
    o.updated_at = now_(); o.updated_by = ctx.user.username; o.version = Number(o.version || 0) + 1;
    var from = o.status;
    if (p.submit) {
      o.steps = wfxRoute_(t, emp, o.amount, { spv2: payload.spv2 !== false && payload.spv2 !== 'false' }, ctx.user.username); o.cur = 0; o.status = 'SUBMITTED';
    } else if (o.status === 'REJECTED') o.status = 'DRAFT';
    wfxWrite_(o, ex);
    audit_(ctx, ex ? 'WFX_UPDATE' : 'WFX_CREATE', 'wfx', o.id, ex ? { status: ex.status } : null, { code: o.code, status: o.status });
    var sent = null;
    if (p.submit) { wfxLog_(ctx, o, 'submit', from, 'SUBMITTED', ''); sent = wfxDispatch_(o, ctx); }
    return { id: o.id, code: o.code, status: o.status, steps: o.steps, sent: sent };
  } finally { lock.releaseLock(); }
}
function wfxStoreAtt_(a, ctx, t) {
  var v = a && a.data; if (typeof v !== 'string' || v.indexOf('data:') !== 0) throw err_('Lampiran tidak valid', 'VALID');
  if (v.length > 6 * 1024 * 1024) throw err_('Lampiran maksimal ~4 MB', 'VALID');
  var stored = storeFile_(v, 'WF_' + t), meta = {}; try { meta = JSON.parse(stored); } catch (e) { meta = { url: stored, name: a.name || 'lampiran', mime: (v.match(/^data:([^;]+)/) || [])[1] }; }
  return { url: meta.url, id: meta.id || '', name: a.name || meta.name, mime: meta.mime || '', cap: String(a.cap || '').substr(0, 140), lat: a.lat || '', lng: a.lng || '', ts: now_(), by: ctx ? ctx.user.username : 'wa' };
}

function apiWfAttach(ctx, p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r0 = wfxFind_(p.id); if (!r0) throw err_('Pengajuan tidak ditemukan', 'NOTFOUND');
    var r = wfxFull_(r0), mine = r.created_by === ctx.user.username;
    if (!(mine || wfxCanAct_(ctx, r) || (r.status === 'APPROVED' && wfxCanView_(ctx, r)))) throw err_('Anda tidak dapat menambah lampiran', 'PERM');
    (p.files || []).forEach(function (a) { r.attach.push(wfxStoreAtt_(a, ctx, r.type)); });
    if (r.attach.length > 15) throw err_('Maksimal 15 lampiran', 'VALID');
    r.updated_at = now_(); r.updated_by = ctx.user.username; wfxWrite_(r, r0); audit_(ctx, 'WFX_ATTACH', 'wfx', r.id, null, { n: (p.files || []).length });
    return { attach: r.attach };
  } finally { lock.releaseLock(); }
}

/** Tindakan: approve | reject | revise | cancel. Dipakai juga oleh tautan WhatsApp (ctx sintetis). */
function apiWfAct(ctx, p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return wfxActCore_(ctx, p, null); } finally { lock.releaseLock(); }
}
function wfxActCore_(ctx, p, tokenWho) {
  var r0 = wfxFind_(p.id); if (!r0) throw err_('Pengajuan tidak ditemukan', 'NOTFOUND');
  var r = wfxFull_(r0), a = p.action, note = String(p.note || '').trim().substr(0, 500), from = r.status, me = ctx.user.username;
  if (a === 'cancel') {
    if (r.created_by !== me && ctx.user.role !== 'SUPER_ADMIN') throw err_('Hanya pembuat yang dapat membatalkan', 'PERM');
    if (['DRAFT', 'SUBMITTED', 'REVISI'].indexOf(r.status) < 0) throw err_('Tidak dapat dibatalkan pada status ' + r.status, 'STATE');
    if (r.status === 'SUBMITTED' && r.steps.some(function (s) { return s.st === 'OK'; }) && ctx.user.role !== 'SUPER_ADMIN') throw err_('Sudah ada persetujuan; minta approver menolak/mengembalikan', 'STATE');
    r.status = 'CANCELLED';
  } else {
    var can = tokenWho ? 'token' : wfxCanAct_(ctx, r, true); if (!can) throw err_('Anda bukan approver pada langkah ini', 'PERM');
    if (['reject', 'revise'].indexOf(a) > -1 && !note) throw err_('Alasan wajib diisi', 'VALID');
    var s = r.steps[r.cur];
    s.by = tokenWho ? tokenWho.who : me; s.byName = tokenWho ? tokenWho.name : ((wfxEmpByUser_(me) || {}).name || ctx.user.name || me);
    s.at = now_(); s.note = note + (can === 'override' ? ' [override Administrator]' : ''); s.via = tokenWho ? 'WhatsApp/Email' : 'Aplikasi';
    if (p.sign && /^data:image\/png;base64,/.test(p.sign) && p.sign.length < 60000) s.sign = p.sign;
    if (a === 'approve') {
      s.st = 'OK';
      if (r.cur + 1 < r.steps.length) { r.cur++; r.steps[r.cur].st = 'PEND'; }
      else { r.status = 'APPROVED'; }
    } else if (a === 'reject') { s.st = 'NO'; r.status = 'REJECTED'; }
    else if (a === 'revise') { s.st = 'REV'; r.status = 'REVISI'; }
    else throw err_('Aksi tidak dikenal', 'VALID');
  }
  r.updated_at = now_(); r.updated_by = tokenWho ? 'wa:' + tokenWho.who : me; r.version = Number(r.version || 1) + 1;
  if (r.status === 'APPROVED' && from !== 'APPROVED') { try { r.integ = wfxIntegrate_(r, ctx); } catch (e) { r.integ = [{ ok: false, msg: 'Integrasi gagal: ' + e.message }]; } }
  wfxWrite_(r, r0);
  wfxLog_(ctx, r, (tokenWho ? 'wa:' : '') + a, from, r.status, note);
  audit_(ctx, 'WFX_' + a.toUpperCase(), 'wfx', r.id, { status: from }, { status: r.status, step: r.cur, by: tokenWho ? tokenWho.who : me });
  var msg = WFX_TYPES[r.type].t + ' ' + r.code + ': ' + ({ approve: r.status === 'APPROVED' ? 'DISETUJUI PENUH' : 'disetujui ' + (r.steps[r.cur - 1] || {}).t + ', lanjut ke ' + (r.steps[r.cur] || {}).t, reject: 'DITOLAK', revise: 'DIKEMBALIKAN untuk revisi', cancel: 'dibatalkan' }[a] || a) + (note ? ' \u2014 ' + note : '');
  notify_(r.created_by, msg, 'wfx', r.id);
  var emp = wfxEmp_(r.emp_no); if (emp && emp.username && String(emp.username).toLowerCase() !== String(r.created_by).toLowerCase()) notify_(emp.username, msg, 'wfx', r.id);
  var sent = null;
  if (a === 'approve' && r.status === 'SUBMITTED') sent = wfxDispatch_(r, ctx);
  if (['reject', 'revise'].indexOf(a) > -1 || r.status === 'APPROVED') wfxNotifyRequester_(r, msg);
  return { status: r.status, cur: r.cur, steps: r.steps, integ: r.integ, sent: sent, next: r.status === 'SUBMITTED' ? wfxLinks_(r) : [] };
}

/* ---------------- NOTIFIKASI: in-app, email, WhatsApp (tautan / gateway) ---------------- */
function wfxSummary_(r) {
  var p = r.payload || {}, L = [WFX_TYPES[r.type].t + ' \u2014 ' + r.code, 'Pemohon: ' + r.emp_name + ' (' + r.emp_no + ')' + (r.estate_code ? ' \u00B7 ' + r.estate_code : ' \u00B7 Head Office'), r.title];
  if (r.date_from) L.push('Tanggal: ' + wfxDateId_(r.date_from) + (r.date_to && r.date_to !== r.date_from ? ' s.d. ' + wfxDateId_(r.date_to) : ''));
  if (Number(r.amount)) L.push('Nilai: ' + wfxRp_(r.amount));
  var why = p.reason || p.purpose || p.justification || p.activity || ''; if (why) L.push('Keterangan: ' + String(why).substr(0, 160));
  return L;
}
function wfxMakeToken_(r, contact) {
  var tok = randHex_(40), hrs = Number(wfxConf_().c.token_hours) || 72;
  appendObj_(WFX_SHEET.TOK, WFX_TOK_COLS, { id: uid_(), token_hash: sha_(tok), req_id: r.id, step: r.cur, who: contact.who, who_name: contact.name, expires_at: new Date(Date.now() + hrs * 36e5).toISOString(), used_at: '', created_at: now_() });
  return tok;
}
/** Tautan WhatsApp + tautan persetujuan tanpa login untuk approver langkah aktif. */
function wfxLinks_(r) {
  var s = r.steps[r.cur]; if (!s) return [];
  var base = wfxBaseUrl_(), hrs = wfxConf_().c.token_hours || 72;
  return wfxContact_(s).slice(0, 5).map(function (c) {
    var link = base ? base + '?wfa=' + wfxMakeToken_(r, c) : '';
    var txt = ['Yth. ' + c.name + ',', 'Mohon persetujuan ' + s.t + ' untuk:', ''].concat(wfxSummary_(r)).concat(['', link ? 'Setujui / tolak tanpa login (berlaku ' + hrs + ' jam):\n' + link : 'Silakan buka aplikasi PALM OS > Workflow > Perlu Persetujuan Saya.', '', 'Terima kasih. \u2014 PALM OS Enterprise']).join('\n');
    return { name: c.name, phone: c.phone, email: c.email, step: s.t, link: link, wa: c.phone ? 'https://wa.me/' + c.phone + '?text=' + encodeURIComponent(txt) : 'https://wa.me/?text=' + encodeURIComponent(txt), text: txt };
  });
}
function wfxDispatch_(r, ctx) {
  var s = r.steps[r.cur], conf = wfxConf_().c, out = { app: 0, email: 0, gateway: 0, links: [] };
  if (!s) return out;
  s.users.forEach(function (u) { notify_(u, 'Perlu persetujuan Anda: ' + WFX_TYPES[r.type].t + ' ' + r.code + ' dari ' + r.emp_name, 'wfx', r.id); out.app++; });
  wfxDelegatesFor_(s.users).forEach(function (u) { notify_(u, '[Delegasi] Perlu persetujuan: ' + WFX_TYPES[r.type].t + ' ' + r.code, 'wfx', r.id); });
  var links = wfxLinks_(r); out.links = links;
  links.forEach(function (l) {
    if (conf.email && l.email) { try { MailApp.sendEmail({ to: l.email, subject: '[PALM OS] Persetujuan ' + WFX_TYPES[r.type].t + ' ' + r.code, body: l.text, htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px">' + wfxEsc_(l.text).replace(/\n/g, '<br>') + (l.link ? '<p><a href="' + l.link + '" style="background:#0f6b4b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Buka halaman persetujuan</a></p>' : '') + '</div>' }); out.email++; } catch (e) { } }
    if (conf.wa_mode === 'gateway' && conf.wa_gateway_url && l.phone) { if (wfxGateway_(l.phone, l.text)) out.gateway++; }
  });
  return out;
}
function wfxGateway_(phone, text) {
  var c = wfxConf_().c;
  try { var res = UrlFetchApp.fetch(c.wa_gateway_url, { method: 'post', headers: { Authorization: c.wa_gateway_token || '' }, payload: { target: phone, message: text }, muteHttpExceptions: true }); return res.getResponseCode() < 300; } catch (e) { return false; }
}
function wfxNotifyRequester_(r, msg) {
  var emp = wfxEmp_(r.emp_no), conf = wfxConf_().c, ph = wfxPhone_(emp && emp.phone);
  if (conf.wa_mode === 'gateway' && conf.wa_gateway_url && ph) wfxGateway_(ph, msg);
  var u = userBy_('username', r.created_by), em = (u && u.email) || (emp && emp.email);
  if (conf.email && em) { try { MailApp.sendEmail(em, '[PALM OS] ' + msg.substr(0, 90), msg); } catch (e) { } }
}
function apiWfNotify(ctx, p) {
  var r0 = wfxFind_(p.id); if (!r0) throw err_('Pengajuan tidak ditemukan', 'NOTFOUND');
  var r = wfxFull_(r0); if (!wfxCanView_(ctx, r)) throw err_('Tidak berhak', 'PERM');
  if (r.status !== 'SUBMITTED') throw err_('Pengajuan tidak sedang menunggu persetujuan', 'STATE');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return p.resend ? wfxDispatch_(r, ctx) : { links: wfxLinks_(r) }; } finally { lock.releaseLock(); }
}

/* ---------------- PERSETUJUAN TANPA LOGIN (token WhatsApp/email) ---------------- */
function wfxTokenRow_(t) {
  if (!t || !/^[0-9a-f]{40}$/.test(String(t))) throw err_('Tautan tidak valid', 'TOKEN');
  var h = sha_(String(t)), row = table_(WFX_SHEET.TOK).rows.filter(function (x) { return x.token_hash === h; })[0];
  if (!row) throw err_('Tautan tidak dikenal atau sudah diganti', 'TOKEN');
  if (row.used_at) throw err_('Tautan ini sudah dipakai pada ' + String(row.used_at).replace('T', ' ').substr(0, 16), 'TOKEN');
  if (new Date(row.expires_at).getTime() < Date.now()) throw err_('Tautan kedaluwarsa. Minta pemohon mengirim ulang.', 'TOKEN');
  var r0 = wfxFind_(row.req_id); if (!r0) throw err_('Pengajuan tidak ditemukan', 'TOKEN');
  var r = wfxFull_(r0);
  if (r.status !== 'SUBMITTED' || r.cur !== Number(row.step) || (r.steps[r.cur] || {}).st !== 'PEND') throw err_('Pengajuan ' + r.code + ' sudah diproses (status ' + r.status + ')', 'TOKEN');
  return { row: row, r: r };
}
function apiWfTokenInfo(p) {
  var x = wfxTokenRow_(p.t), r = x.r, s = r.steps[r.cur];
  var pl = r.payload, lines = (pl.lines || []).slice(0, 30).map(function (l) { return [l.desc || l.name || l.cat || l.item_code || l.emp_no || '', l.qty || l.hours || '', l.total || l.amount || ''].join(' | '); });
  return { code: r.code, type: WFX_TYPES[r.type].t, step: s.t, approver: x.row.who_name, summary: wfxSummary_(r), lines: lines, attach: r.attach.map(function (a) { return { url: a.url, name: a.name, mime: a.mime }; }), steps: r.steps.map(function (q) { return { t: q.t, name: q.byName || q.name, st: q.st, at: q.at }; }), off: (pl.calc && pl.calc.off) || [] };
}
function apiWfTokenAct(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var x = wfxTokenRow_(p.t);
    if (['approve', 'reject', 'revise'].indexOf(p.action) < 0) throw err_('Aksi tidak valid', 'VALID');
    var c = CacheService.getScriptCache(), k = 'WFT:' + x.row.token_hash; if (c.get(k)) throw err_('Sedang diproses', 'BUSY'); c.put(k, '1', 30);
    var ctx = { user: { username: 'wa:' + x.row.who, role: 'WA_APPROVER', name: x.row.who_name, id: '' }, device: 'whatsapp', estates: null, divisions: null };
    var res = wfxActCore_(ctx, { id: x.r.id, action: p.action, note: p.note, sign: p.sign }, { who: x.row.who, name: x.row.who_name });
    var used = {}; Object.keys(x.row).forEach(function (kk) { used[kk] = x.row[kk]; }); used.used_at = now_();
    updateObj_(WFX_SHEET.TOK, x.row._row, used);
    return { status: res.status, next: (res.next || []).map(function (l) { return { name: l.name, step: l.step, wa: l.wa }; }) };
  } finally { lock.releaseLock(); }
}
function wfxTokenPage_(t) {
  var url = wfxBaseUrl_(), st = getSettings_();
  var h = '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Persetujuan \u2014 ' + wfxEsc_(st.app_title || APP.NAME) + '</title>'
    + '<style>body{font-family:Arial,Helvetica,sans-serif;background:#eef3f0;margin:0;color:#1b2a22}.w{max-width:560px;margin:0 auto;padding:16px}.c{background:#fff;border-radius:16px;padding:18px;box-shadow:0 4px 18px rgba(0,0,0,.08);margin-bottom:12px}'
    + 'h1{font-size:18px;margin:0 0 4px;color:#0f6b4b}.m{color:#5b6b62;font-size:13px}.l{margin:6px 0;font-size:14px;line-height:1.45}.st{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.st span{font-size:12px;padding:4px 8px;border-radius:99px;background:#eef1ef}.st .OK{background:#d8f1e4;color:#0f6b4b}.st .PEND{background:#fff2cf;color:#8a5a00}.st .NO{background:#fde0e0;color:#b42318}'
    + 'textarea{width:100%;box-sizing:border-box;min-height:70px;border:1px solid #cfd8d3;border-radius:10px;padding:10px;font:inherit}button{border:0;border-radius:12px;padding:14px;font-size:16px;font-weight:700;width:100%;margin-top:8px;cursor:pointer}'
    + '.ok{background:#0f6b4b;color:#fff}.no{background:#b42318;color:#fff}.rv{background:#fff;border:1px solid #c8962e!important;color:#8a5a00}canvas{border:1px dashed #9fb3a8;border-radius:10px;width:100%;height:120px;touch-action:none;background:#fafcfb}a.att{display:inline-block;margin:4px 6px 0 0;font-size:13px}.err{background:#fde0e0;color:#b42318;padding:12px;border-radius:10px}.done{background:#d8f1e4;color:#0f6b4b;padding:14px;border-radius:12px;font-weight:700}</style></head><body><div class="w">'
    + '<div class="c" style="display:flex;gap:10px;align-items:center"><div style="font-size:28px">\u{1F334}</div><div><b>' + wfxEsc_(st.app_title || APP.NAME) + '</b><div class="m">Persetujuan tanpa login \u00B7 tautan sekali pakai</div></div></div><div id="app" class="c">Memuat\u2026</div></div>'
    + '<script>var T=' + JSON.stringify(String(t || '')) + ';function E(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}'
    + 'function call(a,p,ok){google.script.run.withSuccessHandler(function(s){var r=JSON.parse(s);if(r.ok)ok(r.data);else document.getElementById("app").innerHTML="<div class=err>"+E(r.error)+"</div>"}).withFailureHandler(function(e){document.getElementById("app").innerHTML="<div class=err>"+E(e.message||e)+"</div>"}).rpc(a,null,p,"whatsapp")}'
    + 'var sig=null;function pad(){var c=document.getElementById("sg"),x=c.getContext("2d"),d=false;c.width=c.offsetWidth*2;c.height=240;x.lineWidth=4;x.lineCap="round";function P(e){var r=c.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return[(t.clientX-r.left)*2,(t.clientY-r.top)*2]}'
    + 'c.onpointerdown=function(e){d=true;var p=P(e);x.beginPath();x.moveTo(p[0],p[1]);sig=1};c.onpointermove=function(e){if(!d)return;var p=P(e);x.lineTo(p[0],p[1]);x.stroke()};c.onpointerup=c.onpointerleave=function(){d=false}}'
    + 'function go(a){var n=document.getElementById("nt").value.trim();if(a!=="approve"&&!n){alert("Alasan wajib diisi untuk menolak/mengembalikan");return}if(!confirm(a==="approve"?"Setujui pengajuan ini?":a==="reject"?"Tolak pengajuan ini?":"Kembalikan untuk revisi?"))return;var bs=document.querySelectorAll("button");for(var i=0;i<bs.length;i++)bs[i].disabled=true;'
    + 'call("wfTokenAct",{t:T,action:a,note:n,sign:sig?document.getElementById("sg").toDataURL("image/png"):""},function(d){var h="<div class=done>\u2714 Terima kasih, keputusan Anda tercatat. Status: "+E(d.status)+"</div>";if(d.next&&d.next.length){h+="<p class=l>Teruskan ke approver berikutnya:</p>";d.next.forEach(function(n){h+="<a href=\\""+E(n.wa)+"\\" target=_blank><button class=ok>Kirim WhatsApp ke "+E(n.name)+" ("+E(n.step)+")</button></a>"})}document.getElementById("app").innerHTML=h})}'
    + 'call("wfTokenInfo",{t:T},function(d){var h="<h1>"+E(d.type)+"</h1><div class=m>"+E(d.code)+" \u00B7 langkah: <b>"+E(d.step)+"</b> \u00B7 approver: "+E(d.approver)+"</div><hr>";d.summary.forEach(function(s){h+="<div class=l>"+E(s)+"</div>"});'
    + 'if(d.lines.length){h+="<div class=l><b>Rincian:</b><br>"+d.lines.map(E).join("<br>")+"</div>"}if(d.off&&d.off.length){h+="<div class=m>Tidak dihitung: "+d.off.map(function(o){return E(o.d+" ("+o.why+")")}).join(", ")+"</div>"}'
    + 'if(d.attach.length){h+="<div class=l><b>Lampiran:</b><br>"+d.attach.map(function(a){return"<a class=att target=_blank href=\\""+E(a.url)+"\\">\u{1F4CE} "+E(a.name)+"</a>"}).join("")+"</div>"}'
    + 'h+="<div class=st>"+d.steps.map(function(s){return"<span class="+s.st+">"+E(s.t)+(s.name?": "+E(s.name):"")+"</span>"}).join("")+"</div><hr><label class=m>Catatan / alasan</label><textarea id=nt placeholder=\\"Wajib bila menolak/mengembalikan\\"></textarea>'
    + '<label class=m>Tanda tangan (opsional)</label><canvas id=sg></canvas><button class=ok onclick=go(\\"approve\\")>\u2714 SETUJUI</button><button class=rv onclick=go(\\"revise\\")>\u21A9 Kembalikan untuk Revisi</button><button class=no onclick=go(\\"reject\\")>\u2716 TOLAK</button>";document.getElementById("app").innerHTML=h;pad()})'
    + '</script></body></html>';
  void url; return h;
}

/* ---------------- INTEGRASI MODUL LAIN (saat disetujui penuh) ---------------- */
function wfxIntegrate_(r, ctx) {
  var out = [], p = r.payload, emp = wfxEmp_(r.emp_no) || {}, sys = { user: { username: 'wfx:' + String(ctx.user.username).replace(/^wa:/, ''), role: 'SUPER_ADMIN', id: 'wfx' }, device: 'workflow', estates: null, divisions: null };
  function att(empNo, ds, code, hrs) {
    var sc = sc_('attendance'), e = wfxEmp_(empNo); if (!e || !e.estate_code) return 'lewati (Head Office/tanpa estate)';
    var ex = rowsOf_('attendance').filter(function (a) { return a.emp_no === empNo && wfxD_(a.a_date) === ds; })[0];
    var rec = ex ? { id: ex.id, version: ex.version } : { a_date: ds, emp_no: empNo, estate_code: e.estate_code };
    if (code) { rec.att = code; rec.activity = r.code; if (!ex) rec.hk = 0; } else { rec.ot_hours = hrs; if (!ex) { rec.att = 'H'; rec.activity = 'Lembur ' + r.code; } }
    saveCore_(sys, sc, rec); return ex ? 'perbarui' : 'baru';
  }
  if (r.type === 'CUTI' || (r.type === 'IZIN' && p.izin_type === 'Tidak Masuk Kerja')) {
    var code = r.type === 'IZIN' ? 'I' : (p.leave_type === 'CS' ? 'S' : 'C'), dates = r.type === 'CUTI' ? ((p.calc && p.calc.dates) || []) : wfxDates_(r.date_from, r.date_to), n = 0, skip = '';
    dates.forEach(function (d) { try { var res = att(r.emp_no, d, code); if (res.indexOf('lewati') === 0) skip = res; else n++; } catch (e) { out.push({ ok: false, msg: 'Absensi ' + d + ': ' + e.message }); } });
    out.push({ ok: true, msg: skip && !n ? 'Absensi: ' + skip : 'Absensi "' + code + '" tercatat untuk ' + n + ' hari kerja' });
  }
  if (r.type === 'LEMBUR') {
    var okN = 0; (p.lines || []).forEach(function (l) { try { var res = att(l.emp_no, r.date_from, null, l.hours); if (res.indexOf('lewati') < 0) okN++; } catch (e) { out.push({ ok: false, msg: 'Lembur ' + l.emp_no + ': ' + e.message }); } });
    out.push({ ok: true, msg: 'Jam lembur masuk ke Absensi untuk ' + okN + ' karyawan' });
  }
  if (r.type === 'PENGADAAN') {
    var prs = [], manual = 0, prSc = sc_('pr');
    (p.lines || []).forEach(function (l, i) {
      if (!l.item_code) { manual++; return; }
      try {
        var no = r.code.replace(/\//g, '-') + '-' + (i + 1), got = saveCore_(sys, prSc, { pr_no: no, pr_date: today_(), estate_code: r.estate_code || (rowsOf_('estates')[0] || {}).code, item_code: l.item_code, qty: l.qty, est_price: l.price, need_date: p.need_date || '', purpose: (l.desc || '') + ' \u2014 dari workflow ' + r.code }).rec;
        var row = findBy_('pr', 'id', got.id), c = {}; Object.keys(row).forEach(function (k) { c[k] = row[k]; }); c.status = 'APPROVED'; updateObj_(prSc.sheet, row._row, c);
        prs.push(no);
      } catch (e) { out.push({ ok: false, msg: 'PR baris ' + (i + 1) + ': ' + e.message }); }
    });
    out.push({ ok: true, msg: (prs.length ? 'Purchase Request disetujui dibuat: ' + prs.join(', ') : 'Tidak ada baris barang master') + (manual ? ' \u00B7 ' + manual + ' baris jasa/non-master diproses manual oleh Pengadaan' : '') });
  }
  if (r.type === 'BON') {
    var smSc = sc_('stock_moves'), wh = findBy_('warehouses', 'code', p.wh_code) || {}, mv = [];
    (p.lines || []).forEach(function (l, i) {
      try {
        var got = saveCore_(sys, smSc, { m_date: today_(), wh_code: p.wh_code, estate_code: wh.estate_code || r.estate_code, item_code: l.item_code, move_type: 'OUT', qty: l.qty, ref_doc: r.code, cost_center: p.cost_center || '', block_code: l.block_code || '' }).rec;
        var row = findBy_('stock_moves', 'id', got.id), c = {}; Object.keys(row).forEach(function (k) { c[k] = row[k]; }); c.status = 'APPROVED'; updateObj_(smSc.sheet, row._row, c); mv.push(l.item_code);
      } catch (e) { out.push({ ok: false, msg: 'Mutasi stok baris ' + (i + 1) + ': ' + e.message }); }
    });
    out.push({ ok: true, msg: 'Mutasi Stok OUT (status Disetujui) dibuat untuk ' + mv.length + ' barang \u2014 Gudang tinggal Posting saat barang diserahkan' });
  }
  if (r.type === 'DEKLARASI') {
    var sp0 = wfxFind_(r.ref_code); if (sp0) { var sp = wfxFull_(sp0); sp.payload.settled = r.code; sp.payload.settle_diff = p.diff; sp.integ = (sp.integ || []).concat([{ ok: true, msg: 'Dipertanggungjawabkan melalui ' + r.code }]); wfxWrite_(sp, sp0); }
    out.push({ ok: true, msg: p.diff > 0 ? 'Kurang bayar ' + wfxRp_(p.diff) + ' \u2014 Keuangan membayarkan ke karyawan' : p.diff < 0 ? 'Lebih bayar ' + wfxRp_(-p.diff) + ' \u2014 karyawan mengembalikan ke kas' : 'Realisasi sama dengan uang muka' });
  }
  if (r.type === 'HAKCUTI') {
    var ex = Number(wfxConf_().c.comp.expiry_days) || 0, g0 = today_(), e0 = ex ? new Date(new Date(g0 + 'T00:00:00Z').getTime() + ex * 864e5).toISOString().substr(0, 10) : '9999-12-31';
    p.granted_at = g0; p.expires = e0;
    (p.sppd_codes || []).forEach(function (cd) { var s0 = wfxFind_(cd); if (s0) { var sf = wfxFull_(s0); sf.payload.comp_claimed = r.code; wfxWrite_(sf, s0); } });
    out.push({ ok: true, msg: 'Saldo cuti pengganti +' + r.days + ' hari' + (ex ? ', berlaku s.d. ' + e0 : '') + '. Dapat dipakai lewat Cuti jenis "Cuti Pengganti" atau dicairkan sebagai insentif.' });
  }
  if (r.type === 'BAYARCP') out.push({ ok: true, msg: 'Saldo cuti pengganti berkurang ' + r.days + ' hari. Siap dibayarkan Keuangan: ' + wfxRp_(r.amount) + ' (' + p.rate_basis + ')' });
  if (['SPPD', 'KASBON', 'KLAIM'].indexOf(r.type) > -1 && Number(r.amount) > 0) out.push({ ok: true, msg: 'Siap dibayarkan Keuangan: ' + wfxRp_(r.amount) + (r.type === 'SPPD' ? ' (uang muka dinas; wajib Deklarasi setelah kembali)' : '') });
  if (r.type === 'KENDARAAN' || (r.type === 'SPPD' && p.vehicle_code)) out.push({ ok: true, msg: p.vehicle_code ? 'Kendaraan ' + p.vehicle_code + ' dipesan ' + r.date_from + ' s.d. ' + r.date_to : 'GA/Traksi menentukan unit kendaraan' });
  void emp; return out;
}

/** Item untuk Pusat Persetujuan & lencana. */
function wfxPendingFor_(ctx) {
  try { return wfxRows_().filter(function (r) { return r.status === 'SUBMITTED'; }).map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.steps = wfxJ_(r.steps, []); o.cur = Number(r.cur) || 0; return o; }).filter(function (r) { return wfxCanAct_(ctx, r); }).map(function (r) { var s = r.steps[r.cur]; return { mod: 'wfx', title: 'Workflow: ' + WFX_TYPES[r.type].t, id: r.id, code: r.code, status: 'SUBMITTED', by: r.emp_name, at: r.updated_at, estate: r.estate_code || 'HO', amount: r.amount, step: s.t }; }); } catch (e) { return []; }
}

/* ---------------- DELEGASI WEWENANG ---------------- */
function apiWfDelegate(ctx, p) {
  var me = String(ctx.user.username).toLowerCase();
  if (p.stop) { var d = table_(WFX_SHEET.DEL).rows.filter(function (x) { return x.id === p.stop; })[0]; if (!d || (String(d.from_user).toLowerCase() !== me && ctx.user.role !== 'SUPER_ADMIN')) throw err_('Delegasi tidak ditemukan', 'NOTFOUND'); var c = {}; Object.keys(d).forEach(function (k) { c[k] = d[k]; }); c.active = false; updateObj_(WFX_SHEET.DEL, d._row, c); audit_(ctx, 'WFX_DELEGATE_STOP', 'wfx', d.id, null, null); return { ok: true }; }
  var to = String(p.to_user || '').toLowerCase(), u = userBy_('username', to);
  if (!u || !truthy_(u.active)) throw err_('Pengguna penerima delegasi tidak ditemukan/aktif', 'VALID');
  if (to === me) throw err_('Tidak dapat mendelegasikan ke diri sendiri', 'VALID');
  if (!p.date_from || !p.date_to || wfxD_(p.date_to) < wfxD_(p.date_from)) throw err_('Periode delegasi tidak valid', 'VALID');
  var rec = { id: uid_(), from_user: me, to_user: to, date_from: wfxD_(p.date_from), date_to: wfxD_(p.date_to), note: String(p.note || '').substr(0, 200), active: true, created_at: now_() };
  appendObj_(WFX_SHEET.DEL, WFX_DEL_COLS, rec); audit_(ctx, 'WFX_DELEGATE', 'wfx', rec.id, null, rec);
  notify_(to, 'Anda menerima delegasi persetujuan dari ' + me + ' (' + rec.date_from + ' s.d. ' + rec.date_to + ')', 'wfx', '');
  return rec;
}

/* ---------------- HARI LIBUR NASIONAL (isi cepat, admin) ---------------- */
var WFX_HOL = {
  '2026': { ln: [['01-01', 'Tahun Baru 2026 Masehi'], ['01-16', 'Isra Mikraj Nabi Muhammad SAW'], ['02-17', 'Tahun Baru Imlek 2577 Kongzili'], ['03-19', 'Hari Suci Nyepi (Tahun Baru Saka 1948)'], ['03-21', 'Idulfitri 1447 H'], ['03-22', 'Idulfitri 1447 H'], ['04-03', 'Wafat Yesus Kristus'], ['04-05', 'Kebangkitan Yesus Kristus (Paskah)'], ['05-01', 'Hari Buruh Internasional'], ['05-14', 'Kenaikan Yesus Kristus'], ['05-27', 'Iduladha 1447 H'], ['05-31', 'Hari Raya Waisak 2570 BE'], ['06-01', 'Hari Lahir Pancasila'], ['06-16', '1 Muharam Tahun Baru Islam 1448 H'], ['08-17', 'Proklamasi Kemerdekaan RI'], ['08-25', 'Maulid Nabi Muhammad SAW'], ['12-25', 'Kelahiran Yesus Kristus']],
    cb: [['02-16', 'Cuti Bersama Tahun Baru Imlek'], ['03-18', 'Cuti Bersama Hari Suci Nyepi'], ['03-20', 'Cuti Bersama Idulfitri 1447 H'], ['03-23', 'Cuti Bersama Idulfitri 1447 H'], ['03-24', 'Cuti Bersama Idulfitri 1447 H'], ['05-15', 'Cuti Bersama Kenaikan Yesus Kristus'], ['05-28', 'Cuti Bersama Iduladha 1447 H'], ['12-24', 'Cuti Bersama Kelahiran Yesus Kristus']], ref: 'SKB 3 Menteri No. 1497/2025, 2/2025, 5/2025' },
  '2027': { ln: [['01-01', 'Tahun Baru 2027 Masehi'], ['01-05', 'Isra Mikraj Nabi Muhammad SAW'], ['02-06', 'Tahun Baru Imlek 2578 Kongzili'], ['03-08', 'Hari Suci Nyepi (Tahun Baru Saka 1949)'], ['03-10', 'Idulfitri 1448 H'], ['03-11', 'Idulfitri 1448 H'], ['03-26', 'Wafat Yesus Kristus'], ['03-28', 'Kebangkitan Yesus Kristus (Paskah)'], ['05-01', 'Hari Buruh Internasional'], ['05-06', 'Kenaikan Yesus Kristus'], ['05-17', 'Iduladha 1448 H'], ['05-20', 'Hari Raya Waisak 2571 BE'], ['06-01', 'Hari Lahir Pancasila'], ['06-06', '1 Muharam Tahun Baru Islam 1449 H'], ['08-15', 'Maulid Nabi Muhammad SAW'], ['08-17', 'Proklamasi Kemerdekaan RI'], ['12-25', 'Kelahiran Yesus Kristus'], ['12-26', 'Isra Mikraj Nabi Muhammad SAW']],
    cb: [['02-05', 'Cuti Bersama Tahun Baru Imlek'], ['03-09', 'Cuti Bersama Idulfitri 1448 H'], ['03-12', 'Cuti Bersama Idulfitri 1448 H'], ['03-15', 'Cuti Bersama Idulfitri 1448 H'], ['03-25', 'Cuti Bersama Wafat Yesus Kristus'], ['05-18', 'Cuti Bersama Iduladha 1448 H'], ['05-19', 'Cuti Bersama Waisak'], ['12-24', 'Cuti Bersama Kelahiran Yesus Kristus']], ref: 'SKB 3 Menteri No. 1205/2026, 3/2026, 2/2026' }
};
function apiWfHolidaySeed(ctx, p) {
  need_(ctx, 'sys', 'E');
  var y = String(p.year), d = WFX_HOL[y]; if (!d) throw err_('Data bawaan hanya tersedia untuk ' + Object.keys(WFX_HOL).join(', ') + '. Tahun lain diisi manual / impor CSV.', 'VALID');
  var sc = sc_('holidays'), n = 0, skip = 0, ded = p.cb_deduct ? 'Ya' : 'Tidak';
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    d.ln.map(function (x) { return [x, 'Libur Nasional', 'Tidak']; }).concat(d.cb.map(function (x) { return [x, 'Cuti Bersama', ded]; })).forEach(function (a) {
      var ds = y + '-' + a[0][0];
      if (rowsOf_('holidays').some(function (h) { return wfxD_(h.h_date) === ds && h.applies === 'Semua'; })) { skip++; return; }
      saveCore_(ctx, sc, { h_date: ds, name: a[0][1], h_type: a[1], applies: 'Semua', deduct: a[2], notes: d.ref }); n++;
    });
  } finally { lock.releaseLock(); }
  return { added: n, skipped: skip, ref: d.ref };
}

/* ---------------- PENGINGAT OTOMATIS (pemicu per jam, dipasang dari menu) ---------------- */
function wfxReminder() {
  var sla = Number(wfxConf_().c.sla_hours) || 24, c = CacheService.getScriptCache(), n = 0;
  wfxRows_().map(wfxFull_).forEach(function (r) {
    if (r.status !== 'SUBMITTED') return;
    var age = (Date.now() - new Date(r.updated_at).getTime()) / 36e5, k = 'WFR:' + r.id + ':' + r.cur + ':' + Math.floor(age / sla);
    if (age < sla || c.get(k)) return; c.put(k, '1', 21600);
    var s = r.steps[r.cur]; s.users.concat(wfxDelegatesFor_(s.users)).forEach(function (u) { notify_(u, '\u23F0 Pengingat: ' + WFX_TYPES[r.type].t + ' ' + r.code + ' menunggu persetujuan Anda ' + Math.round(age) + ' jam', 'wfx', r.id); });
    if (wfxConf_().c.wa_mode === 'gateway') wfxDispatch_(r, null); n++;
  });
  return n;
}
function wfxInstallReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'wfxReminder') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('wfxReminder').timeBased().everyHours(1).create();
  try { SpreadsheetApp.getUi().alert('Pengingat workflow otomatis aktif (setiap jam).'); } catch (e) { }
  return 'ok';
}


/* ===== Operasi.gs ===== */
/**
 * PALM OS ENTERPRISE — Operasi.gs
 * Pembibitan (batch kecambah -> kegiatan -> penyaluran ke blok), Land Clearing (proyek & progres per tahapan),
 * Kerja Borongan internal/eksternal (SPK -> BA opname -> jurnal & daftar upah), Audit & Inspeksi
 * (template checklist -> pelaksanaan -> temuan/CAPA otomatis), dan QR Code (resolusi kode, verifikasi dokumen).
 * Aturan muat: hanya deklarasi & fungsi; referensi ke berkas lain hanya di dalam badan fungsi.
 */
var OPS_LC_STAGES = ['Survei & Pancang Batas', 'Imas', 'Tumbang', 'Rencek & Rumpuk', 'Pembuatan Jalan & Parit', 'Pancang Tanam', 'Lubang Tanam', 'Tanam Kacangan (LCC)', 'Tanam Kelapa Sawit'];
var OPS_OPEN = ['SUBMITTED', 'VERIFIED', 'APPROVED'];
var OPS_QR_MODS = ['blocks', 'employees', 'items', 'warehouses', 'assets', 'vehicles', 'nurseries', 'seed_batches', 'bor_spk', 'lc_projects', 'audits', 'findings', 'estates', 'divisions', 'mills', 'documents', 'permits'];

/* ---------------- UTIL ---------------- */
function opsConf_() {
  var st = getSettings_(), d = DEFAULT_SETTINGS.ops, s = st.ops || {}, o = {};
  Object.keys(d).forEach(function (k) { o[k] = s[k] !== undefined ? s[k] : d[k]; });
  o.bor_coa = Object.assign({}, d.bor_coa, s.bor_coa || {}); return o;
}
function opsN_(v) { return Number(v) || 0; }
function opsCopy_(r) { var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; }); return c; }
function opsPosted_(r, ov) { if (ov && r.id === ov.id) return ov.st === 'POSTED'; return r.status === 'POSTED'; }
function opsSet_(mod, row, patch) { var c = opsCopy_(row); Object.keys(patch).forEach(function (k) { c[k] = patch[k]; }); c.updated_at = now_(); updateObj_(sc_(mod).sheet, row._row, c); return c; }
function opsMonths_(d) { if (!d) return ''; var a = new Date(String(d).substr(0, 10) + 'T00:00:00Z'), b = new Date(today_() + 'T00:00:00Z'); return Math.max(0, Math.round((b - a) / (864e5 * 30.44) * 10) / 10); }
function opsAddDays_(d, n) { return new Date(new Date(String(d).substr(0, 10) + 'T00:00:00Z').getTime() + n * 864e5).toISOString().substr(0, 10); }
function opsSysCtx_(ctx) { return ctx; }

/* ---------------- PEMBIBITAN ---------------- */
function opsBatchCalc_(batchNo, ov) {
  var b = findBy_('seed_batches', 'batch_no', batchNo); if (!b) return null;
  var culled = 0, disp = 0, pend = 0;
  rowsOf_('nursery_acts').forEach(function (a) { if (a.batch_no === batchNo && opsPosted_(a, ov)) culled += opsN_(a.qty_culled); });
  rowsOf_('seed_dispatch').forEach(function (d) {
    if (d.batch_no !== batchNo) return;
    if (opsPosted_(d, ov)) disp += opsN_(d.qty); else if (!(ov && d.id === ov.id) && OPS_OPEN.indexOf(d.status) > -1) pend += opsN_(d.qty);
  });
  var live = opsN_(b.qty_received) - opsN_(b.qty_abnormal) - culled - disp;
  return { b: b, culled: culled, disp: disp, pend: pend, live: live, age: opsMonths_(b.receive_date) };
}
function opsBatchRefresh_(batchNo, ov) {
  var c = opsBatchCalc_(batchNo, ov); if (!c) return;
  var patch = { qty_culled: c.culled, qty_dispatched: c.disp, qty_live: c.live, age_month: c.age };
  if (c.live <= 0 && c.disp > 0) patch.stage = 'Habis';
  opsSet_('seed_batches', c.b, patch);
}

/* ---------------- LAND CLEARING ---------------- */
function opsLcCalc_(code, ov) {
  var p = findBy_('lc_projects', 'lc_code', code); if (!p) return null;
  var area = opsN_(p.area_ha), w = opsConf_().lc_weights || {}, by = {}, cost = 0;
  OPS_LC_STAGES.forEach(function (s) { by[s] = 0; });
  rowsOf_('lc_progress').forEach(function (r) { if (r.lc_code === code && opsPosted_(r, ov)) { by[r.stage] = (by[r.stage] || 0) + opsN_(r.ha_done); cost += opsN_(r.cost); } });
  var tw = 0, acc = 0, stages = OPS_LC_STAGES.map(function (s) { var wt = w[s] !== undefined ? Number(w[s]) : 1, pct = area ? Math.min(1, by[s] / area) : 0; tw += wt; acc += wt * pct; return { stage: s, ha: Math.round(by[s] * 100) / 100, pct: Math.round(pct * 1000) / 10, w: wt }; });
  return { p: p, stages: stages, pct: tw ? Math.round(acc / tw * 1000) / 10 : 0, cost: cost };
}
function opsLcRefresh_(code, ov) { var c = opsLcCalc_(code, ov); if (c) opsSet_('lc_projects', c.p, { progress_pct: c.pct, cost_real: c.cost }); }

/* ---------------- BORONGAN ---------------- */
function opsQcDeduct_(qc) {
  var rules = opsConf_().bor_qc || [[90, 0], [80, 5], [70, 10], [0, 20]];
  for (var i = 0; i < rules.length; i++) if (opsN_(qc) >= Number(rules[i][0])) return Number(rules[i][1]);
  return Number((rules[rules.length - 1] || [0, 0])[1]);
}
function opsTeam_(spk) {
  var ids = String(spk.team || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(String);
  if (spk.mandor_no && ids.indexOf(String(spk.mandor_no)) < 0) ids.unshift(String(spk.mandor_no));
  return ids;
}
function opsSpkRefresh_(spkNo, ov) {
  var s = findBy_('bor_spk', 'spk_no', spkNo); if (!s) return;
  var vol = 0, paid = 0;
  rowsOf_('bor_ba').forEach(function (b) { if (b.spk_no === spkNo && opsPosted_(b, ov)) { vol += opsN_(b.volume); paid += opsN_(b.net); } });
  opsSet_('bor_spk', s, { vol_done: Math.round(vol * 1000) / 1000, paid: Math.round(paid) });
}
function opsJournal_(ctx, ba, spk) {
  var c = opsConf_().bor_coa, ext = spk.executor === 'Eksternal', exp = ext ? c.expense_ext : c.expense_int, pay = ext ? c.payable_ext : c.payable_int;
  var miss = [exp, pay].concat(opsN_(ba.retention) > 0 ? [c.retention] : []).filter(function (a) { return !findBy_('coa', 'code', a); });
  if (miss.length) return 'Jurnal otomatis dilewati: akun COA ' + miss.join(', ') + ' belum ada (atur di Pengaturan > ops.bor_coa)';
  var who = ext ? (findBy_('vendors', 'code', spk.vendor_code) || {}).name || spk.vendor_code : 'Regu ' + ((findBy_('employees', 'emp_no', spk.mandor_no) || {}).name || spk.mandor_no);
  var memo = 'Borongan ' + spk.work_type + ' ' + spk.spk_no + ' / ' + ba.ba_no + ' — ' + who;
  var lines = [{ acct: exp, debit: opsN_(ba.net) + opsN_(ba.retention), credit: 0, memo: memo }, { acct: pay, debit: 0, credit: opsN_(ba.net), memo: ext ? 'Utang kontraktor' : 'Utang upah borongan' }];
  if (opsN_(ba.retention) > 0) lines.push({ acct: c.retention, debit: 0, credit: opsN_(ba.retention), memo: 'Retensi ' + spk.spk_no });
  var no = 'JB-' + String(ba.ba_no).replace(/[^A-Za-z0-9-]/g, '-');
  if (findBy_('journals', 'j_no', no)) return 'Jurnal ' + no + ' sudah ada';
  saveCore_(ctx, sc_('journals'), { j_no: no, j_date: ba.ba_date, estate_code: ba.estate_code, description: memo.substr(0, 180), lines: JSON.stringify(lines) });
  return 'Jurnal draft ' + no + ' dibuat untuk Keuangan';
}

/* ---------------- AUDIT ---------------- */
function opsTplItems_(text) {
  return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String).map(function (l, i) {
    var p = l.split('|').map(function (x) { return x.trim(); }); return { i: i, q: p[0], w: Number(p[1]) || 1, crit: /kritis|critical/i.test(p[2] || '') };
  }).filter(function (x) { return x.q; });
}
function opsScore_(tpl, ans) {
  var items = opsTplItems_(tpl.items), scale = tpl.scoring === 'Skala 1-5', tw = 0, got = 0, nc = [], critFail = false;
  items.forEach(function (it) {
    var a = (ans || []).filter(function (x) { return Number(x.i) === it.i; })[0] || {}, v = a.ans;
    if (v === undefined || v === '' || v === 'NA') return;
    tw += it.w;
    if (scale) { var n = Math.max(1, Math.min(5, Number(v) || 1)); got += it.w * (n - 1) / 4; if (n <= 2) { nc.push({ it: it, a: a }); if (it.crit) critFail = true; } }
    else { if (v === 'Ya') got += it.w; else { nc.push({ it: it, a: a }); if (it.crit) critFail = true; } }
  });
  var score = tw ? Math.round(got / tw * 1000) / 10 : 0, pass = opsN_(tpl.pass_score) || 80, answered = (ans || []).filter(function (x) { return x.ans !== undefined && x.ans !== ''; }).length;
  return { items: items, score: score, nc: nc, answered: answered, total: items.length, result: !answered ? 'Belum dinilai' : critFail ? 'TIDAK LULUS (butir kritis)' : score >= pass ? 'LULUS' : 'TIDAK LULUS' };
}
function opsFindingSource_(cat) {
  cat = String(cat || '');
  if (/^Lapangan|Pembibitan|Land Clearing|Borongan/.test(cat)) return 'Audit Lapangan';
  if (/Administrasi|Gudang|Keuangan/.test(cat)) return 'Audit Administrasi';
  if (/K3/.test(cat)) return 'K3'; if (/ISPO/.test(cat)) return 'ISPO'; return 'Audit Internal';
}

/* ---------------- HOOK (dipanggil generik oleh saveCore_ / apiTransition) ---------------- */
var OPS_HOOKS = {
  before: {
    nurseries: function (r) { if (r.capacity !== '' && opsN_(r.capacity) < 0) throw err_('Kapasitas tidak boleh negatif', 'VALID'); },
    seed_batches: function (r, ctx, ex) {
      if (opsN_(r.qty_received) <= 0) throw err_('Jumlah kecambah diterima harus > 0', 'VALID');
      if (opsN_(r.qty_abnormal) > opsN_(r.qty_received)) throw err_('Abnormal melebihi jumlah diterima', 'VALID');
      var n = r.nursery_code ? findBy_('nurseries', 'code', r.nursery_code) : null; if (n && !r.estate_code) r.estate_code = n.estate_code;
      r.seed_cost = Math.round(opsN_(r.qty_received) * opsN_(r.unit_price)) || '';
      var c = ex ? opsBatchCalc_(ex.batch_no) : null;
      r.qty_culled = c ? c.culled : 0; r.qty_dispatched = c ? c.disp : 0; r.qty_live = opsN_(r.qty_received) - opsN_(r.qty_abnormal) - r.qty_culled - r.qty_dispatched; r.age_month = opsMonths_(r.receive_date);
      if (!r.stage) r.stage = 'Pre-Nursery';
    },
    nursery_acts: function (r, ctx, ex) {
      var c = r.batch_no ? opsBatchCalc_(r.batch_no) : null; if (r.batch_no && !c) throw err_('Batch ' + r.batch_no + ' tidak ditemukan', 'REF');
      if (c && !r.estate_code) r.estate_code = c.b.estate_code;
      if (opsN_(r.qty_culled) < 0) throw err_('Jumlah afkir tidak boleh negatif', 'VALID');
      if (c && opsN_(r.qty_culled) > c.live - c.pend) throw err_('Afkir ' + r.qty_culled + ' melebihi stok bibit hidup (' + (c.live - c.pend) + ')', 'VALID');
      if (r.item_code && (!r.wh_code || opsN_(r.qty_item) <= 0)) throw err_('Isi gudang & jumlah bahan yang dipakai', 'VALID');
      if (r.activity === 'Seleksi/Culling' && !opsN_(r.qty_culled)) throw err_('Kegiatan seleksi: isi jumlah bibit yang diafkir', 'VALID');
    },
    seed_dispatch: function (r, ctx, ex) {
      var c = r.batch_no ? opsBatchCalc_(r.batch_no, ex ? { id: ex.id, st: 'X' } : null) : null; if (r.batch_no && !c) throw err_('Batch tidak ditemukan', 'REF');
      if (opsN_(r.qty) <= 0) throw err_('Jumlah bibit harus > 0', 'VALID');
      if (c && opsN_(r.qty) > c.live - c.pend) throw err_('Stok bibit batch ' + r.batch_no + ' tersedia ' + (c.live - c.pend) + ' (sudah dikurangi penyaluran yang sedang diproses)', 'STOCK');
      var b = r.block_code ? findBy_('blocks', 'code', r.block_code) : null; if (b) r.estate_code = r.estate_code || b.estate_code;
    },
    lc_projects: function (r) {
      if (opsN_(r.area_ha) <= 0) throw err_('Luas rencana harus > 0', 'VALID');
      if (r.executor === 'Kontraktor' && !r.vendor_code) throw err_('Pilih kontraktor untuk pelaksana Kontraktor', 'VALID');
      if (r.end_date && r.start_date && r.end_date < r.start_date) throw err_('Target selesai sebelum tanggal mulai', 'VALID');
    },
    lc_progress: function (r, ctx, ex) {
      var p = r.lc_code ? findBy_('lc_projects', 'lc_code', r.lc_code) : null; if (r.lc_code && !p) throw err_('Proyek LC tidak ditemukan', 'REF');
      if (!p) return; if (['CANCELLED', 'DRAFT', 'REJECTED'].indexOf(p.status) > -1) throw err_('Proyek ' + p.lc_code + ' belum disetujui (status ' + p.status + ')', 'STATE');
      r.estate_code = r.estate_code || p.estate_code;
      if (opsN_(r.ha_done) <= 0) throw err_('Luas selesai harus > 0', 'VALID');
      var cum = 0; rowsOf_('lc_progress').forEach(function (x) { if (x.lc_code === p.lc_code && x.stage === r.stage && (!ex || x.id !== ex.id) && ['CANCELLED', 'REJECTED'].indexOf(x.status) < 0) cum += opsN_(x.ha_done); });
      if (cum + opsN_(r.ha_done) > opsN_(p.area_ha) * 1.05) throw err_('Kumulatif tahap "' + r.stage + '" menjadi ' + (Math.round((cum + opsN_(r.ha_done)) * 100) / 100) + ' ha, melebihi luas proyek ' + p.area_ha + ' ha', 'VALID');
      if (r.spk_no) { var s = findBy_('bor_spk', 'spk_no', r.spk_no); if (s && s.lc_code && s.lc_code !== p.lc_code) throw err_('SPK ' + s.spk_no + ' terkait proyek LC lain (' + s.lc_code + ')', 'VALID'); }
    },
    bor_spk: function (r) {
      r.value = Math.round(opsN_(r.volume) * opsN_(r.rate)) || '';
      if (opsN_(r.volume) <= 0 || opsN_(r.rate) < 0) throw err_('Volume harus > 0 dan tarif tidak negatif', 'VALID');
      if (r.executor === 'Eksternal' && !r.vendor_code) throw err_('Borongan eksternal wajib memilih kontraktor/vendor', 'VALID');
      if (r.executor === 'Internal' && !r.mandor_no) throw err_('Borongan internal wajib memilih mandor/ketua regu', 'VALID');
      if (r.executor === 'Internal') opsTeam_(r).forEach(function (id) { if (!findBy_('employees', 'emp_no', id)) throw err_('Anggota regu "' + id + '" tidak terdaftar di Karyawan', 'REF'); });
      if (r.end_date && r.start_date && r.end_date < r.start_date) throw err_('Tanggal selesai sebelum tanggal mulai', 'VALID');
      if (opsN_(r.retention_pct) < 0 || opsN_(r.retention_pct) > 20) throw err_('Retensi 0-20%', 'VALID');
      if (r.work_cat === 'Land Clearing' && r.lc_code && !findBy_('lc_projects', 'lc_code', r.lc_code)) throw err_('Proyek LC tidak ditemukan', 'REF');
    },
    bor_ba: function (r, ctx, ex) {
      var s = r.spk_no ? findBy_('bor_spk', 'spk_no', r.spk_no) : null; if (r.spk_no && !s) throw err_('SPK tidak ditemukan', 'REF'); if (!s) return;
      if (['APPROVED', 'POSTED'].indexOf(s.status) < 0) throw err_('SPK ' + s.spk_no + ' belum disetujui (status ' + s.status + ')', 'STATE');
      r.estate_code = r.estate_code || s.estate_code;
      if (opsN_(r.volume) <= 0) throw err_('Volume opname harus > 0', 'VALID');
      if (r.audit_no && (r.qc_score === '' || r.qc_score == null)) { var au = findBy_('audits', 'audit_no', r.audit_no); if (au) r.qc_score = opsN_(au.score); }
      if (r.qc_score !== '' && r.qc_score != null && (opsN_(r.qc_score) < 0 || opsN_(r.qc_score) > 100)) throw err_('Nilai QC 0-100', 'VALID');
      if ((r.deduct_pct === '' || r.deduct_pct == null) && r.qc_score !== '' && r.qc_score != null) r.deduct_pct = opsQcDeduct_(r.qc_score);
      var ded = Math.max(0, Math.min(100, opsN_(r.deduct_pct))), gross = Math.round(opsN_(r.volume) * opsN_(s.rate)), after = Math.round(gross * (1 - ded / 100)), ret = Math.round(after * opsN_(s.retention_pct) / 100);
      r.gross = gross; r.retention = ret; r.net = after - ret;
      var cum = 0; rowsOf_('bor_ba').forEach(function (b) { if (b.spk_no === s.spk_no && (!ex || b.id !== ex.id) && ['CANCELLED', 'REJECTED'].indexOf(b.status) < 0) cum += opsN_(b.volume); });
      if (cum + opsN_(r.volume) > opsN_(s.volume) * 1.1) throw err_('Kumulatif opname ' + (cum + opsN_(r.volume)) + ' ' + s.unit + ' melebihi 110% volume SPK (' + s.volume + '). Buat addendum SPK.', 'VALID');
      if (r.period_from && r.period_to && r.period_to < r.period_from) throw err_('Periode tidak valid', 'VALID');
    },
    aud_templates: function (r) {
      var it = opsTplItems_(r.items); if (!it.length) throw err_('Isi minimal 1 butir pemeriksaan', 'VALID');
      if (it.length > 150) throw err_('Maksimal 150 butir per template', 'VALID');
      if (r.pass_score === '' || r.pass_score == null) r.pass_score = 80;
    },
    audits: function (r, ctx) {
      var t = r.template_code ? findBy_('aud_templates', 'code', r.template_code) : null; if (r.template_code && !t) throw err_('Template tidak ditemukan', 'REF'); if (!t) return;
      r.category = t.category; if (!r.auditor) r.auditor = ctx.user.name || ctx.user.username;
      var ans = []; try { ans = typeof r.answers === 'string' ? JSON.parse(r.answers || '[]') : (r.answers || []); } catch (e) { throw err_('Jawaban checklist tidak valid', 'VALID'); }
      ans.forEach(function (a) { if (a.photo && String(a.photo).indexOf('data:') === 0) { var st = storeFile_(a.photo, 'AUD_' + (r.audit_no || '')); try { a.photo = JSON.parse(st).url || st; } catch (e) { a.photo = st; } } if (a.note) a.note = String(a.note).substr(0, 400); });
      var sc = opsScore_(t, ans); r.answers = JSON.stringify(ans); r.score = sc.answered ? sc.score : ''; r.result = sc.result; r.findings_n = sc.nc.length;
      if (r.block_code && !r.estate_code) { var b = findBy_('blocks', 'code', r.block_code); if (b) { r.estate_code = b.estate_code; r.division_code = r.division_code || b.division_code; } }
    },
    findings: function (r, ctx, ex) { if (r.close_status === 'Closed' && !r.closed_date) r.closed_date = today_(); }
  },
  transition: {
    nursery_acts: function (action, r, ctx) {
      var sm = sc_('stock_moves');
      if (action === 'post') {
        if (r.item_code && opsN_(r.qty_item) > 0) {
          var bal = stockBal_(r.item_code, r.wh_code); if (bal < opsN_(r.qty_item)) throw err_('Stok ' + r.item_code + ' di gudang ' + r.wh_code + ' tidak cukup (saldo ' + bal + ')', 'STOCK');
          var it = findBy_('items', 'code', r.item_code), wh = findBy_('warehouses', 'code', r.wh_code) || {};
          appendObj_(sm.sheet, modHeaders_(sm), { id: uid_(), status: WF.POSTED, version: 1, deleted: false, created_at: now_(), created_by: 'system:' + ctx.user.username, updated_at: now_(), updated_by: ctx.user.username, m_date: r.act_date, wh_code: r.wh_code, estate_code: wh.estate_code || r.estate_code, item_code: r.item_code, move_type: 'OUT', qty: opsN_(r.qty_item), unit_cost: it ? opsN_(it.price) || '' : '', batch: r.batch_no, ref_doc: 'NUR:' + r.id, cost_center: '', block_code: '' });
        }
        opsBatchRefresh_(r.batch_no, { id: r.id, st: 'POSTED' });
      }
      if (action === 'cancel' && r.status === 'POSTED') {
        rowsOf_('stock_moves').filter(function (m) { return m.ref_doc === 'NUR:' + r.id && m.status === WF.POSTED; }).forEach(function (m) { opsSet_('stock_moves', m, { status: WF.CANCELLED, updated_by: ctx.user.username }); });
        opsBatchRefresh_(r.batch_no, { id: r.id, st: 'CANCELLED' });
      }
    },
    seed_dispatch: function (action, r, ctx) {
      var posting = action === 'post', reversing = action === 'cancel' && r.status === 'POSTED'; if (!posting && !reversing) return;
      opsBatchRefresh_(r.batch_no, { id: r.id, st: posting ? 'POSTED' : 'CANCELLED' });
      if (r.purpose !== 'Sisipan' && opsConf_().nur_update_palms) {
        var b = findBy_('blocks', 'code', r.block_code); if (b) { var palms = opsN_(b.palms) + (posting ? 1 : -1) * opsN_(r.qty), patch = { palms: Math.max(0, palms) }; if (opsN_(b.planted_ha)) patch.sph = Math.round(Math.max(0, palms) / opsN_(b.planted_ha)); opsSet_('blocks', b, patch); }
      }
      notify_(r.created_by, 'Penyaluran bibit ' + r.sd_no + ' (' + r.qty + ' bibit ke ' + r.block_code + ') ' + (posting ? 'diposting' : 'dibatalkan') + (r.purpose !== 'Sisipan' && opsConf_().nur_update_palms ? '; jumlah pokok blok diperbarui' : ''), 'seed_dispatch', r.id);
    },
    lc_progress: function (action, r) {
      if (action === 'post') opsLcRefresh_(r.lc_code, { id: r.id, st: 'POSTED' });
      if (action === 'cancel' && r.status === 'POSTED') opsLcRefresh_(r.lc_code, { id: r.id, st: 'CANCELLED' });
    },
    bor_ba: function (action, r, ctx) {
      if (action === 'post') {
        opsSpkRefresh_(r.spk_no, { id: r.id, st: 'POSTED' });
        var s = findBy_('bor_spk', 'spk_no', r.spk_no), msg = '';
        try { msg = opsJournal_(ctx, r, s); } catch (e) { msg = 'Jurnal otomatis gagal: ' + e.message; }
        notify_(r.created_by, 'BA ' + r.ba_no + ' diposting — dibayar Rp ' + fmtNum_(r.net) + '. ' + msg, 'bor_ba', r.id);
        if (s && s.executor === 'Internal') notify_(r.created_by, 'Upah borongan internal ' + r.ba_no + ' masuk laporan "Upah Borongan Internal" (dibagi ' + opsTeam_(s).length + ' orang)', 'bor_ba', r.id);
      }
      if (action === 'cancel' && r.status === 'POSTED') {
        opsSpkRefresh_(r.spk_no, { id: r.id, st: 'CANCELLED' });
        var j = findBy_('journals', 'j_no', 'JB-' + String(r.ba_no).replace(/[^A-Za-z0-9-]/g, '-'));
        if (j && j.status === WF.DRAFT) opsSet_('journals', j, { status: WF.CANCELLED, updated_by: ctx.user.username });
      }
    },
    audits: function (action, r, ctx) {
      if (action !== 'submit') return;
      var t = findBy_('aud_templates', 'code', r.template_code); if (!t) return;
      var ans = []; try { ans = JSON.parse(r.answers || '[]'); } catch (e) { }
      var sc = opsScore_(t, ans), fsc = sc_('findings'), n = 0;
      if (!sc.answered) throw err_('Checklist belum diisi', 'VALID');
      sc.nc.forEach(function (x, i) {
        var no = r.audit_no + '-F' + (i + 1); if (findBy_('findings', 'f_no', no)) return;
        saveCore_(ctx, fsc, { f_no: no, f_date: r.audit_date, source: opsFindingSource_(r.category), estate_code: r.estate_code, audit_no: r.audit_no, block_code: r.block_code || '', finding: (x.it.q + (x.a.note ? ' — ' + x.a.note : '')).substr(0, 900), risk: x.it.crit ? 'Tinggi' : 'Sedang', pic: r.auditee || '', pic_user: r.pic_user || '', due_date: opsAddDays_(r.audit_date, x.it.crit ? 7 : 14), close_status: 'Open', evidence: '' });
        n++;
      });
      if (n && r.pic_user) notify_(r.pic_user, 'Audit ' + r.audit_no + ' (' + r.category + '): ' + n + ' temuan perlu tindak lanjut', 'findings', '');
      if (n) notify_(r.created_by, 'Audit ' + r.audit_no + ': ' + n + ' temuan otomatis dibuat di "Temuan Audit & CAPA"', 'audits', r.id);
    }
  }
};

/* ---------------- API ---------------- */
function apiBorFill(ctx, p) {
  var s = findBy_('bor_spk', 'spk_no', p.spk_no); if (!s) throw err_('SPK tidak ditemukan', 'REF');
  var f = String(p.from || s.start_date || '0000').substr(0, 10), t = String(p.to || today_()).substr(0, 10), out = { unit: s.unit, source: '', volume: null, detail: '' };
  if (s.work_cat === 'Panen' && s.block_code && ['Kg', 'Ton', 'Janjang'].indexOf(s.unit) > -1) {
    var team = s.executor === 'Internal' ? opsTeam_(s) : null, kg = 0, jj = 0, n = 0;
    rowsOf_('harvest').forEach(function (h) { if (h.block_code !== s.block_code || ['CANCELLED', 'REJECTED', 'DRAFT'].indexOf(h.status) > -1) return; var d = String(h.h_date).substr(0, 10); if (d < f || d > t) return; if (team && team.length > 1 && team.indexOf(String(h.harvester_no)) < 0) return; kg += opsN_(h.kg); jj += opsN_(h.janjang); n++; });
    out.volume = s.unit === 'Kg' ? kg : s.unit === 'Ton' ? Math.round(kg) / 1000 : jj; out.source = 'Hasil Panen blok ' + s.block_code; out.detail = n + ' transaksi panen · ' + fmtNum_(kg) + ' kg · ' + fmtNum_(jj) + ' janjang';
  } else if (s.work_cat === 'Land Clearing') {
    var by = {}, m = 0; rowsOf_('lc_progress').forEach(function (r) { if (r.spk_no !== s.spk_no || ['CANCELLED', 'REJECTED', 'DRAFT'].indexOf(r.status) > -1) return; var d = String(r.p_date).substr(0, 10); if (d < f || d > t) return; by[r.stage] = (by[r.stage] || 0) + opsN_(r.ha_done); m++; });
    var ks = Object.keys(by), mn = ks.length ? Math.min.apply(null, ks.map(function (k) { return by[k]; })) : 0;
    out.volume = Math.round(mn * 100) / 100; out.stages = by; out.source = 'Progres LC dengan SPK ini';
    out.detail = m + ' catatan · ' + ks.map(function (k) { return k + ' ' + (Math.round(by[k] * 100) / 100) + ' ha'; }).join(', ') + ' → luas selesai semua tahapan: ' + out.volume + ' ha';
  } else if (s.work_cat === 'Pemupukan' && s.block_code) {
    var kgp = 0, hap = 0; rowsOf_('fert_app').forEach(function (r) { if (r.block_code !== s.block_code || ['CANCELLED', 'REJECTED', 'DRAFT'].indexOf(r.status) > -1) return; var d = String(r.app_date).substr(0, 10); if (d < f || d > t) return; kgp += opsN_(r.qty_kg); hap += opsN_(r.area_ha); });
    out.volume = s.unit === 'Ha' ? hap : s.unit === 'Kg' ? kgp : null; out.source = 'Aplikasi Pemupukan blok ' + s.block_code; out.detail = fmtNum_(kgp) + ' kg · ' + hap + ' ha';
  }
  var done = 0; rowsOf_('bor_ba').forEach(function (b) { if (b.spk_no === s.spk_no && ['CANCELLED', 'REJECTED'].indexOf(b.status) < 0) done += opsN_(b.volume); });
  out.contract = opsN_(s.volume); out.done = done; out.remain = Math.max(0, opsN_(s.volume) - done); out.rate = opsN_(s.rate); out.retention_pct = opsN_(s.retention_pct); out.executor = s.executor;
  out.qc_rules = opsConf_().bor_qc;
  var au = rowsOf_('audits').filter(function (a) { return a.target_ref === s.spk_no && ['SUBMITTED', 'VERIFIED', 'APPROVED', 'POSTED'].indexOf(a.status) > -1; }).sort(function (a, b) { return String(b.audit_date).localeCompare(String(a.audit_date)); })[0];
  if (au) out.audit = { audit_no: au.audit_no, score: au.score, date: au.audit_date };
  return out;
}

function apiAudTpl(ctx, p) {
  var t = findBy_('aud_templates', 'code', p.code); if (!t) throw err_('Template tidak ditemukan', 'REF');
  return { code: t.code, name: t.name, category: t.category, scoring: t.scoring, pass_score: opsN_(t.pass_score) || 80, items: opsTplItems_(t.items) };
}

function apiOpsSummary(ctx, p) {
  var g = p.g, est = p.estate || '', out = { g: g, at: now_() };
  var ok = function (mod, r) { var sc = sc_(mod); return inScope_(ctx, sc, r) && (!est || r.estate_code === est); };
  if (g === 'nur') {
    need_(ctx, 'nur', 'V');
    out.batches = rowsOf_('seed_batches').filter(function (b) { return ok('seed_batches', b) && ['CANCELLED', 'REJECTED'].indexOf(b.status) < 0; }).map(function (b) { var c = opsBatchCalc_(b.batch_no); return { batch_no: b.batch_no, nursery: b.nursery_code, estate: b.estate_code, variety: b.variety, supplier: b.supplier, received: opsN_(b.qty_received), abnormal: opsN_(b.qty_abnormal), culled: c.culled, dispatched: c.disp, pending: c.pend, live: c.live, age: c.age, stage: b.stage, status: b.status, ready: c.age >= 10 }; });
    var t = { received: 0, live: 0, culled: 0, dispatched: 0, ready: 0 }; out.batches.forEach(function (b) { t.received += b.received; t.live += b.live; t.culled += b.culled; t.dispatched += b.dispatched; if (b.ready) t.ready += b.live; }); out.tot = t;
    out.recent = rowsOf_('seed_dispatch').filter(function (d) { return ok('seed_dispatch', d); }).sort(function (a, b) { return String(b.sd_date).localeCompare(String(a.sd_date)); }).slice(0, 10).map(function (d) { return { sd_no: d.sd_no, date: d.sd_date, batch: d.batch_no, block: d.block_code, purpose: d.purpose, qty: opsN_(d.qty), status: d.status }; });
  } else if (g === 'lc') {
    need_(ctx, 'lc', 'V');
    out.projects = rowsOf_('lc_projects').filter(function (r) { return ok('lc_projects', r) && r.status !== 'CANCELLED'; }).map(function (r) { var c = opsLcCalc_(r.lc_code); return { lc_code: r.lc_code, name: r.name, estate: r.estate_code, area: opsN_(r.area_ha), executor: r.executor, vendor: r.vendor_code, budget: opsN_(r.budget), cost: c.cost, pct: c.pct, stages: c.stages, start: r.start_date, end: r.end_date, status: r.status, late: r.end_date && r.end_date < today_() && c.pct < 100 }; });
    out.stages = OPS_LC_STAGES;
  } else if (g === 'bor') {
    need_(ctx, 'bor', 'V');
    out.spk = rowsOf_('bor_spk').filter(function (r) { return ok('bor_spk', r) && ['CANCELLED', 'REJECTED'].indexOf(r.status) < 0; }).map(function (r) {
      var v = opsN_(r.volume), d = opsN_(r.vol_done), ven = r.vendor_code ? (findBy_('vendors', 'code', r.vendor_code) || {}).name : '', man = r.mandor_no ? (findBy_('employees', 'emp_no', r.mandor_no) || {}).name : '';
      return { spk_no: r.spk_no, estate: r.estate_code, block: r.block_code, cat: r.work_cat, type: r.work_type, executor: r.executor, who: r.executor === 'Eksternal' ? (ven || r.vendor_code) : 'Regu ' + (man || r.mandor_no), unit: r.unit, volume: v, done: d, pct: v ? Math.round(d / v * 1000) / 10 : 0, value: opsN_(r.value), paid: opsN_(r.paid), end: r.end_date, status: r.status, late: r.end_date && r.end_date < today_() && d < v };
    });
    var tt = { value: 0, paid: 0, ext: 0, int: 0 }; out.spk.forEach(function (s) { tt.value += s.value; tt.paid += s.paid; if (s.executor === 'Eksternal') tt.ext += s.value; else tt.int += s.value; }); out.tot = tt;
    out.ba_pending = rowsOf_('bor_ba').filter(function (b) { return ok('bor_ba', b) && OPS_OPEN.indexOf(b.status) > -1; }).length;
  } else if (g === 'aud') {
    need_(ctx, 'aud', 'V');
    var au = rowsOf_('audits').filter(function (r) { return ok('audits', r) && ['SUBMITTED', 'VERIFIED', 'APPROVED', 'POSTED'].indexOf(r.status) > -1 && (!p.from || String(r.audit_date) >= p.from); });
    var byCat = {}; au.forEach(function (a) { var k = a.category || '-'; var o = byCat[k] || (byCat[k] = { cat: k, n: 0, sum: 0, pass: 0 }); o.n++; o.sum += opsN_(a.score); if (String(a.result) === 'LULUS') o.pass++; });
    out.byCat = Object.keys(byCat).map(function (k) { var o = byCat[k]; return { cat: k, n: o.n, avg: Math.round(o.sum / o.n * 10) / 10, pass: Math.round(o.pass / o.n * 100) }; });
    var byEst = {}; au.forEach(function (a) { var k = a.estate_code || '-'; var o = byEst[k] || (byEst[k] = { est: k, n: 0, sum: 0 }); o.n++; o.sum += opsN_(a.score); });
    out.byEst = Object.keys(byEst).map(function (k) { return { est: k, n: byEst[k].n, avg: Math.round(byEst[k].sum / byEst[k].n * 10) / 10 }; });
    var fs = rowsOf_('findings').filter(function (f) { return ok('findings', f) && f.status !== 'CANCELLED'; }), risk = { Rendah: 0, Sedang: 0, Tinggi: 0, Kritis: 0 }, overdue = [];
    fs.forEach(function (f) { if (f.close_status === 'Closed') return; risk[f.risk] = (risk[f.risk] || 0) + 1; if (f.due_date && String(f.due_date) < today_()) overdue.push({ f_no: f.f_no, risk: f.risk, due: f.due_date, pic: f.pic, finding: String(f.finding).substr(0, 120), estate: f.estate_code }); });
    out.risk = risk; out.overdue = overdue.slice(0, 30); out.open = fs.filter(function (f) { return f.close_status !== 'Closed'; }).length; out.closed = fs.length - out.open;
    out.recent = au.sort(function (a, b) { return String(b.audit_date).localeCompare(String(a.audit_date)); }).slice(0, 12).map(function (a) { return { audit_no: a.audit_no, date: a.audit_date, cat: a.category, estate: a.estate_code, block: a.block_code, target: a.target_ref, score: a.score, result: a.result, findings: a.findings_n, status: a.status }; });
  } else throw err_('Ringkasan tidak dikenal', 'VALID');
  return out;
}

/* ---------------- QR CODE ---------------- */
function opsQrParse_(text) {
  var t = String(text || '').trim(), m = t.match(/[?&]q=([^&#]+)/);
  var v = t.match(/[?&]verify=([^&#]+)&k=([A-Za-z0-9]+)/); if (v) return { kind: 'verify', code: decodeURIComponent(v[1]), k: v[2] };
  if (m) t = decodeURIComponent(m[1].replace(/\+/g, ' '));
  t = t.replace(/^POS1?:/i, '');
  var parts = t.split(':'); return { mod: parts[0], code: parts.slice(1).join(':'), parts: parts, raw: t };
}
function apiQrResolve(ctx, p) {
  var q = opsQrParse_(p.text);
  if (q.kind === 'verify') return { kind: 'verify', code: q.code };
  if (q.mod === 'tph') {
    var b = findBy_('blocks', 'code', q.parts[1]); if (!b) throw err_('Blok ' + q.parts[1] + ' tidak ditemukan', 'NOTFOUND');
    if (!inScope_(ctx, sc_('blocks'), b)) throw err_('Blok di luar kewenangan Anda', 'SCOPE');
    return { kind: 'tph', mod: 'tph', block: { code: b.code, estate_code: b.estate_code, division_code: b.division_code, planted_ha: b.planted_ha, crop_status: b.crop_status }, tph: q.parts[2] || '', title: 'TPH ' + (q.parts[2] || '') + ' · Blok ' + b.code };
  }
  if (q.mod === 'wfx') {
    var w = typeof wfxFind_ === 'function' ? wfxFind_(q.code) : null; if (!w) throw err_('Dokumen ' + q.code + ' tidak ditemukan', 'NOTFOUND');
    return { kind: 'wfx', id: w.id, code: w.code, title: (WFX_TYPES[w.type] || {}).t + ' ' + w.code, status: w.status };
  }
  if (!MODULES[q.mod]) return { kind: 'unknown', text: String(p.text || '').substr(0, 300) };
  var sc = sc_(q.mod); if (!perm_(ctx, sc.g, 'V')) throw err_('Anda tidak memiliki akses ke ' + sc.t, 'PERM');
  var key = refKey_(q.mod), r = findBy_(q.mod, key, q.code) || (key !== 'id' ? findBy_(q.mod, 'id', q.code) : null);
  if (!r) throw err_(sc.t + ' "' + q.code + '" tidak ditemukan', 'NOTFOUND');
  if (!inScope_(ctx, sc, r)) throw err_('Data di luar kewenangan organisasi Anda', 'SCOPE');
  var lk = labelKey_(q.mod), fields = sc.fields.filter(function (f) { return !f.sens && !f.big && f.type !== 'json' && r[f.key] !== '' && r[f.key] != null; }).slice(0, 12).map(function (f) { return { l: f.label, v: String(r[f.key]).substr(0, 120) }; });
  return { kind: 'rec', mod: q.mod, g: sc.g, title: sc.t, code: String(r[key]), label: lk ? r[lk] : '', id: r.id, status: r.status || '', estate_code: r.estate_code || '', division_code: r.division_code || '', block_code: r.block_code || (q.mod === 'blocks' ? r.code : ''), fields: fields };
}
/** Kunci verifikasi dokumen (tidak berubah walau status berubah). */
function opsVk_(id, code) { return sha_('VK|' + id + '|' + code).replace(/[^A-Za-z0-9]/g, '').substr(0, 10).toUpperCase(); }
function opsVerifyPage_(code, k) {
  var st = getSettings_(), ok = false, h = '';
  try {
    var w = typeof wfxFind_ === 'function' ? wfxFind_(code) : null;
    if (w && opsVk_(w.id, w.code) === String(k || '').toUpperCase()) {
      ok = true; var f = wfxFull_(w);
      h = '<table>' + [['Nomor', f.code], ['Jenis', (WFX_TYPES[f.type] || {}).t], ['Atas nama', f.emp_name + ' (' + f.emp_no + ')'], ['Perihal', f.title], ['Tanggal', (f.date_from || '') + (f.date_to && f.date_to !== f.date_from ? ' s.d. ' + f.date_to : '')], ['Status saat ini', f.status]].map(function (x) { return '<tr><td>' + wfxEsc_(x[0]) + '</td><td><b>' + wfxEsc_(x[1]) + '</b></td></tr>'; }).join('') + '</table>'
        + '<h3>Persetujuan</h3>' + f.steps.map(function (s) { return '<div class="st ' + s.st + '">' + wfxEsc_(s.t) + ': ' + wfxEsc_(s.byName || s.name || '') + ' — ' + wfxEsc_({ OK: 'Disetujui', NO: 'Ditolak', REV: 'Dikembalikan', PEND: 'Menunggu', WAIT: 'Antre' }[s.st] || s.st) + (s.at ? ' · ' + wfxEsc_(String(s.at).replace('T', ' ').substr(0, 16)) + ' UTC' : '') + '</div>'; }).join('');
    }
  } catch (e) { ok = false; }
  return '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verifikasi Dokumen</title><style>body{font-family:Arial,sans-serif;background:#eef3f0;margin:0}.w{max-width:560px;margin:0 auto;padding:16px}.c{background:#fff;border-radius:16px;padding:18px;box-shadow:0 4px 18px rgba(0,0,0,.08)}td{padding:6px 8px;border-bottom:1px solid #e3e9e6;font-size:14px}table{width:100%;border-collapse:collapse}.ok{background:#d8f1e4;color:#0f6b4b;padding:12px;border-radius:10px;font-weight:700}.no{background:#fde0e0;color:#b42318;padding:12px;border-radius:10px;font-weight:700}.st{font-size:13px;margin:4px 0;padding:6px 8px;border-radius:8px;background:#f3f6f4}.st.OK{background:#d8f1e4}.st.NO{background:#fde0e0}</style></head><body><div class="w"><div class="c"><h2 style="margin-top:0">' + wfxEsc_(st.app_title || APP.NAME) + '</h2>'
    + (ok ? '<div class="ok">✔ Dokumen ASLI — tercatat di sistem</div>' + h : '<div class="no">✖ Dokumen tidak dapat diverifikasi. Kode tidak cocok atau dokumen tidak terdaftar.</div>')
    + '<p style="font-size:12px;color:#667">Diperiksa ' + wfxEsc_(new Date().toISOString().replace('T', ' ').substr(0, 16)) + ' UTC. Halaman ini hanya menampilkan ringkasan untuk keperluan verifikasi.</p></div></div></body></html>';
}

/* ---------------- LAPORAN TAMBAHAN (dipanggil apiReport) ---------------- */
function opsReport_(ctx, type, P, out, C) {
  if (type === 'bor_wages') {
    out.title = 'Upah Borongan Internal per Karyawan (BA diposting)';
    var emp = {}; rowsOf_('employees').forEach(function (e) { emp[e.emp_no] = e; });
    var acc = {}; tx_(ctx, 'bor_ba', P).filter(function (b) { return b.status === 'POSTED'; }).forEach(function (b) {
      var s = findBy_('bor_spk', 'spk_no', b.spk_no); if (!s || s.executor !== 'Internal') return;
      var team = opsTeam_(s), share = team.length ? opsN_(b.net) / team.length : 0;
      team.forEach(function (id) { var o = acc[id] || (acc[id] = { emp: id, name: (emp[id] || {}).name || '-', bas: 0, amount: 0, spk: {} }); o.bas++; o.amount += share; o.spk[s.spk_no] = 1; });
    });
    out.cols = [C('emp', 'No. Karyawan'), C('name', 'Nama'), C('spk', 'SPK'), C('bas', 'Jumlah BA', 1), C('amount', 'Upah Borongan (Rp)', 1)];
    out.rows = Object.keys(acc).sort().map(function (k) { var o = acc[k]; return { emp: o.emp, name: o.name, spk: Object.keys(o.spk).join(', '), bas: o.bas, amount: Math.round(o.amount) }; });
    return true;
  }
  if (type === 'bor_vendor') {
    out.title = 'Rekap Borongan per Pelaksana (Kontraktor & Regu Internal)';
    var g = {}; tx_(ctx, 'bor_spk', { from: '0000', to: '9999', estate: P.estate, draft: P.draft }).forEach(function (s) {
      var k = s.executor === 'Eksternal' ? 'Kontraktor: ' + ((findBy_('vendors', 'code', s.vendor_code) || {}).name || s.vendor_code) : 'Internal: Regu ' + ((findBy_('employees', 'emp_no', s.mandor_no) || {}).name || s.mandor_no);
      var o = g[k] || (g[k] = { who: k, n: 0, value: 0, paid: 0, ret: 0, late: 0 }); o.n++; o.value += opsN_(s.value); o.paid += opsN_(s.paid); if (s.end_date && s.end_date < today_() && opsN_(s.vol_done) < opsN_(s.volume)) o.late++;
      rowsOf_('bor_ba').forEach(function (b) { if (b.spk_no === s.spk_no && b.status === 'POSTED') o.ret += opsN_(b.retention); });
    });
    out.cols = [C('who', 'Pelaksana'), C('n', 'Jumlah SPK', 1), C('value', 'Nilai Kontrak (Rp)', 1), C('paid', 'Terbayar (Rp)', 1), C('ret', 'Retensi Ditahan (Rp)', 1), C('late', 'SPK Terlambat', 1)];
    out.rows = Object.keys(g).sort().map(function (k) { return g[k]; });
    return true;
  }
  if (type === 'nursery_stock') {
    out.title = 'Stok Bibit per Batch'; out.cols = [C('batch_no', 'Batch'), C('nursery', 'Bibitan'), C('variety', 'Varietas'), C('age', 'Umur (bln)', 1), C('received', 'Diterima', 1), C('culled', 'Afkir', 1), C('dispatched', 'Disalurkan', 1), C('live', 'Stok Hidup', 1), C('survival', 'Daya Hidup (%)', 1)];
    out.rows = apiOpsSummary(ctx, { g: 'nur', estate: P.estate }).batches.map(function (b) { b.survival = b.received ? Math.round((b.live + b.dispatched) / b.received * 1000) / 10 : 0; return b; });
    return true;
  }
  if (type === 'lc_progress') {
    out.title = 'Progres Land Clearing per Proyek & Tahapan'; var st = OPS_LC_STAGES;
    out.cols = [C('lc_code', 'Proyek'), C('area', 'Luas (ha)', 1), C('pct', 'Progres (%)', 1)].concat(st.map(function (s, i) { return C('s' + i, s + ' (ha)', 1); })).concat([C('cost', 'Biaya (Rp)', 1), C('budget', 'Anggaran (Rp)', 1)]);
    out.rows = apiOpsSummary(ctx, { g: 'lc', estate: P.estate }).projects.map(function (p) { var o = { lc_code: p.lc_code, area: p.area, pct: p.pct, cost: p.cost, budget: p.budget }; p.stages.forEach(function (s, i) { o['s' + i] = s.ha; }); return o; });
    return true;
  }
  if (type === 'audit_score') {
    out.title = 'Nilai Audit per Kategori'; var a = apiOpsSummary(ctx, { g: 'aud', estate: P.estate, from: P.from });
    out.cols = [C('cat', 'Kategori'), C('n', 'Jumlah Audit', 1), C('avg', 'Rata-rata Nilai (%)', 1), C('pass', 'Lulus (%)', 1)]; out.rows = a.byCat;
    return true;
  }
  return false;
}


/* ===== Code.gs ===== */
/**
 * PALM OS ENTERPRISE — Code.gs
 * Entry point Web App (doGet/doPost), router RPC, menu spreadsheet, setup & data contoh.
 * Deploy: Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone (login di dalam aplikasi).
 */
/* Peta aksi → NAMA fungsi (diresolusi saat dipanggil, bukan saat berkas dimuat).
   Apps Script mengeksekusi berkas .gs berurutan; referensi langsung ke fungsi di berkas lain
   pada level atas dapat bernilai undefined bila urutan berkas berbeda. */
var API = {
  me: 'apiMe', logout: 'apiLogout', list: 'apiList', get: 'apiGet', save: 'apiSave', remove: 'apiRemove', transition: 'apiTransition',
  batch: 'apiBatch', refs: 'apiRefs', pending: 'apiPending', notifs: 'apiNotifs', dashboard: 'apiDashboard', report: 'apiReport',
  mapData: 'apiMapData', forecast: 'apiForecast', aiAsk: 'apiAiAsk', settingsSave: 'apiSettingsSave', profile: 'apiProfile',
  changePw: 'apiChangePw', mfaSetup: 'apiMfaSetup', mfaEnable: 'apiMfaEnable', users: 'apiUsers', userSave: 'apiUserSave',
  license: 'apiLicense', usage: 'apiUsage', trim: 'apiTrim', archive: 'apiArchive', audit: 'apiAudit',
  wfMeta: 'apiWfMeta', wfList: 'apiWfList', wfGet: 'apiWfGet', wfCalc: 'apiWfCalc', wfSave: 'apiWfSave', wfAct: 'apiWfAct', wfNotify: 'apiWfNotify',
  wfAttach: 'apiWfAttach', wfDelegate: 'apiWfDelegate', wfHolidaySeed: 'apiWfHolidaySeed',
  multi: 'apiMulti', qrResolve: 'apiQrResolve', opsSummary: 'apiOpsSummary', borFill: 'apiBorFill', audRun: 'apiAudTpl'
};
/** Beberapa panggilan baca dalam SATU eksekusi Apps Script (hemat waktu bolak-balik ~1 detik per panggilan). */
var MULTI_OK = ['refs', 'list', 'get', 'dashboard', 'pending', 'wfMeta', 'wfList', 'wfGet', 'mapData', 'report', 'notifs', 'usage', 'audit', 'me', 'qrResolve', 'opsSummary', 'audRun', 'borFill'];
function apiMulti(ctx, p) {
  return (p.calls || []).slice(0, 10).map(function (c) {
    var a = String(c && c[0]);
    if (MULTI_OK.indexOf(a) < 0 || !API[a]) return { ok: false, error: 'Aksi tidak boleh dibatch: ' + a, code: 'NOACTION' };
    try { return { ok: true, data: fn_(API[a])(ctx, (c && c[1]) || {}) }; } catch (e) { return { ok: false, error: String(e && e.message || e), code: (e && e.code) || 'ERR' }; }
  });
}
var PUBLIC = { login: 'apiLogin', ping: 'apiPing', publicInfo: 'apiPublic', wfTokenInfo: 'apiWfTokenInfo', wfTokenAct: 'apiWfTokenAct' };
function apiPing() { return { app: APP.NAME, version: APP.VERSION, time: now_() }; }
function fn_(name) { var f = globalThis[name]; if (typeof f !== 'function') throw err_('Fungsi server ' + name + ' tidak ditemukan — pastikan semua berkas .gs sudah ditempel', 'NOFN'); return f; }

function apiPublic() {
  var st = getSettings_();
  return { title: st.app_title, subtitle: st.app_subtitle, logo: chunkGet_(st.logo || ''), theme: st.theme, app: APP, license: { tier: licenseInfo_().tier, title: licenseInfo_().title } };
}

/** Dipanggil dari klien via google.script.run.rpc(...). Mengembalikan string JSON (aman dari masalah serialisasi Date). */
function rpc(action, token, payload, device) {
  var t0 = Date.now();
  try {
    var data;
    if (PUBLIC[action]) data = fn_(PUBLIC[action])(payload || {});
    else if (API[action]) data = fn_(API[action])(ctx_(token, device), payload || {});
    else throw err_('Aksi tidak dikenal: ' + action, 'NOACTION');
    return JSON.stringify({ ok: true, data: data, ms: Date.now() - t0 });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e && e.message || e), code: (e && e.code) || 'ERR', server: e && e.server || null, ms: Date.now() - t0 });
  }
}

function doGet(e) {
  e = e || { parameter: {} };
  if (e.parameter.api) return json_(JSON.parse(rpc(e.parameter.api === 'ping' ? 'ping' : 'publicInfo', null, {})));
  if (e.parameter.verify) return HtmlService.createHtmlOutput(fn_('opsVerifyPage_')(String(e.parameter.verify), String(e.parameter.k || ''))).setTitle('Verifikasi Dokumen').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (e.parameter.wfa) return HtmlService.createHtmlOutput(fn_('wfxTokenPage_')(String(e.parameter.wfa))).setTitle('Persetujuan PALM OS').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  var t = HtmlService.createTemplateFromFile('Index');
  var st = getSettings_();
  t.appTitle = st.app_title || APP.NAME; t.q = String(e.parameter.q || '').substr(0, 200);
  return t.evaluate().setTitle(t.appTitle).addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setFaviconUrl('https://jorris80.github.io/palm-os/icon-512.png');
}

/** API untuk PWA GitHub Pages (sinkronisasi offline). Body: text/plain JSON {action, token, payload, device}. */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'Body bukan JSON' }); }
  var allowed = { login: 1, ping: 1, publicInfo: 1, batch: 1, me: 1, refs: 1, list: 1 };
  if (!allowed[body.action]) return json_({ ok: false, error: 'Aksi tidak diizinkan melalui API publik' });
  return json_(JSON.parse(rpc(body.action, body.token, body.payload, body.device)));
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* ---------------- MENU SPREADSHEET ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌴 PALM OS')
    .addItem('1. Setup / Migrasi Struktur', 'setup')
    .addItem('2. Isi Data Contoh (demo)', 'seedDemo')
    .addItem('Hapus Data Contoh', 'clearDemo')
    .addItem('Aktifkan Pengingat Workflow (tiap jam)', 'wfxInstallReminder')
    .addSeparator()
    .addItem('Cek Pemakaian Sel (batas 10 juta)', 'menuUsage')
    .addItem('Buka URL Web App', 'menuUrl')
    .addToUi();
}
function menuUsage() {
  var tot = 0; ss_().getSheets().forEach(function (s) { tot += s.getMaxRows() * s.getMaxColumns(); });
  SpreadsheetApp.getUi().alert('Pemakaian sel: ' + tot.toLocaleString('id-ID') + ' dari 10.000.000 (' + (tot / 100000).toFixed(1) + '%).\nGunakan Pengaturan > Penyimpanan untuk merapikan atau mengarsipkan per tahun.');
}
function menuUrl() { SpreadsheetApp.getUi().alert('URL Web App:\n' + (ScriptApp.getService().getUrl() || 'Belum di-deploy. Deploy > New deployment > Web app.')); }

/** Memeriksa berkas HTML: penanda akhir berkas (deteksi terpotong), karakter non-ASCII di skrip (deteksi rusak saat salin), dan sintaks JS. */
var HTML_EXPECT = { App: 32836, Views: 67735, Map: 24884, Layers: 55669, WorkflowUI: 86657, OpsUI: 55280 };
function cekHtml_() {
  var hasil = [];
  ['Index', 'Styles', 'App', 'Views', 'Map', 'Layers', 'WorkflowUI', 'OpsUI'].forEach(function (n) {
    var c; try { c = HtmlService.createHtmlOutputFromFile(n).getContent(); } catch (e) { hasil.push(n + '.html → TIDAK ADA (buat lewat + → HTML, nama persis "' + n + '")' + (n === 'WorkflowUI' ? ' — catatan: nama "Workflow" sudah dipakai Workflow.gs, editor menolak nama kembar' : n === 'OpsUI' ? ' — nama sengaja beda dari Operasi.gs' : '')); return; }
    if (!HTML_EXPECT[n]) return;
    var msgs = [];
    if (c.indexOf('AKHIR-BERKAS ' + n + '.html') < 0) msgs.push('TERPOTONG: baris penutup tidak ditemukan (' + c.length + ' dari ±' + HTML_EXPECT[n] + ' karakter)');
    var js = (c.match(/<script>([\s\S]*?)<\/script>/g) || []).map(function (b) { return b.replace(/^<script>|<\/script>$/g, ''); }).join('\n');
    var lines = js.split('\n'), bad = 0;
    for (var i = 0; i < lines.length && bad < 3; i++) {
      var m = lines[i].match(/[^\x00-\x7F]/);
      if (m) { bad++; msgs.push('karakter asing "' + m[0] + '" (U+' + m[0].charCodeAt(0).toString(16).toUpperCase() + ') di baris skrip ' + (i + 1) + ': ' + lines[i].substr(Math.max(0, lines[i].indexOf(m[0]) - 40), 80)); }
    }
    if (js.indexOf('//') > -1) msgs.push('masih versi lama (mengandung "//" di skrip) — ganti dengan berkas terbaru');
    try { new Function(js); } catch (e) { msgs.push('SINTAKS: ' + e.message); }
    if (msgs.length) hasil.push(n + '.html → ' + msgs.join(' | '));
  });
  return hasil;
}

/** Diagnostik instalasi: memeriksa setiap berkas .gs sudah ada & termuat. Jalankan dari editor bila ada ReferenceError. */
function cekInstalasi() {
  var cek = {
    'Schema.gs': ['APP', 'SYS', 'MODULES', 'ROLES', 'getSchema_'],
    'Data.gs': ['ss_', 'table_', 'apiList', 'apiSave', 'TRANS'],
    'Auth.gs': ['USER_COLS', 'SESS_COLS', 'apiLogin', 'hashPw_', 'perm_'],
    'License.gs': ['TIERS', 'licenseInfo_', 'apiLicense'],
    'Business.gs': ['HOOKS', 'OUTFLOW', 'stockBal_', 'r2_'],
    'Reports.gs': ['VALID_ST', 'apiDashboard', 'apiReport', 'apiMapData', 'apiForecast'],
    'Code.gs': ['API', 'rpc', 'setup'],
    'Operasi.gs': ['OPS_HOOKS', 'apiQrResolve', 'apiOpsSummary', 'opsVerifyPage_'],
    'Workflow.gs': ['WFX_TYPES', 'apiWfSave', 'apiWfAct', 'wfxLeaveCalc_', 'wfxTokenPage_'],
    'License.gs (DEMO)': ['DEMO_LIMITS', 'isDemo_']
  }, hilang = [];
  Object.keys(cek).forEach(function (f) {
    var miss = cek[f].filter(function (n) { return typeof globalThis[n] === 'undefined'; });
    if (miss.length) hilang.push(f + ' → belum ada/termuat (' + miss.join(', ') + ')');
  });
  try { hilang = hilang.concat(cekHtml_()); } catch (e) { hilang.push('Cek HTML gagal: ' + e.message); }
  var msg = hilang.length ? 'BERKAS BERMASALAH:\n' + hilang.join('\n') + '\n\nGanti isi berkas yang disebut dengan salinan ASLI dari ZIP (buka berkas dengan Notepad/VS Code, Ctrl+A, Ctrl+C) — jangan salin dari Word/Google Docs/WhatsApp yang mengubah tanda kutip. Berkas .gs dibuat lewat + → Script, berkas .html lewat + → HTML, nama persis, lalu Simpan (Ctrl+S).' : 'Semua 9 berkas .gs dan 8 berkas .html lengkap & valid ✔';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { }
  return msg;
}

/** Membuat seluruh sheet sistem & modul, menambah kolom baru (migrasi aman, tidak menghapus data). */
function setup() {
  if (typeof USER_COLS === 'undefined' || typeof getSchema_ === 'undefined' || typeof HOOKS === 'undefined' || typeof apiDashboard === 'undefined' || typeof TIERS === 'undefined' || typeof table_ === 'undefined' || typeof WFX_TYPES === 'undefined' || typeof OPS_HOOKS === 'undefined') { throw new Error(cekInstalasi()); }
  var ss = ss_(); PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());
  sh_(SYS.USERS, USER_COLS); sh_(SYS.SESS, SESS_COLS);
  sh_(SYS.AUDIT, ['id', 'ts', 'user', 'role', 'action', 'module', 'rec_id', 'before', 'after', 'device']);
  sh_(SYS.SET, ['id', 'value', 'updated_at', 'updated_by']); sh_(SYS.CHUNK, ['chunk_id', 'seq', 'data', 'owner', 'created_at']);
  sh_(SYS.APPR, ['id', 'ts', 'module', 'rec_id', 'action', 'from_status', 'to_status', 'user', 'role', 'comment']);
  sh_(SYS.NOTIF, ['id', 'ts', 'user', 'msg', 'module', 'rec_id', 'read']);
  sh_(SYS.ARCH, ['id', 'ts', 'module', 'year', 'rows', 'spreadsheet_id', 'url', 'by']);
  if (typeof WFX_SHEET !== 'undefined') { sh_(WFX_SHEET.REQ, WFX_COLS); sh_(WFX_SHEET.TOK, WFX_TOK_COLS); sh_(WFX_SHEET.DEL, WFX_DEL_COLS); }
  var sch = getSchema_(); Object.keys(sch).forEach(function (k) { sh_(sch[k].sheet, modHeaders_(sch[k])); });
  var s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1'); if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  invalidate_(SYS.USERS);
  if (!users_().length) {
    var salt = randHex_(24), demo = isDemo_();
    appendObj_(SYS.USERS, USER_COLS, { id: uid_(), username: demo ? 'demo' : 'admin', name: demo ? 'Pengguna Demo' : 'Super Administrator', email: '', role: 'SUPER_ADMIN', scope_type: 'ALL', scope_codes: '', salt: salt, hash: hashPw_(demo ? 'Demo#2026' : 'PalmOS#2026', salt), active: true, photo: '', mfa_secret: '', mfa_on: false, must_change: !demo, last_login: '', created_at: now_(), updated_at: now_() });
  }
  licenseInfo_();
  var msg = isDemo_() ? 'Setup VERSI DEMO selesai. Login: demo / Demo#2026. Jalankan seedDemo untuk data contoh.' : 'Setup selesai. Login awal: admin / PalmOS#2026 (wajib diganti saat login pertama).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { }
  return msg;
}

/* ---------------- DATA CONTOH (ditandai device = seed-demo) ---------------- */
function seedDemo() {
  setup();
  var sys = { user: { username: 'seed', role: 'SUPER_ADMIN', id: 'seed' }, device: 'seed-demo', estates: null, divisions: null };
  function put(mod, rec, st) {
    var sc = sc_(mod), r = saveCore_(sys, sc, rec).rec;
    if (st && sc.wf) { var row = findBy_(mod, 'id', r.id), c = {}; Object.keys(row).forEach(function (k) { c[k] = row[k]; }); c.status = st; updateObj_(sc.sheet, row._row, c); }
    return r;
  }
  if (findBy_('companies', 'code', 'CMP-001')) return 'Data contoh sudah ada.';
  put('companies', { code: 'CMP-001', name: 'PT Contoh Sawit Nusantara (DATA CONTOH)' });
  put('regions', { code: 'REG-001', name: 'Region Riau (contoh)', company_code: 'CMP-001', manager: '-' });
  put('mills', { code: 'PKS-01', name: 'PKS Contoh 45 TPH', company_code: 'CMP-001', capacity_tph: 45 });
  put('estates', { code: 'EST-001', name: 'Kebun Contoh Satu', region_code: 'REG-001', hgu_ha: 3200, managed_ha: 3000, manager: '-', mill_code: 'PKS-01' });
  ['AFD-01', 'AFD-02', 'AFD-03'].forEach(function (d, i) { put('divisions', { code: d, name: 'Afdeling ' + (i + 1), estate_code: 'EST-001', assistant: '-' }); });
  var lat0 = 0.52, lng0 = 101.43, s = 0.005, years = [2008, 2012, 2016, 2021, 2010, 2014, 2018, 2023, 1999];
  for (var i = 0; i < 9; i++) {
    var r = Math.floor(i / 3), c = i % 3, la = lat0 - r * s, ln = lng0 + c * s, yr = years[i];
    var poly = { type: 'Polygon', coordinates: [[[ln, la], [ln + s * 0.96, la], [ln + s * 0.96, la - s * 0.96], [ln, la - s * 0.96], [ln, la]]] };
    put('blocks', { code: 'BLK-' + String.fromCharCode(65 + r) + (c + 1), estate_code: 'EST-001', division_code: 'AFD-0' + (r + 1), legal_ha: 31, planted_ha: 30, planting_year: yr, variety: 'DxP', palms: 30 * (130 + i), crop_status: (2026 - yr) < 4 ? 'TBM' : (2026 - yr) > 25 ? 'TT' : 'TM', topography: 'Datar', geom: JSON.stringify(poly) });
  }
  ['NPK-15', 'MOP', 'DOLOMIT'].forEach(function (k, i) { put('items', { code: k, name: ['Pupuk NPK 15-15-15', 'Pupuk MOP (KCl)', 'Dolomit'][i], category: 'Pupuk', uom: 'kg', min_stock: 2000, price: [9500, 8200, 1500][i] }); });
  put('warehouses', { code: 'WH-001', name: 'Gudang Kebun Contoh', estate_code: 'EST-001', keeper: '-' });
  put('stock_moves', { m_date: today_(), wh_code: 'WH-001', estate_code: 'EST-001', item_code: 'NPK-15', move_type: 'IN', qty: 10000, ref_doc: 'SALDO AWAL CONTOH' }, WF.POSTED);
  put('vehicles', { code: 'DT-01', plate: 'BM 1234 XX', type: 'Dump Truck', estate_code: 'EST-001', capacity_kg: 8000, unit_status: 'Aktif' });
  for (var h = 1; h <= 6; h++) put('employees', { emp_no: 'HVR-000' + h, name: 'Pemanen Contoh ' + h, estate_code: 'EST-001', division_code: 'AFD-0' + (1 + (h % 3)), position: 'Pemanen', emp_type: 'SKU', active: 'Ya' });
  /* Struktur organisasi & workflow contoh: atasan langsung, atasan ke-2, HO vs Kebun */
  put('employees', { emp_no: 'RM-001', name: 'Hendra Saputra (contoh)', position: 'Manajer', job_title: 'Regional Manager', gender: 'L', work_cal: 'HO', emp_type: 'Staf', phone: '081200000001', active: 'Ya' });
  put('employees', { emp_no: 'MGR-001', name: 'Rudi Hartono (contoh)', estate_code: 'EST-001', position: 'Manajer', job_title: 'Estate Manager', gender: 'L', work_cal: 'KEBUN', supervisor: 'RM-001', emp_type: 'Staf', username: 'atasan', phone: '081200000002', active: 'Ya' });
  put('employees', { emp_no: 'HRD-001', name: 'Sinta Maharani (contoh)', position: 'Staf', job_title: 'HR Officer', gender: 'P', work_cal: 'HO', supervisor: 'RM-001', emp_type: 'Staf', username: 'hrd', join_date: '2019-02-01', active: 'Ya' });
  put('employees', { emp_no: 'STF-001', name: 'Andi Pratama (contoh)', estate_code: 'EST-001', division_code: 'AFD-01', position: 'Asisten', job_title: 'Asisten Afdeling I', gender: 'L', work_cal: 'KEBUN', supervisor: 'MGR-001', supervisor2: 'RM-001', emp_type: 'Staf', username: isDemo_() ? 'demo' : 'admin', join_date: '2020-03-01', active: 'Ya' });
  put('employees', { emp_no: 'HO-001', name: 'Dewi Lestari (contoh)', position: 'Staf', job_title: 'Staf Akuntansi HO', gender: 'P', work_cal: 'HO', supervisor: 'RM-001', emp_type: 'Staf', join_date: '2021-07-01', active: 'Ya' });
  for (var hv = 1; hv <= 6; hv++) { var em = findBy_('employees', 'emp_no', 'HVR-000' + hv), ce = {}; Object.keys(em).forEach(function (k) { ce[k] = em[k]; }); ce.supervisor = 'STF-001'; ce.work_cal = 'KEBUN'; ce.gender = 'L'; updateObj_(sc_('employees').sheet, em._row, ce); }
  try { var ctxA = { user: { username: 'seed', role: 'SUPER_ADMIN', id: 'seed' }, device: 'seed-demo', estates: null, divisions: null }; apiWfHolidaySeed(ctxA, { year: today_().substr(0, 4) }); apiWfHolidaySeed(ctxA, { year: String(Number(today_().substr(0, 4)) + 1) }); } catch (e) { }
  /* Pembibitan, Land Clearing, Borongan, Audit (data contoh) */
  try {
    var D0 = function (n) { return opsAddDays_(today_(), n); };
    put('vendors', { code: 'VND-001', name: 'CV Karya Tani Mandiri (contoh kontraktor)', category: 'Kontraktor Perawatan & LC', phone: '0761-000000', rating: 'B' });
    put('nurseries', { code: 'NUR-01', name: 'Bibitan Utama Kebun Contoh', estate_code: 'EST-001', n_type: 'PN & MN', capacity: 60000, area_ha: 4, pic: 'STF-001' });
    put('seed_batches', { batch_no: 'BB-2026-01', nursery_code: 'NUR-01', estate_code: 'EST-001', supplier: 'PPKS Medan', variety: 'DxP Simalungun', receive_date: D0(-310), qty_received: 12000, qty_abnormal: 240, unit_price: 9500, stage: 'Main Nursery' }, 'APPROVED');
    put('seed_batches', { batch_no: 'BB-2026-02', nursery_code: 'NUR-01', estate_code: 'EST-001', supplier: 'Socfindo', variety: 'DxP Socfindo', receive_date: D0(-95), qty_received: 8000, qty_abnormal: 120, unit_price: 10200, stage: 'Pre-Nursery' }, 'APPROVED');
    put('nursery_acts', { act_date: D0(-200), batch_no: 'BB-2026-01', activity: 'Seleksi/Culling', qty_culled: 560, hk: 6, notes: 'Seleksi saat transplanting PN ke MN' }, 'POSTED');
    put('nursery_acts', { act_date: D0(-30), batch_no: 'BB-2026-01', activity: 'Seleksi/Culling', qty_culled: 310, hk: 4 }, 'POSTED');
    opsBatchRefresh_('BB-2026-01'); opsBatchRefresh_('BB-2026-02');
    put('lc_projects', { lc_code: 'LC-2026-01', name: 'Replanting Afdeling 3 (contoh)', estate_code: 'EST-001', division_code: 'AFD-03', lc_type: 'Replanting', area_ha: 30, start_date: D0(-60), end_date: D0(60), executor: 'Kontraktor', vendor_code: 'VND-001', budget: 450000000 }, 'APPROVED');
    put('bor_spk', { spk_no: 'SPK-BOR-001', spk_date: D0(-62), estate_code: 'EST-001', division_code: 'AFD-03', work_cat: 'Land Clearing', work_type: 'Tumbang, rencek & rumpuk mekanis', executor: 'Eksternal', vendor_code: 'VND-001', unit: 'Ha', volume: 30, rate: 6500000, start_date: D0(-60), end_date: D0(45), lc_code: 'LC-2026-01', retention_pct: 5 }, 'APPROVED');
    put('bor_spk', { spk_no: 'SPK-BOR-002', spk_date: D0(-20), estate_code: 'EST-001', division_code: 'AFD-01', block_code: 'BLK-A1', work_cat: 'Perawatan', work_type: 'Piringan & pasar pikul manual', executor: 'Internal', mandor_no: 'HVR-0001', team: 'HVR-0002,HVR-0003,HVR-0004', unit: 'Ha', volume: 60, rate: 180000, start_date: D0(-20), end_date: D0(10) }, 'APPROVED');
    [['Survei & Pancang Batas', 30, 15000000], ['Imas', 30, 45000000], ['Tumbang', 24, 96000000], ['Rencek & Rumpuk', 16, 64000000]].forEach(function (x, i) { put('lc_progress', { p_date: D0(-50 + i * 10), lc_code: 'LC-2026-01', stage: x[0], ha_done: x[1], cost: x[2], spk_no: 'SPK-BOR-001', equipment: 'Excavator PC200' }, 'POSTED'); });
    opsLcRefresh_('LC-2026-01');
    put('bor_ba', { ba_no: 'BA-BOR-002-01', ba_date: D0(-5), spk_no: 'SPK-BOR-002', period_from: D0(-20), period_to: D0(-6), volume: 30, qc_score: 88 }, 'POSTED');
    opsSpkRefresh_('SPK-BOR-002');
    var TPL = [
      ['AUD-PANEN', 'Audit Mutu Panen & Ancak', 'Lapangan - Panen', 85, ['Tidak ada buah masak tinggal di pokok | 3 | KRITIS', 'Brondolan di piringan & pasar pikul sudah dikutip bersih | 2', 'Tidak ada buah mentah yang dipanen | 3 | KRITIS', 'Gagang dipotong rapat (cangkam kodok, maks. 2 cm) | 1', 'Pelepah disusun rapi di gawangan mati | 1', 'TBS & brondolan tersusun rapi di TPH dan bernomor | 1', 'Restan TPH terangkut (tidak ada restan lebih dari 1 hari) | 2', 'Pemanen memakai APD (helm, sepatu, sarung tangan) | 2']],
      ['AUD-RAWAT', 'Audit Perawatan Tanaman', 'Lapangan - Perawatan', 80, ['Piringan bersih radius 1,5-2 m | 2', 'Pasar pikul bersih dan dapat dilalui | 2', 'Gawangan bebas anak kayu & gulma berat | 1', 'Titi panen / jembatan dalam kondisi baik | 1', 'Parit / drainase berfungsi baik | 1', 'Tidak ada hama/penyakit di atas ambang kritis | 2 | KRITIS', 'Penunasan sesuai standar (songgo 2-3) | 1']],
      ['AUD-NUR', 'Audit Pembibitan', 'Pembibitan', 85, ['Penyiraman sesuai jadwal & kebutuhan | 2', 'Jarak polybag sesuai standar (MN 90 cm segitiga) | 1', 'Seleksi bibit abnormal dilakukan berkala | 2 | KRITIS', 'Label batch, varietas & umur terpasang | 1', 'Pemupukan sesuai rekomendasi umur bibit | 2', 'Polybag & antar polybag bebas gulma | 1', 'Tidak ada serangan hama/penyakit signifikan | 2']],
      ['AUD-LC', 'QC Land Clearing / Kontraktor', 'Land Clearing', 80, ['Batas areal sesuai peta & patok | 2 | KRITIS', 'Tumbang searah, kayu dicincang (rencek) | 1', 'Rumpukan sesuai arah & jarak, jalur tanam bersih | 2', 'Tanpa pembakaran (zero burning) | 3 | KRITIS', 'Jalan & parit sesuai spesifikasi | 2', 'Pancang tanam lurus & jarak sesuai standar | 2', 'Operator & pekerja memakai APD | 1']],
      ['AUD-GUDANG', 'Audit Gudang & Stock Opname', 'Gudang & Stock Opname', 90, ['Saldo fisik sama dengan kartu stok/sistem (barang sampel) | 3 | KRITIS', 'Penyimpanan rapi, FIFO, berlabel | 1', 'Bahan kimia terpisah, berventilasi, MSDS tersedia | 2 | KRITIS', 'Dokumen penerimaan & pengeluaran lengkap dan ditandatangani | 2', 'Barang di bawah stok minimum sudah diajukan PR | 1', 'Gudang terkunci & akses terbatas | 1', 'APAR tersedia dan tidak kedaluwarsa | 1']],
      ['AUD-KANTOR', 'Audit Administrasi Kantor & Kas', 'Administrasi Kantor', 90, ['Kas fisik sama dengan saldo buku kas (cash opname) | 3 | KRITIS', 'Bukti pengeluaran lengkap & disetujui pejabat berwenang | 2', 'Daftar upah/premi sesuai absensi & hasil kerja | 2', 'Arsip surat & dokumen tertata | 1', 'Uang muka lewat jatuh tempo sudah dipertanggungjawabkan | 2', 'Data karyawan & BPJS mutakhir | 1', 'Persetujuan transaksi sesuai batas kewenangan | 2 | KRITIS']]
    ];
    TPL.forEach(function (t) { put('aud_templates', { code: t[0], name: t[1], category: t[2], scoring: 'Ya/Tidak', pass_score: t[3], items: t[4].join('\n') }); });
    var ans = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return { i: i, ans: i === 1 || i === 6 ? 'Tidak' : 'Ya', note: i === 1 ? 'Brondolan tertinggal di 4 piringan baris 12' : i === 6 ? 'Restan 2 TPH sejak kemarin' : '' }; });
    var au = put('audits', { audit_no: 'AUD-2026-001', audit_date: D0(-3), template_code: 'AUD-PANEN', estate_code: 'EST-001', division_code: 'AFD-01', block_code: 'BLK-A1', auditor: 'Tim Audit Internal (contoh)', auditee: 'Asisten Afdeling I', pic_user: isDemo_() ? 'demo' : 'admin', answers: JSON.stringify(ans), summary: 'Mutu ancak cukup baik; perbaiki pengutipan brondolan & pengangkutan restan.' }, 'SUBMITTED');
    OPS_HOOKS.transition.audits('submit', findBy_('audits', 'id', au.id), sys);
  } catch (e) { Logger.log('Seed operasi: ' + e.message); }
  [['atasan', 'Rudi Hartono (contoh)', 'ESTATE_MANAGER', 'ESTATE', 'EST-001'], ['hrd', 'Sinta Maharani (contoh)', 'HR_OFFICER', 'ALL', '']].forEach(function (u) {
    if (userBy_('username', u[0])) return; var sl = randHex_(24);
    appendObj_(SYS.USERS, USER_COLS, { id: uid_(), username: u[0], name: u[1], email: '', role: u[2], scope_type: u[3], scope_codes: u[4], salt: sl, hash: hashPw_('Demo#2026', sl), active: true, photo: '', mfa_secret: '', mfa_on: false, must_change: !isDemo_(), last_login: '', created_at: now_(), updated_at: now_() });
  });
  [['1101', 'Kas', 'Aset', 'D'], ['1301', 'Persediaan Pupuk', 'Aset', 'D'], ['2101', 'Utang Usaha', 'Kewajiban', 'K'], ['5101', 'Beban Panen', 'Beban', 'D'], ['5201', 'Beban Pemupukan', 'Beban', 'D'], ['4101', 'Penjualan TBS/CPO', 'Pendapatan', 'K']].forEach(function (a) { put('coa', { code: a[0], name: a[1], acc_type: a[2], normal: a[3] }); });
  put('cost_centers', { code: 'CC-HRV-01', name: 'Panen EST-001', estate_code: 'EST-001', category: 'Harvesting' });
  var tm = rowsOf_('blocks').filter(function (b) { return b.crop_status === 'TM'; });
  for (var d = 14; d >= 1; d--) {
    var dt = new Date(); dt.setDate(dt.getDate() - d); var ds = Utilities.formatDate(dt, APP.TZ, 'yyyy-MM-dd');
    tm.forEach(function (b, bi) {
      if ((d + bi) % 3) return; var jj = 70 + ((d * 7 + bi * 13) % 40), bjr = 14 + (bi % 5) + (d % 3);
      put('harvest', { h_date: ds, block_code: b.code, harvester_no: 'HVR-000' + (1 + bi % 6), tph: 'TPH-' + (bi + 1), janjang: jj, kg: jj * bjr, brondolan_kg: 20 + bi, mentah: d % 4, restan_jjg: d % 5 === 0 ? 6 : 0, spb_no: 'SPB-' + ds.replace(/-/g, '') + '-' + b.division_code.substr(-1) }, WF.SUBMITTED);
    });
  }
  return 'Data contoh dibuat (ditandai "CONTOH"). Hapus melalui menu PALM OS > Hapus Data Contoh.';
}

function clearDemo() {
  var sch = getSchema_(), n = 0;
  Object.keys(sch).forEach(function (k) {
    var s = ss_().getSheetByName(sch[k].sheet); if (!s) return;
    table_(sch[k].sheet).rows.filter(function (r) { return r.device === 'seed-demo'; }).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rn) { s.deleteRow(rn); n++; });
    invalidate_(sch[k].sheet);
  });
  try { SpreadsheetApp.getUi().alert(n + ' baris data contoh dihapus.'); } catch (e) { }
  return n;
}


/* ===== engine-over.js ===== */
/* ===== PALM OS edisi Supabase: penyesuaian mesin (dimuat SETELAH semua berkas .gs) =====
 * - Data tabel dibaca dari penyimpanan memori yang diisi penghubung (supa-api.js) dari Supabase.
 * - Tabel yang belum dimuat dicatat (__MISSED) → penghubung memuatnya lalu mengulang perintah.
 * - Sesi, role, cakupan & lisensi berasal dari Platform Inti (palm_whoami).
 * - Penulisan dicatat (ops) lalu disimpan ke Supabase oleh penghubung (Tahap 2b).
 * - AI, WhatsApp gateway & email lewat Edge Function palmos-proxy (Tahap 2c). */
var __SUPA = { user: null, lic: null, org: '', orgName: '', appUrl: '' };
var __T = {}, __KNOWN = {}, __MISSED = [];
if (!ROLES.VIEWER) ROLES.VIEWER = { t: 'Viewer (hanya melihat)', all: 'V' };

table_ = function (name) {
  var mk = 't:' + name;
  if (_memo[mk]) return _memo[mk];
  var src = __T[name], out;
  if (!src) {
    if (__KNOWN[name] && __MISSED.indexOf(name) < 0) __MISSED.push(name);
    out = { h: [], rows: [] };
  } else {
    out = { h: src.h.slice(), rows: src.rows.map(function (r, i) { var o = { _row: i + 2 }; for (var k in r) o[k] = r[k]; return o; }) };
  }
  _memo[mk] = out; return out;
};
invalidate_ = function (name) { delete _memo['t:' + name]; };
/* ---- penulisan (Tahap 2b): perubahan dicatat sebagai daftar "ops" lalu disimpan penghubung lewat palm_apply ---- */
var __OPS = [], __UNDO = {}, __UPL = [], __EXT = [], __EXTRES = {}, __FIRE = [];
/* ---- layanan luar (Tahap 2c): AI dijawab lewat Edge Function palmos-proxy; WA gateway & email dikirim SETELAH data tersimpan ---- */
function __key(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'k' + h + '_' + s.length; }
UrlFetchApp = {
  fetch: function (url, o) {
    o = o || {}; var req = { url: String(url), method: o.method || 'get', headers: o.headers || {}, payload: o.payload === undefined ? null : o.payload, contentType: o.contentType || '' };
    if (/generativelanguage\.googleapis\.com/.test(req.url)) {
      var k = __key(JSON.stringify(req)), r = __EXTRES[k];
      if (!r) { __EXT.push({ key: k, req: req }); var e = new Error('Menunggu layanan AI'); e.code = 'EXT'; throw e; }
      return { getResponseCode: function () { return r.status; }, getContentText: function () { return r.text; } };
    }
    __FIRE.push({ kind: 'http', req: req });
    return { getResponseCode: function () { return 200; }, getContentText: function () { return '{"status":true,"queued":true}'; } };
  }
};
MailApp = { sendEmail: function (a, b, c) { var m = typeof a === 'object' ? a : { to: a, subject: b, body: c }; __FIRE.push({ kind: 'mail', mail: { to: m.to, subject: m.subject, text: m.body || '', html: m.htmlBody || '' } }); }, getRemainingDailyQuota: function () { return 100; } };
(function () { var P = PropertiesService.getScriptProperties(), g = P.getProperty;
  PropertiesService.getScriptProperties = function () { return { getProperty: function (k) { if (k === 'GEMINI_API_KEY') return '__SECRET:GEMINI_API_KEY__'; return g(k); }, setProperty: P.setProperty, deleteProperty: P.deleteProperty }; };
})();
function __setExt(json) { var m = JSON.parse(json); Object.keys(m).forEach(function (k) { __EXTRES[k] = m[k]; }); }
function __clean(obj) {
  var o = {};
  Object.keys(obj).forEach(function (k) {
    if (k === '_row') return; var v = obj[k];
    if (v instanceof Date) v = isNaN(v) ? '' : v.toISOString();
    else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
    else if (v === undefined || v === null) v = '';
    o[k] = v;
  });
  return o;
}
function __snap(name) {
  if (__UNDO[name] !== undefined) return;
  var t = __T[name]; __UNDO[name] = t ? { h: t.h.slice(), rows: t.rows.slice() } : null;
}
appendObj_ = function (name, headers, obj) {
  __snap(name);
  var row = __clean(obj), t = __T[name];
  if (t) { (headers || []).concat(Object.keys(row)).forEach(function (h) { if (t.h.indexOf(h) < 0) t.h.push(h); }); t.rows.push(row); }
  invalidate_(name); __OPS.push({ sheet: name, row: row });
};
updateObj_ = function (name, rowNum, obj) {
  __snap(name);
  var row = __clean(obj), t = __T[name];
  if (t) {
    var i = rowNum - 2;
    if (!(t.rows[i] && t.rows[i].id === row.id)) { i = -1; for (var j = 0; j < t.rows.length; j++) if (t.rows[j].id === row.id) { i = j; break; } }
    if (i >= 0) t.rows[i] = row; else t.rows.push(row);
    Object.keys(row).forEach(function (h) { if (t.h.indexOf(h) < 0) t.h.push(h); });
  }
  invalidate_(name); __OPS.push({ sheet: name, row: row });
};
chunkPut_ = function (str) { return str; };            /* database menampung teks panjang tanpa dipotong */
chunkDelete_ = function () { };
/* foto/lampiran: diunggah penghubung ke Supabase Storage (bucket palmos) */
storeFile_ = function (v, prefix) {
  if (typeof v !== 'string' || v.indexOf('data:') !== 0) return v;
  var m = v.match(/^data:([^;]+);base64,(.*)$/); if (!m) return v;
  var ext = (m[1].split('/')[1] || 'bin').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  var name = String(prefix || 'file').replace(/[^A-Za-z0-9_-]/g, '_') + '_' + Date.now() + '.' + ext;
  var path = __SUPA.org + '/' + String(prefix || 'file').split('_')[0].replace(/[^A-Za-z0-9-]/g, '') + '/' + Utilities.getUuid() + '.' + ext;
  __UPL.push({ path: path, data: v, mime: m[1] });
  return JSON.stringify({ id: path, url: '@@UPLOAD:' + path + '@@', name: name, mime: m[1], storage: 'palmos' });
};
apiNotifs = function (ctx, p) {
  if (p && p.markRead) {
    table_(SYS.NOTIF).rows.forEach(function (n) { if (n.user === ctx.user.username && String(n.read) !== 'true') { var c = {}; for (var k in n) c[k] = n[k]; c.read = true; updateObj_(SYS.NOTIF, n._row, c); } });
  }
  return table_(SYS.NOTIF).rows.filter(function (n) { return n.user === ctx.user.username; }).slice(-50).reverse();
};
function __undo() { Object.keys(__UNDO).forEach(function (n) { if (__UNDO[n]) __T[n] = __UNDO[n]; else delete __T[n]; }); __UNDO = {}; __OPS = []; __UPL = []; __EXT = []; __FIRE = []; }
function __commit() { __UNDO = {}; __OPS = []; __UPL = []; __EXT = []; __FIRE = []; __EXTRES = {}; }
/* setelah unggah: ganti penanda @@UPLOAD:path@@ dengan alamat file */
function __fixUploads(json) {
  var map = JSON.parse(json);
  Object.keys(__T).forEach(function (n) {
    __T[n].rows.forEach(function (r, i) {
      var ch = false, o = {};
      Object.keys(r).forEach(function (k) { var v = r[k]; if (typeof v === 'string' && v.indexOf('@@UPLOAD:') > -1) { v = v.replace(/@@UPLOAD:([^@]+)@@/g, function (x, p) { return map[p] || x; }); ch = true; } o[k] = v; });
      if (ch) __T[n].rows[i] = o;
    });
  });
}
ctx_ = function (token, device) {
  if (!__SUPA.user) throw err_('Sesi berakhir, silakan login kembali', 'NOSESSION');
  var c = buildCtx_(__SUPA.user, device); c.tokenHash = 'supabase'; return c;
};
licenseInfo_ = function () {
  return __SUPA.lic || { tier: 'NONE', title: 'Belum berlangganan', exp: '-', groups: '*', max_estates: 0, max_users: 0, readonly: true, valid: false, reason: 'Lisensi PALM OS belum aktif.' };
};
if (typeof wfxBaseUrl_ === 'function') wfxBaseUrl_ = function () { return __SUPA.appUrl; };

/* ---- dipanggil penghubung ---- */
function __setKnown(list) { __KNOWN = {}; list.forEach(function (n) { __KNOWN[n] = 1; }); }
function __setTable(name, json) { __T[name] = typeof json === 'string' ? JSON.parse(json) : json; }
function __dropTable(name) { delete __T[name]; }
function __mergeRows(name, json) {
  var t = __T[name]; if (!t) return;
  var d = JSON.parse(json), idx = {};
  t.rows.forEach(function (r, i) { idx[r.id] = i; });
  d.h.forEach(function (k) { if (t.h.indexOf(k) < 0) t.h.push(k); });
  d.rows.forEach(function (r) { if (idx[r.id] !== undefined) t.rows[idx[r.id]] = r; else { idx[r.id] = t.rows.length; t.rows.push(r); } });
}
function __clearAll() { __T = {}; __SUPA.user = null; __SUPA.lic = null; }
function __setSession(json) { var s = JSON.parse(json); Object.keys(s).forEach(function (k) { __SUPA[k] = s[k]; }); }
function __loaded() { return Object.keys(__T); }
function __run(action, payload, device) {
  __undo(); __MISSED = []; _memo = {};
  var s = rpc(action, 'supabase', payload ? JSON.parse(payload) : {}, device || '');
  return JSON.stringify({ s: s, missed: __MISSED.slice(), ops: __OPS.slice(), uploads: __UPL.slice(), ext: __EXT.slice(), fire: __FIRE.slice() });
}
window.__engineReady = true;
