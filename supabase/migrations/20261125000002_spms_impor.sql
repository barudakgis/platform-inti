-- =====================================================================
-- SPMS — FILE 2 dari 2: PEMINDAHAN DATA DARI VERSI GOOGLE SHEETS (GAS)
-- Cara kerja:
--   1. Admin membuat token impor sekali pakai (berlaku 48 jam) di SQL Editor:
--        select public.spms_import_token('<ORG_ID>');
--   2. Token ditempel di berkas 09_PindahSupabase.gs pada proyek GAS lama,
--      lalu fungsi pindahKeSupabase() dijalankan. GAS mengirim data per paket.
--   3. Hasil dicek: select jsonb_pretty(public.spms_import_report('<ORG_ID>'));
--   4. Setelah pengguna mendaftar di Platform Inti dengan email yang sama:
--        select jsonb_pretty(public.spms_link_legacy_users('<ORG_ID>'));
-- Data lama di Google Sheets TIDAK diubah. Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.spms_entities (
  ent     text primary key,
  tbl     text not null,
  module  text not null,
  scope   text not null,
  label   text not null,
  ord     int  not null
);
create table if not exists public.spms_fields (
  ent   text not null references public.spms_entities(ent) on delete cascade,
  col   text not null,
  typ   text not null,      -- text | num | date | bool | json | geom
  primary key (ent, col)
);

insert into public.spms_entities (ent, tbl, module, scope, label, ord) values
  ('Organisasi', 'spms_organisasi', 'org', 'global', 'Organisasi', 1),
  ('Komoditas', 'spms_komoditas', 'master', 'global', 'Komoditas', 2),
  ('Varietas', 'spms_varietas', 'master', 'global', 'Varietas', 3),
  ('Petani', 'spms_petani', 'farmer', 'org', 'Petani', 4),
  ('Kebun', 'spms_kebun', 'farm', 'org', 'Kebun', 5),
  ('Bidang', 'spms_bidang', 'parcel', 'org', 'Bidang Lahan', 6),
  ('Survei', 'spms_survei', 'survey', 'org', 'Sesi Survei', 7),
  ('TitikSurvei', 'spms_titik_survei', 'survey', 'org', 'Titik Survei', 8),
  ('BidangVersi', 'spms_bidang_versi', 'parcel', 'org', 'Riwayat Geometri', 9),
  ('HakLahan', 'spms_hak_lahan', 'parcel', 'org', 'Relasi Penguasaan', 10),
  ('Pohon', 'spms_pohon', 'tree', 'org', 'Data Pohon', 11),
  ('EventPohon', 'spms_event_pohon', 'tree', 'org', 'Riwayat Pohon', 12),
  ('Pembeli', 'spms_pembeli', 'harvest', 'org', 'Pembeli', 13),
  ('Inventori', 'spms_inventori', 'inventory', 'org', 'Barang Inventori', 14),
  ('MutasiStok', 'spms_mutasi_stok', 'inventory', 'org', 'Mutasi Stok', 15),
  ('Aktivitas', 'spms_aktivitas', 'activity', 'org', 'Aktivitas Kebun', 16),
  ('Pemupukan', 'spms_pemupukan', 'fert', 'org', 'Pemupukan', 17),
  ('HamaPenyakit', 'spms_hama_penyakit', 'pest', 'org', 'Hama & Penyakit', 18),
  ('Panen', 'spms_panen', 'harvest', 'org', 'Panen', 19),
  ('Akun', 'spms_akun', 'finance', 'org', 'Akun (COA)', 20),
  ('Jurnal', 'spms_jurnal', 'finance', 'org', 'Jurnal', 21),
  ('JurnalBaris', 'spms_jurnal_baris', 'finance', 'org', 'Baris Jurnal', 22),
  ('Rekomendasi', 'spms_rekomendasi', 'ai', 'org', 'Rekomendasi AI', 23),
  ('Notifikasi', 'spms_notifikasi', 'notif', 'org', 'Notifikasi', 24),
  ('Media', 'spms_media', 'media', 'org', 'Dokumentasi', 25)
on conflict (ent) do update set tbl = excluded.tbl, module = excluded.module, scope = excluded.scope, label = excluded.label, ord = excluded.ord;
insert into public.spms_fields (ent, col, typ) values
  ('Organisasi', 'code', 'text'),
  ('Organisasi', 'name', 'text'),
  ('Organisasi', 'type', 'text'),
  ('Organisasi', 'region', 'text'),
  ('Organisasi', 'address', 'text'),
  ('Organisasi', 'leader', 'text'),
  ('Organisasi', 'phone', 'text'),
  ('Organisasi', 'status', 'text'),
  ('Komoditas', 'code', 'text'),
  ('Komoditas', 'name', 'text'),
  ('Komoditas', 'category', 'text'),
  ('Komoditas', 'yield_unit', 'text'),
  ('Komoditas', 'productive_age', 'num'),
  ('Komoditas', 'replant_age', 'num'),
  ('Komoditas', 'color', 'text'),
  ('Varietas', 'commodity_id', 'text'),
  ('Varietas', 'code', 'text'),
  ('Varietas', 'name', 'text'),
  ('Petani', 'code', 'text'),
  ('Petani', 'name', 'text'),
  ('Petani', 'gender', 'text'),
  ('Petani', 'birth_year', 'num'),
  ('Petani', 'group_name', 'text'),
  ('Petani', 'village', 'text'),
  ('Petani', 'address', 'text'),
  ('Petani', 'phone', 'text'),
  ('Petani', 'family_count', 'num'),
  ('Petani', 'photo', 'text'),
  ('Petani', 'consent', 'bool'),
  ('Petani', 'status', 'text'),
  ('Petani', 'notes', 'text'),
  ('Kebun', 'farmer_id', 'text'),
  ('Kebun', 'code', 'text'),
  ('Kebun', 'name', 'text'),
  ('Kebun', 'village', 'text'),
  ('Kebun', 'commodity_id', 'text'),
  ('Kebun', 'planting_year', 'num'),
  ('Kebun', 'status', 'text'),
  ('Kebun', 'notes', 'text'),
  ('Bidang', 'farm_id', 'text'),
  ('Bidang', 'farmer_id', 'text'),
  ('Bidang', 'code', 'text'),
  ('Bidang', 'name', 'text'),
  ('Bidang', 'commodity_id', 'text'),
  ('Bidang', 'land_relation', 'text'),
  ('Bidang', 'area_m2', 'num'),
  ('Bidang', 'perimeter_m', 'num'),
  ('Bidang', 'method', 'text'),
  ('Bidang', 'accuracy_m', 'num'),
  ('Bidang', 'status', 'text'),
  ('Bidang', 'version', 'num'),
  ('Bidang', 'geom', 'geom'),
  ('Bidang', 'legal_note', 'text'),
  ('Survei', 'parcel_id', 'text'),
  ('Survei', 'farmer_id', 'text'),
  ('Survei', 'method', 'text'),
  ('Survei', 'crs', 'text'),
  ('Survei', 'device', 'text'),
  ('Survei', 'receiver', 'text'),
  ('Survei', 'correction', 'text'),
  ('Survei', 'started_at', 'text'),
  ('Survei', 'ended_at', 'text'),
  ('Survei', 'n_points', 'num'),
  ('Survei', 'accuracy_m', 'num'),
  ('Survei', 'area_m2', 'num'),
  ('Survei', 'perimeter_m', 'num'),
  ('Survei', 'status', 'text'),
  ('Survei', 'reviewer', 'text'),
  ('Survei', 'review_note', 'text'),
  ('Survei', 'geom', 'geom'),
  ('TitikSurvei', 'survey_id', 'text'),
  ('TitikSurvei', 'no', 'num'),
  ('TitikSurvei', 'lat', 'num'),
  ('TitikSurvei', 'lng', 'num'),
  ('TitikSurvei', 'acc', 'num'),
  ('TitikSurvei', 'alt', 'num'),
  ('TitikSurvei', 'ts', 'text'),
  ('TitikSurvei', 'kind', 'text'),
  ('TitikSurvei', 'note', 'text'),
  ('BidangVersi', 'parcel_id', 'text'),
  ('BidangVersi', 'version', 'num'),
  ('BidangVersi', 'geom', 'geom'),
  ('BidangVersi', 'area_m2', 'num'),
  ('BidangVersi', 'survey_id', 'text'),
  ('BidangVersi', 'reason', 'text'),
  ('HakLahan', 'parcel_id', 'text'),
  ('HakLahan', 'farmer_id', 'text'),
  ('HakLahan', 'relation', 'text'),
  ('HakLahan', 'valid_from', 'date'),
  ('HakLahan', 'valid_to', 'date'),
  ('HakLahan', 'doc_ref', 'text'),
  ('HakLahan', 'note', 'text'),
  ('Pohon', 'parcel_id', 'text'),
  ('Pohon', 'farmer_id', 'text'),
  ('Pohon', 'code', 'text'),
  ('Pohon', 'commodity_id', 'text'),
  ('Pohon', 'variety_id', 'text'),
  ('Pohon', 'lat', 'num'),
  ('Pohon', 'lng', 'num'),
  ('Pohon', 'row_no', 'num'),
  ('Pohon', 'tree_no', 'num'),
  ('Pohon', 'planting_date', 'date'),
  ('Pohon', 'status', 'text'),
  ('Pohon', 'health', 'text'),
  ('Pohon', 'productivity', 'text'),
  ('Pohon', 'replaced_by', 'text'),
  ('Pohon', 'notes', 'text'),
  ('EventPohon', 'tree_id', 'text'),
  ('EventPohon', 'type', 'text'),
  ('EventPohon', 'date', 'date'),
  ('EventPohon', 'description', 'text'),
  ('EventPohon', 'health', 'text'),
  ('EventPohon', 'height_m', 'num'),
  ('Pembeli', 'name', 'text'),
  ('Pembeli', 'kind', 'text'),
  ('Pembeli', 'contact', 'text'),
  ('Pembeli', 'address', 'text'),
  ('Inventori', 'sku', 'text'),
  ('Inventori', 'name', 'text'),
  ('Inventori', 'category', 'text'),
  ('Inventori', 'unit', 'text'),
  ('Inventori', 'n', 'num'),
  ('Inventori', 'p', 'num'),
  ('Inventori', 'k', 'num'),
  ('Inventori', 'mg', 'num'),
  ('Inventori', 'min_stock', 'num'),
  ('Inventori', 'price', 'num'),
  ('Inventori', 'warehouse', 'text'),
  ('MutasiStok', 'item_id', 'text'),
  ('MutasiStok', 'date', 'date'),
  ('MutasiStok', 'kind', 'text'),
  ('MutasiStok', 'qty', 'num'),
  ('MutasiStok', 'unit_cost', 'num'),
  ('MutasiStok', 'ref', 'text'),
  ('MutasiStok', 'note', 'text'),
  ('Aktivitas', 'parcel_id', 'text'),
  ('Aktivitas', 'farmer_id', 'text'),
  ('Aktivitas', 'type', 'text'),
  ('Aktivitas', 'date', 'date'),
  ('Aktivitas', 'tree_ids', 'text'),
  ('Aktivitas', 'worker', 'text'),
  ('Aktivitas', 'status', 'text'),
  ('Aktivitas', 'cost', 'num'),
  ('Aktivitas', 'notes', 'text'),
  ('Pemupukan', 'parcel_id', 'text'),
  ('Pemupukan', 'farmer_id', 'text'),
  ('Pemupukan', 'tree_id', 'text'),
  ('Pemupukan', 'date', 'date'),
  ('Pemupukan', 'item_id', 'text'),
  ('Pemupukan', 'dosage', 'num'),
  ('Pemupukan', 'unit', 'text'),
  ('Pemupukan', 'tree_count', 'num'),
  ('Pemupukan', 'qty_total', 'num'),
  ('Pemupukan', 'cost', 'num'),
  ('Pemupukan', 'method', 'text'),
  ('Pemupukan', 'notes', 'text'),
  ('HamaPenyakit', 'parcel_id', 'text'),
  ('HamaPenyakit', 'farmer_id', 'text'),
  ('HamaPenyakit', 'tree_id', 'text'),
  ('HamaPenyakit', 'date', 'date'),
  ('HamaPenyakit', 'kind', 'text'),
  ('HamaPenyakit', 'name', 'text'),
  ('HamaPenyakit', 'severity', 'text'),
  ('HamaPenyakit', 'symptoms', 'text'),
  ('HamaPenyakit', 'treatment', 'text'),
  ('HamaPenyakit', 'status', 'text'),
  ('HamaPenyakit', 'lat', 'num'),
  ('HamaPenyakit', 'lng', 'num'),
  ('Panen', 'parcel_id', 'text'),
  ('Panen', 'farmer_id', 'text'),
  ('Panen', 'tree_id', 'text'),
  ('Panen', 'commodity_id', 'text'),
  ('Panen', 'date', 'date'),
  ('Panen', 'qty', 'num'),
  ('Panen', 'unit', 'text'),
  ('Panen', 'tree_count', 'num'),
  ('Panen', 'grade', 'text'),
  ('Panen', 'price', 'num'),
  ('Panen', 'buyer_id', 'text'),
  ('Panen', 'revenue', 'num'),
  ('Panen', 'transport_cost', 'num'),
  ('Panen', 'notes', 'text'),
  ('Akun', 'code', 'text'),
  ('Akun', 'name', 'text'),
  ('Akun', 'type', 'text'),
  ('Akun', 'is_cash', 'bool'),
  ('Jurnal', 'date', 'date'),
  ('Jurnal', 'ref', 'text'),
  ('Jurnal', 'description', 'text'),
  ('Jurnal', 'parcel_id', 'text'),
  ('Jurnal', 'farmer_id', 'text'),
  ('Jurnal', 'total', 'num'),
  ('Jurnal', 'status', 'text'),
  ('Jurnal', 'reversal_of', 'text'),
  ('Jurnal', 'source', 'text'),
  ('JurnalBaris', 'journal_id', 'text'),
  ('JurnalBaris', 'account_id', 'text'),
  ('JurnalBaris', 'debit', 'num'),
  ('JurnalBaris', 'credit', 'num'),
  ('Rekomendasi', 'kind', 'text'),
  ('Rekomendasi', 'entity', 'text'),
  ('Rekomendasi', 'entity_id', 'text'),
  ('Rekomendasi', 'content', 'text'),
  ('Rekomendasi', 'confidence', 'num'),
  ('Rekomendasi', 'status', 'text'),
  ('Rekomendasi', 'reviewer', 'text'),
  ('Notifikasi', 'user_id', 'text'),
  ('Notifikasi', 'title', 'text'),
  ('Notifikasi', 'body', 'text'),
  ('Notifikasi', 'status', 'text'),
  ('Media', 'entity', 'text'),
  ('Media', 'entity_id', 'text'),
  ('Media', 'category', 'text'),
  ('Media', 'description', 'text'),
  ('Media', 'file_id', 'text'),
  ('Media', 'mime', 'text'),
  ('Media', 'size', 'num'),
  ('Media', 'thumb', 'text'),
  ('Media', 'lat', 'num'),
  ('Media', 'lng', 'num'),
  ('Media', 'captured_at', 'text'),
  ('Media', 'checksum', 'text'),
  ('Media', 'version', 'num')
on conflict (ent, col) do update set typ = excluded.typ;

create table if not exists public.spms_legacy_users (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  id          text not null,
  username    text,
  name        text,
  email       text,
  phone       text,
  role        text,
  unit_id     text,
  farmer_id   text,
  status      text,
  photo       text,
  last_login  text,
  linked_user uuid,
  primary key (org_id, id)
);
create table if not exists public.spms_import_tokens (
  token_hash  text primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  calls       int not null default 0
);
create table if not exists public.spms_import_log (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  ent         text not null,
  sent        int not null default 0,
  inserted    int not null default 0,
  updated     int not null default 0,
  skipped     int not null default 0,
  failed      int not null default 0,
  geom_failed int not null default 0,
  errors      jsonb not null default '[]'::jsonb,
  last_at     timestamptz not null default now(),
  primary key (org_id, ent)
);
alter table public.spms_entities enable row level security;
alter table public.spms_fields enable row level security;
alter table public.spms_legacy_users enable row level security;
alter table public.spms_import_tokens enable row level security;
alter table public.spms_import_log enable row level security;
drop policy if exists spms_entities_sel on public.spms_entities;
create policy spms_entities_sel on public.spms_entities for select to authenticated using (true);
drop policy if exists spms_fields_sel on public.spms_fields;
create policy spms_fields_sel on public.spms_fields for select to authenticated using (true);
drop policy if exists spms_legacy_users_sel on public.spms_legacy_users;
create policy spms_legacy_users_sel on public.spms_legacy_users for select to authenticated using (public.spms_can(org_id, 'users', 'R'));
drop policy if exists spms_import_log_sel on public.spms_import_log;
create policy spms_import_log_sel on public.spms_import_log for select to authenticated using (public.spms_can(org_id, 'users', 'R'));
grant select on public.spms_entities, public.spms_fields, public.spms_legacy_users, public.spms_import_log to authenticated;
revoke all on public.spms_entities, public.spms_fields, public.spms_legacy_users, public.spms_import_tokens, public.spms_import_log from anon;
revoke all on public.spms_import_tokens from authenticated;

-- ---------------------------------------------------------------------
-- Token impor (hanya bisa dibuat dari SQL Editor / pemilik database)
-- ---------------------------------------------------------------------
create or replace function public.spms_import_token(p_org uuid, p_hours int default 48)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_tok text;
begin
  if not exists (select 1 from organizations where id = p_org) then
    raise exception 'ORG_ID % tidak ditemukan. Lihat daftar: select id, name from organizations;', p_org;
  end if;
  v_tok := 'spmsimp_' || encode(gen_random_bytes(24), 'hex');
  insert into spms_import_tokens (token_hash, org_id, expires_at)
  values (encode(digest(v_tok, 'sha256'), 'hex'), p_org, now() + make_interval(hours => greatest(1, least(p_hours, 168))));
  return v_tok;
end $$;
revoke execute on function public.spms_import_token(uuid, int) from public, anon, authenticated;

create or replace function public.spms_import_revoke(p_org uuid)
returns int language sql security definer set search_path = public as $$
  with d as (delete from spms_import_tokens where org_id = p_org returning 1) select count(*)::int from d;
$$;
revoke execute on function public.spms_import_revoke(uuid) from public, anon, authenticated;

-- Pembersih nilai sel GAS → nilai bertipe ('' → null, 1/0 → boolean, GeoJSON → geometri)
create or replace function public.spms_clean(p_typ text, v jsonb)
returns jsonb language plpgsql immutable set search_path = public, extensions as $$
declare s text; g geometry;
begin
  if v is null or v = 'null'::jsonb then return null; end if;
  s := case jsonb_typeof(v) when 'string' then v #>> '{}' else v::text end;
  if s is null or btrim(s) = '' then return null; end if;
  case p_typ
    when 'num' then
      s := replace(replace(btrim(s), ' ', ''), ',', '.');
      if s ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then return to_jsonb(s::numeric); end if;
      return null;
    when 'bool' then return to_jsonb(lower(s) in ('1', 'true', 'ya', 'y', 'yes'));
    when 'date' then
      if s ~ '^\d{4}-\d{2}-\d{2}' then return to_jsonb(left(s, 10)); end if;
      if s ~ '^\d{1,2}/\d{1,2}/\d{4}$' then return to_jsonb(to_char(to_date(s, 'DD/MM/YYYY'), 'YYYY-MM-DD')); end if;
      return null;
    when 'json' then
      if jsonb_typeof(v) = 'string' then begin return s::jsonb; exception when others then return to_jsonb(s); end; end if;
      return v;
    when 'geom' then
      begin
        g := st_setsrid(st_geomfromgeojson(case when jsonb_typeof(v) = 'string' then s else v::text end), 4326);
        if not st_isvalid(g) then
          g := st_makevalid(g);
          -- poligon rusak tidak boleh berubah jadi titik/garis: ambil bagian poligonnya saja
          if s ~* '"type"\s*:\s*"(Multi)?Polygon"' then g := st_collectionextract(g, 3); end if;
        end if;
        if g is null or st_isempty(g) or (s ~* '"type"\s*:\s*"(Multi)?Polygon"' and st_area(g) = 0) then
          return to_jsonb('#GEOM_GAGAL'::text);
        end if;
        return to_jsonb(encode(st_asewkb(g), 'hex'));
      exception when others then return to_jsonb('#GEOM_GAGAL'::text);
      end;
    else return to_jsonb(s);
  end case;
end $$;

-- ---------------------------------------------------------------------
-- Penerima data dari GAS (dipanggil oleh 09_PindahSupabase.gs)
--   p_mode 'add'     : tambah yang belum ada (default, aman diulang)
--   p_mode 'refresh' : timpa dengan data lama (HANYA sebelum aplikasi baru dipakai)
-- ---------------------------------------------------------------------
create or replace function public.spms_import_push(p_token text, p_ent text, p_rows jsonb default '[]'::jsonb, p_mode text default 'add')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid; v_tbl text; r jsonb; c jsonb; v_cols text; v_set text; v_ins boolean;
  n_ins int := 0; n_upd int := 0; n_skip int := 0; n_fail int := 0; n_geom int := 0; errs jsonb := '[]'::jsonb;
  v_id text; k text;
begin
  select org_id into v_org from spms_import_tokens
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if v_org is null then raise exception 'Token impor salah atau kedaluwarsa. Buat token baru: select public.spms_import_token(''<ORG_ID>'');'; end if;
  update spms_import_tokens set calls = calls + 1 where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if p_ent = '_ping' then
    return jsonb_build_object('ok', true, 'org', (select name from organizations where id = v_org), 'org_id', v_org);
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows harus array'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Maksimal 2000 baris per kiriman'; end if;
  if p_mode not in ('add', 'refresh') then raise exception 'p_mode harus add atau refresh'; end if;
  perform set_config('spms.importing', '1', true);

  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(btrim(coalesce(r->>'id', '')), '');
    begin
      if v_id is null then raise exception 'id kosong'; end if;
      if p_ent = '_Users' then
        insert into spms_legacy_users (org_id, id, username, name, email, phone, role, unit_id, farmer_id, status, photo, last_login)
        values (v_org, v_id, r->>'username', r->>'name', nullif(lower(btrim(r->>'email')), ''), r->>'phone', r->>'role',
                nullif(r->>'org_id', ''), nullif(r->>'farmer_id', ''), r->>'status', nullif(r->>'photo', ''), r->>'last_login')
        on conflict (org_id, id) do update set username = excluded.username, name = excluded.name, email = excluded.email, phone = excluded.phone,
          role = excluded.role, unit_id = excluded.unit_id, farmer_id = excluded.farmer_id, status = excluded.status, photo = excluded.photo,
          last_login = excluded.last_login
        returning (xmax = 0) into v_ins;
      elsif p_ent = '_Settings' then
        insert into spms_settings (org_id, scope, key, value, updated_at)
        values (v_org, coalesce(nullif(r->>'scope', ''), 'global'), r->>'key',
                case when (r->>'value') is null or r->>'value' = '' then null
                     else coalesce(public.spms_try_json(r->>'value'), to_jsonb(r->>'value')) end,
                coalesce(nullif(r->>'updated_at', '')::timestamptz, now()))
        on conflict (org_id, scope, key) do update set value = excluded.value, updated_at = excluded.updated_at
          where p_mode = 'refresh'
        returning (xmax = 0) into v_ins;
      elsif p_ent = '_Audit' then
        insert into spms_audit (id, org_id, ts, legacy_user_id, username, unit_id, action, entity, entity_id, detail)
        values (v_id, v_org, coalesce(nullif(r->>'ts', '')::timestamptz, now()), nullif(r->>'user_id', ''), r->>'username',
                nullif(r->>'org_id', ''), r->>'action', r->>'entity', r->>'entity_id', left(r->>'detail', 4000))
        on conflict (id) do nothing
        returning true into v_ins;
      else
        select tbl into v_tbl from spms_entities where ent = p_ent;
        if v_tbl is null then raise exception 'Entitas tidak dikenal: %', p_ent; end if;
        -- bentuk baris bersih
        select jsonb_object_agg(f.col, public.spms_clean(f.typ, r -> f.col)) into c
          from spms_fields f where f.ent = p_ent and r ? f.col;
        c := coalesce(c, '{}'::jsonb) || jsonb_build_object(
          'id', v_id, 'org_id', v_org,
          'unit_id', case when p_ent = 'Organisasi' then null else nullif(r->>'org_id', '') end,
          'legacy_created_by', nullif(r->>'created_by', ''),
          'created_at', coalesce(nullif(r->>'created_at', ''), now()::text),
          'updated_at', coalesce(nullif(r->>'updated_at', ''), nullif(r->>'created_at', ''), now()::text),
          'deleted', coalesce(r->>'deleted', '') in ('1', 'true', 'TRUE'));
        if p_ent = 'Media' and coalesce(c->>'file_id', '') <> '' and position(':' in c->>'file_id') = 0 then
          c := c || jsonb_build_object('file_id', 'drive:' || (c->>'file_id'));
        end if;
        for k in select key from jsonb_each_text(c) where value = '#GEOM_GAGAL' loop
          c := c || jsonb_build_object(k, null); n_geom := n_geom + 1;
        end loop;
        select string_agg(format('%I', key), ', '), string_agg(format('%I = excluded.%I', key, key), ', ')
          into v_cols, v_set from jsonb_object_keys(c) key where key not in ('id', 'org_id');
        v_ins := null;
        execute format('insert into public.%I as t (id, org_id, %s) select id, org_id, %s from jsonb_populate_record(null::public.%I, $1) '
                       'on conflict (id) do %s returning (xmax = 0)',
                       v_tbl, v_cols, v_cols, v_tbl,
                       case when p_mode = 'refresh' then format('update set %s where t.org_id = excluded.org_id', v_set) else 'nothing' end)
          into v_ins using c;
        if v_ins is null then
          execute format('select org_id = $2 from public.%I where id = $1', v_tbl) into v_ins using v_id, v_org;
          if v_ins is false then raise exception 'ID % sudah dipakai organisasi lain', v_id; end if;
          v_ins := null;
        end if;
      end if;
      if v_ins is null then n_skip := n_skip + 1; elsif v_ins then n_ins := n_ins + 1; else n_upd := n_upd + 1; end if;
    exception
      when unique_violation then
        n_fail := n_fail + 1;
        if jsonb_array_length(errs) < 50 then errs := errs || jsonb_build_array(coalesce(v_id, '?') || ': kode "' || coalesce(r->>'code', r->>'username', '') ||
          '" sudah dipakai data lain di unit yang sama (ID berbeda). Ubah salah satu kodenya di Sheets lalu kirim ulang.'); end if;
      when others then
        n_fail := n_fail + 1;
        if jsonb_array_length(errs) < 50 then errs := errs || jsonb_build_array(coalesce(v_id, '?') || ': ' || sqlerrm); end if;
    end;
  end loop;

  insert into spms_import_log as l (org_id, ent, sent, inserted, updated, skipped, failed, geom_failed, errors, last_at)
  values (v_org, p_ent, jsonb_array_length(p_rows), n_ins, n_upd, n_skip, n_fail, n_geom, errs, now())
  on conflict (org_id, ent) do update set sent = l.sent + excluded.sent, inserted = l.inserted + excluded.inserted,
    updated = l.updated + excluded.updated, skipped = l.skipped + excluded.skipped, failed = l.failed + excluded.failed,
    geom_failed = l.geom_failed + excluded.geom_failed,
    errors = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(l.errors || excluded.errors) x limit 100) z),
    last_at = now();
  return jsonb_build_object('ent', p_ent, 'sent', jsonb_array_length(p_rows), 'inserted', n_ins, 'updated', n_upd,
                            'skipped', n_skip, 'failed', n_fail, 'geom_failed', n_geom, 'errors', errs);
end $$;
grant execute on function public.spms_import_push(text, text, jsonb, text) to anon, authenticated;

create or replace function public.spms_try_json(p text)
returns jsonb language plpgsql immutable as $$
begin return p::jsonb; exception when others then return null; end $$;

-- Mulai catatan impor baru (dipanggil GAS saat mulai dari awal)
create or replace function public.spms_import_reset_log(p_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid;
begin
  select org_id into v_org from spms_import_tokens where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if v_org is null then raise exception 'Token impor salah atau kedaluwarsa.'; end if;
  delete from spms_import_log where org_id = v_org;
  return true;
end $$;
grant execute on function public.spms_import_reset_log(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Laporan hasil pemindahan
-- ---------------------------------------------------------------------
create or replace function public.spms_import_report(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; e record; n int; a int; o jsonb; b jsonb;
begin
  if auth.uid() is not null and coalesce(public.spms_role(p_org), '') <> 'super_admin' then raise exception 'Hanya super_admin'; end if;
  for e in select * from spms_entities order by ord loop
    execute format('select count(*), count(*) filter (where not deleted) from public.%I where org_id = $1', e.tbl) into n, a using p_org;
    select jsonb_build_object('dikirim_dari_gas', coalesce(l.sent, 0), 'baru', coalesce(l.inserted, 0), 'diperbarui', coalesce(l.updated, 0),
             'sudah_ada', coalesce(l.skipped, 0), 'gagal', coalesce(l.failed, 0), 'geometri_gagal', coalesce(l.geom_failed, 0),
             'total_di_supabase', n, 'aktif', a) || case when coalesce(l.failed, 0) > 0 then jsonb_build_object('contoh_galat', l.errors) else '{}'::jsonb end
      into o from (select 1) d left join spms_import_log l on l.org_id = p_org and l.ent = e.ent;
    v := v || jsonb_build_object(e.ent, o);
  end loop;
  select jsonb_object_agg(ent, jsonb_build_object('dikirim', sent, 'masuk', inserted + updated + skipped, 'gagal', failed) ||
         case when failed > 0 then jsonb_build_object('contoh_galat', errors) else '{}'::jsonb end) into b
    from spms_import_log where org_id = p_org and ent like '\_%';
  return jsonb_build_object(
    'organisasi', (select name from organizations where id = p_org),
    'per_data', v,
    'sistem', coalesce(b, '{}'::jsonb),
    'referensi_yatim', (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from (values
       ('Varietas.commodity_id', (select count(*) from public.spms_varietas x where x.org_id = p_org and x."commodity_id" is not null and not exists (select 1 from public.spms_komoditas y where y.id = x."commodity_id"))),
       ('Kebun.farmer_id', (select count(*) from public.spms_kebun x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Kebun.commodity_id', (select count(*) from public.spms_kebun x where x.org_id = p_org and x."commodity_id" is not null and not exists (select 1 from public.spms_komoditas y where y.id = x."commodity_id"))),
       ('Bidang.farm_id', (select count(*) from public.spms_bidang x where x.org_id = p_org and x."farm_id" is not null and not exists (select 1 from public.spms_kebun y where y.id = x."farm_id"))),
       ('Bidang.farmer_id', (select count(*) from public.spms_bidang x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Bidang.commodity_id', (select count(*) from public.spms_bidang x where x.org_id = p_org and x."commodity_id" is not null and not exists (select 1 from public.spms_komoditas y where y.id = x."commodity_id"))),
       ('Survei.parcel_id', (select count(*) from public.spms_survei x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('Survei.farmer_id', (select count(*) from public.spms_survei x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('TitikSurvei.survey_id', (select count(*) from public.spms_titik_survei x where x.org_id = p_org and x."survey_id" is not null and not exists (select 1 from public.spms_survei y where y.id = x."survey_id"))),
       ('BidangVersi.parcel_id', (select count(*) from public.spms_bidang_versi x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('BidangVersi.survey_id', (select count(*) from public.spms_bidang_versi x where x.org_id = p_org and x."survey_id" is not null and not exists (select 1 from public.spms_survei y where y.id = x."survey_id"))),
       ('HakLahan.parcel_id', (select count(*) from public.spms_hak_lahan x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('HakLahan.farmer_id', (select count(*) from public.spms_hak_lahan x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Pohon.parcel_id', (select count(*) from public.spms_pohon x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('Pohon.farmer_id', (select count(*) from public.spms_pohon x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Pohon.commodity_id', (select count(*) from public.spms_pohon x where x.org_id = p_org and x."commodity_id" is not null and not exists (select 1 from public.spms_komoditas y where y.id = x."commodity_id"))),
       ('Pohon.variety_id', (select count(*) from public.spms_pohon x where x.org_id = p_org and x."variety_id" is not null and not exists (select 1 from public.spms_varietas y where y.id = x."variety_id"))),
       ('EventPohon.tree_id', (select count(*) from public.spms_event_pohon x where x.org_id = p_org and x."tree_id" is not null and not exists (select 1 from public.spms_pohon y where y.id = x."tree_id"))),
       ('MutasiStok.item_id', (select count(*) from public.spms_mutasi_stok x where x.org_id = p_org and x."item_id" is not null and not exists (select 1 from public.spms_inventori y where y.id = x."item_id"))),
       ('Aktivitas.parcel_id', (select count(*) from public.spms_aktivitas x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('Aktivitas.farmer_id', (select count(*) from public.spms_aktivitas x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Pemupukan.parcel_id', (select count(*) from public.spms_pemupukan x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('Pemupukan.farmer_id', (select count(*) from public.spms_pemupukan x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Pemupukan.item_id', (select count(*) from public.spms_pemupukan x where x.org_id = p_org and x."item_id" is not null and not exists (select 1 from public.spms_inventori y where y.id = x."item_id"))),
       ('HamaPenyakit.parcel_id', (select count(*) from public.spms_hama_penyakit x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('HamaPenyakit.farmer_id', (select count(*) from public.spms_hama_penyakit x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Panen.parcel_id', (select count(*) from public.spms_panen x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('Panen.farmer_id', (select count(*) from public.spms_panen x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('Panen.commodity_id', (select count(*) from public.spms_panen x where x.org_id = p_org and x."commodity_id" is not null and not exists (select 1 from public.spms_komoditas y where y.id = x."commodity_id"))),
       ('Panen.buyer_id', (select count(*) from public.spms_panen x where x.org_id = p_org and x."buyer_id" is not null and not exists (select 1 from public.spms_pembeli y where y.id = x."buyer_id"))),
       ('Jurnal.parcel_id', (select count(*) from public.spms_jurnal x where x.org_id = p_org and x."parcel_id" is not null and not exists (select 1 from public.spms_bidang y where y.id = x."parcel_id"))),
       ('Jurnal.farmer_id', (select count(*) from public.spms_jurnal x where x.org_id = p_org and x."farmer_id" is not null and not exists (select 1 from public.spms_petani y where y.id = x."farmer_id"))),
       ('JurnalBaris.journal_id', (select count(*) from public.spms_jurnal_baris x where x.org_id = p_org and x."journal_id" is not null and not exists (select 1 from public.spms_jurnal y where y.id = x."journal_id"))),
       ('JurnalBaris.account_id', (select count(*) from public.spms_jurnal_baris x where x.org_id = p_org and x."account_id" is not null and not exists (select 1 from public.spms_akun y where y.id = x."account_id")))) z(k, c) where c > 0),
    'bidang_tanpa_geometri', jsonb_build_object('Bidang', (select count(*) from public.spms_bidang where org_id = p_org and not deleted and geom is null), 'Survei', (select count(*) from public.spms_survei where org_id = p_org and not deleted and geom is null), 'BidangVersi', (select count(*) from public.spms_bidang_versi where org_id = p_org and not deleted and geom is null)),
    'foto_masih_di_drive', (select count(*) from spms_media where org_id = p_org and not deleted and file_id like 'drive:%'),
    'pengguna_lama', (select count(*) from spms_legacy_users where org_id = p_org),
    'pengguna_lama_belum_ditautkan', (select coalesce(jsonb_agg(coalesce(email, '(tanpa email) ' || username) order by username), '[]'::jsonb)
                                        from spms_legacy_users where org_id = p_org and linked_user is null and coalesce(status, '') <> 'Nonaktif')
  );
end $$;
revoke execute on function public.spms_import_report(uuid) from public, anon;
grant execute on function public.spms_import_report(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tautkan pengguna lama ↔ akun Platform Inti (email sama, sudah anggota)
-- Mengisi spms_members (role, unit, petani) dan created_by di semua tabel.
-- ---------------------------------------------------------------------
create or replace function public.spms_link_legacy_users(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u record; e record; n_link int := 0; n_rows bigint := 0; c bigint; skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and coalesce(public.spms_role(p_org), '') <> 'super_admin' then raise exception 'Hanya super_admin'; end if;
  for u in
    select l.*, au.id as auth_id from spms_legacy_users l
      left join auth.users au on lower(au.email) = l.email
     where l.org_id = p_org and l.email is not null
  loop
    if u.auth_id is null or not exists (select 1 from memberships m where m.org_id = p_org and m.user_id = u.auth_id) then
      skipped := skipped || to_jsonb(u.email || case when u.auth_id is null then ' (belum mendaftar)' else ' (belum jadi anggota organisasi)' end);
      continue;
    end if;
    insert into spms_members (org_id, user_id, role, unit_id, farmer_id, legacy_user_id, updated_at)
    values (p_org, u.auth_id, case when exists (select 1 from spms_roles where role = u.role) then u.role else 'viewer' end,
            u.unit_id, u.farmer_id, u.id, now())
    on conflict (org_id, user_id) do update set role = excluded.role, unit_id = excluded.unit_id, farmer_id = excluded.farmer_id,
      legacy_user_id = excluded.legacy_user_id, updated_at = now();
    update spms_legacy_users set linked_user = u.auth_id where org_id = p_org and id = u.id;
    perform set_config('spms.importing', '1', true);
    for e in select * from spms_entities loop
      execute format('update public.%I set created_by = $1 where org_id = $2 and legacy_created_by = $3 and created_by is distinct from $1', e.tbl)
        using u.auth_id, p_org, u.id;
      get diagnostics c = row_count; n_rows := n_rows + c;
    end loop;
    update spms_audit set user_id = u.auth_id where org_id = p_org and legacy_user_id = u.id and user_id is null;
    n_link := n_link + 1;
  end loop;
  return jsonb_build_object('ditautkan', n_link, 'baris_diperbarui', n_rows, 'belum_bisa', skipped,
    'tanpa_email', (select coalesce(jsonb_agg(username), '[]'::jsonb) from spms_legacy_users where org_id = p_org and email is null));
end $$;
revoke execute on function public.spms_link_legacy_users(uuid) from public, anon;
grant execute on function public.spms_link_legacy_users(uuid) to authenticated;

notify pgrst, 'reload schema';
