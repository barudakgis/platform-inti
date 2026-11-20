/**
 * =====================================================================
 * EKSPOR SEMUA SHEET KE CSV (untuk migrasi ke Supabase)
 * ---------------------------------------------------------------------
 * Cara pakai:
 *   1. Buka spreadsheet aplikasi GAS lama → Ekstensi → Apps Script
 *   2. Buat file baru, tempel seluruh kode ini, simpan
 *   3. Pilih fungsi "eksporSemuaSheet" → Jalankan → izinkan akses
 *   4. Hasil: folder baru di Google Drive berisi satu CSV per sheet
 *
 * Format hasil (cocok untuk scripts/impor.mjs tanpa --format id):
 *   - angka memakai titik desimal (12.5)
 *   - tanggal ISO (2025-12-31 atau 2025-12-31T08:30:00)
 *   - baris pertama = judul kolom
 * =====================================================================
 */

var LEWATI_SHEET = ['_config', '_log']; // nama sheet yang tidak perlu diekspor

function eksporSemuaSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd_HHmm');
  var folder = DriveApp.createFolder(ss.getName() + ' — ekspor CSV ' + stamp);
  var ringkasan = [];
  var mulai = Date.now();

  ss.getSheets().forEach(function (sheet) {
    var nama = sheet.getName();
    if (LEWATI_SHEET.indexOf(nama) >= 0) return;
    if (Date.now() - mulai > 5 * 60 * 1000) { // jaga batas 6 menit
      ringkasan.push(nama + ': DILEWATI (waktu habis, jalankan eksporSatuSheet("' + nama + '"))');
      return;
    }
    var n = eksporSheet_(sheet, folder, tz);
    ringkasan.push(nama + ': ' + n + ' baris');
  });

  Logger.log('Folder: ' + folder.getUrl() + '\n' + ringkasan.join('\n'));
  try {
    SpreadsheetApp.getUi().alert('Ekspor selesai', 'Folder: ' + folder.getUrl() + '\n\n' + ringkasan.join('\n'),
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* dijalankan dari editor tanpa UI */ }
}

/** Ekspor satu sheet saja, contoh: eksporSatuSheet('Data Blok') */
function eksporSatuSheet(namaSheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(namaSheet);
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + namaSheet);
  var folder = DriveApp.createFolder(ss.getName() + ' — ' + namaSheet + ' CSV');
  var n = eksporSheet_(sheet, folder, ss.getSpreadsheetTimeZone());
  Logger.log(namaSheet + ': ' + n + ' baris → ' + folder.getUrl());
}

function eksporSheet_(sheet, folder, tz) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return 0;
  var csv = values.map(function (row) {
    return row.map(function (v) { return sel_(v, tz); }).join(',');
  }).join('\r\n');
  folder.createFile(sheet.getName().replace(/[\\/:*?"<>|]/g, '_') + '.csv', '﻿' + csv, MimeType.CSV);
  return values.length - 1;
}

function sel_(v, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var jam = v.getHours() + v.getMinutes() + v.getSeconds();
    v = Utilities.formatDate(v, tz, jam ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  } else if (typeof v === 'number') {
    v = String(v);              // selalu titik desimal
  } else if (typeof v === 'boolean') {
    v = v ? 'true' : 'false';
  } else {
    v = String(v);
  }
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
