#!/usr/bin/env node
// =====================================================================
// IMPOR DATA DARI GOOGLE SHEETS (CSV) / GEOJSON KE SUPABASE
//
//   node impor.mjs csv     --file data.csv  --table nama_tabel [--org <uuid>]
//   node impor.mjs gis     --file titik.csv --layer <uuid> --lat Lat --lng Lng
//   node impor.mjs geojson --file blok.geojson --layer <uuid>
//
// Opsi umum:
//   --dry-run          hanya tampilkan 3 baris hasil konversi, tidak mengirim
//   --batch 500        jumlah baris per kiriman
//   --map "A:kolom_a,B:kolom_b"   ganti nama kolom CSV → kolom tabel
//   --format id        CSV unduhan manual Sheets Indonesia (koma desimal, tgl dd/mm/yyyy)
//
// Kredensial dibaca dari scripts/.env :
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY=sb_secret_... (atau service_role key)
// Kunci rahasia ini MELEWATI RLS — jangan pernah ditaruh di frontend / GitHub.
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------- argumen
const [mode, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const k = rest[i].slice(2);
    args[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  }
}
const BATCH = Number(args.batch) || 500;
const DRY = Boolean(args['dry-run']);

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
if (!['csv', 'gis', 'geojson'].includes(mode) || !args.file) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).join('\n'));
  process.exit(1);
}
if (!existsSync(args.file)) die(`File tidak ditemukan: ${args.file}`);

// ------------------------------------------------------------- .env
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(join(here, '.env'));

// ------------------------------------------------------------- CSV
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  const [header, ...body] = nonEmpty;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// Konversi nilai. Default: aman untuk CSV hasil skrip GAS (angka bertitik desimal).
// --format id : untuk CSV yang diunduh manual dari Sheets berformat Indonesia
//               (12,5 → 12.5 · 1.234,5 → 1234.5 · 31/12/2025 → 2025-12-31)
const ID_FORMAT = args.format === 'id';
export function convert(value) {
  const v = String(value ?? '').trim();
  if (v === '') return null;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (ID_FORMAT) {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) return v.replace(/\./g, '').replace(',', '.');
    if (/^-?\d+,\d+$/.test(v)) return v.replace(',', '.');
  }
  return v;
}

// Koordinat: koma desimal selalu aman diubah (tidak pernah ada pemisah ribuan)
function coordNum(value) {
  const v = String(value ?? '').trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
  return v === '' ? NaN : Number(v);
}

function renameMap() {
  if (!args.map) return {};
  return Object.fromEntries(String(args.map).split(',').map((p) => p.split(':').map((s) => s.trim())));
}

// ------------------------------------------------------------- kirim
async function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('Isi SUPABASE_URL dan SUPABASE_SECRET_KEY di scripts/.env');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function inBatches(items, fn) {
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    await fn(chunk);
    done += chunk.length;
    process.stdout.write(`\r  terkirim ${done}/${items.length}`);
  }
  process.stdout.write('\n');
}

function pointFeatures(rows) {
  const lat = args.lat, lng = args.lng;
  if (!lat || !lng) die('Mode gis butuh --lat <kolom> dan --lng <kolom>');
  const out = [], skipped = [];
  rows.forEach((r, i) => {
    const y = coordNum(r[lat]), x = coordNum(r[lng]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) { skipped.push(i + 2); return; }
    const props = Object.fromEntries(Object.entries(r).filter(([k]) => k !== lat && k !== lng).map(([k, v]) => [k, convert(v)]));
    out.push({ type: 'Feature', id: randomUUID(), geometry: { type: 'Point', coordinates: [x, y] }, properties: props });
  });
  if (skipped.length) console.warn(`! ${skipped.length} baris dilewati (koordinat kosong/tidak valid), contoh baris: ${skipped.slice(0, 10).join(', ')}`);
  return out;
}

// ------------------------------------------------------------- main
async function main() {
  if (mode === 'csv') {
    if (!args.table) die('Mode csv butuh --table <nama_tabel>');
    const ren = renameMap();
    const rows = parseCsv(readFileSync(args.file, 'utf8')).map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) o[ren[k] || k] = convert(v);
      if (args.org) o.org_id = args.org;
      return o;
    });
    console.log(`• ${rows.length} baris dari ${args.file} → tabel ${args.table}`);
    if (DRY) return console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    const sb = await client();
    await inBatches(rows, async (chunk) => {
      const { error } = await sb.from(args.table).insert(chunk);
      if (error) die(`Gagal: ${error.message}\n  Contoh data: ${JSON.stringify(chunk[0])}`);
    });
  } else {
    if (!args.layer) die(`Mode ${mode} butuh --layer <uuid layer>`);
    let features;
    if (mode === 'gis') features = pointFeatures(parseCsv(readFileSync(args.file, 'utf8')));
    else {
      const data = JSON.parse(readFileSync(args.file, 'utf8'));
      features = (data.features || []).filter((f) => f.geometry);
      const c = JSON.stringify(features[0]?.geometry?.coordinates || []).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
      if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) die('Koordinat bukan EPSG:4326. Ekspor ulang dari QGIS dengan CRS EPSG:4326.');
    }
    console.log(`• ${features.length} fitur → layer ${args.layer}`);
    if (DRY) return console.log(JSON.stringify(features.slice(0, 3), null, 2));
    const sb = await client();
    await inBatches(features, async (chunk) => {
      const { error } = await sb.rpc('gis_import_geojson', { p_layer: args.layer, p_fc: { type: 'FeatureCollection', features: chunk } });
      if (error) die(`Gagal: ${error.message}`);
    });
  }
  console.log('✓ Selesai');
}

main().catch((e) => die(e.message));
