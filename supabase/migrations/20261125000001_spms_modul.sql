-- =====================================================================
-- SPMS (KebunRakyat) — MODUL untuk Platform Inti (Supabase)
-- File 1 dari 2 · dibuat otomatis dari 00_Config.gs SPMS v1.2.0
-- Isi:
--   spms_*            25 tabel data (satu per menu/entitas SPMS)
--   spms_roles        13 role SPMS + cakupan (semua / unit / milik sendiri)
--   spms_role_perms   matriks izin C/R/U/D/A per modul (sama dengan versi GAS)
--   spms_members      role SPMS per anggota Platform Inti (+ unit & petani)
--   spms_settings     pengaturan (judul, logo, tema, peta, AI) per organisasi
--   spms_audit        jejak audit
--   RLS               aturan keamanan per baris untuk semua tabel di atas
--   bucket "spms"     penyimpanan foto/video/PDF (privat, per organisasi)
-- Istilah: "organisasi" = klien Platform Inti (tenant).
--          "unit"       = Organisasi/Koperasi/Kelompok di dalam SPMS (kolom unit_id).
-- Aman dijalankan ulang (tidak menghapus data).
-- =====================================================================

do $$ begin
  if to_regclass('public.organizations') is null or to_regclass('public.memberships') is null
     or to_regclass('public.apps') is null
     or to_regprocedure('public.is_member(uuid)') is null
     or to_regprocedure('public.has_license(uuid,text)') is null then
    raise exception 'Platform Inti belum terpasang di proyek ini (tabel organizations/memberships/apps atau fungsi is_member/has_license tidak ditemukan). Jalankan dulu SQL Platform Inti.';
  end if;
end $$;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

insert into public.apps (code, name, description, category, status, icon, default_trial_days, sort)
values ('spms', 'KebunRakyat SPMS', 'Manajemen perkebunan rakyat: petani, kebun, bidang, pohon digital, survei GPS, operasional, panen, gudang, keuangan', 'Perkebunan', 'dev', '🌴', 30, 20)
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon;

-- ---------------------------------------------------------------------
-- ROLE & IZIN (salinan persis ROLES/permsFor_ di 00_Config.gs)
-- ---------------------------------------------------------------------
create table if not exists public.spms_roles (
  role   text primary key,
  label  text not null,
  scope  text not null check (scope in ('all', 'org', 'own'))
);
create table if not exists public.spms_role_perms (
  role    text not null references public.spms_roles(role) on delete cascade,
  module  text not null,
  perms   text not null default '',
  primary key (role, module)
);

insert into public.spms_roles (role, label, scope) values
  ('super_admin', 'Super Admin', 'all'),
  ('org_admin', 'Admin Organisasi', 'org'),
  ('coop_manager', 'Manajer Koperasi', 'org'),
  ('group_leader', 'Ketua Kelompok', 'org'),
  ('farmer', 'Petani', 'own'),
  ('surveyor', 'Petugas Survei', 'org'),
  ('enumerator', 'Enumerator', 'org'),
  ('agronomist', 'Agronomis', 'org'),
  ('extension', 'Penyuluh', 'org'),
  ('finance', 'Petugas Keuangan', 'org'),
  ('inventory', 'Petugas Gudang', 'org'),
  ('auditor', 'Auditor', 'org'),
  ('viewer', 'Pembaca Laporan', 'org')
on conflict (role) do update set label = excluded.label, scope = excluded.scope;
insert into public.spms_role_perms (role, module, perms) values
  ('super_admin', 'org', 'CRUDA'),
  ('super_admin', 'farmer', 'CRUDA'),
  ('super_admin', 'master', 'CRUDA'),
  ('super_admin', 'farm', 'CRUDA'),
  ('super_admin', 'parcel', 'CRUDA'),
  ('super_admin', 'survey', 'CRUDA'),
  ('super_admin', 'gis', 'CRUDA'),
  ('super_admin', 'tree', 'CRUDA'),
  ('super_admin', 'media', 'CRUDA'),
  ('super_admin', 'activity', 'CRUDA'),
  ('super_admin', 'fert', 'CRUDA'),
  ('super_admin', 'pest', 'CRUDA'),
  ('super_admin', 'harvest', 'CRUDA'),
  ('super_admin', 'inventory', 'CRUDA'),
  ('super_admin', 'finance', 'CRUDA'),
  ('super_admin', 'report', 'CRUDA'),
  ('super_admin', 'ai', 'CRUDA'),
  ('super_admin', 'audit', 'CRUDA'),
  ('super_admin', 'users', 'CRUDA'),
  ('super_admin', 'settings', 'CRUDA'),
  ('super_admin', 'notif', 'CRUDA'),
  ('super_admin', 'license', 'CRUDA'),
  ('org_admin', 'org', 'RU'),
  ('org_admin', 'farmer', 'CRUDA'),
  ('org_admin', 'master', 'CRUDA'),
  ('org_admin', 'farm', 'CRUDA'),
  ('org_admin', 'parcel', 'CRUDA'),
  ('org_admin', 'survey', 'CRUDA'),
  ('org_admin', 'gis', 'CRUDA'),
  ('org_admin', 'tree', 'CRUDA'),
  ('org_admin', 'media', 'CRUDA'),
  ('org_admin', 'activity', 'CRUDA'),
  ('org_admin', 'fert', 'CRUDA'),
  ('org_admin', 'pest', 'CRUDA'),
  ('org_admin', 'harvest', 'CRUDA'),
  ('org_admin', 'inventory', 'CRUDA'),
  ('org_admin', 'finance', 'CRUDA'),
  ('org_admin', 'report', 'CRUDA'),
  ('org_admin', 'ai', 'CRUDA'),
  ('org_admin', 'audit', 'R'),
  ('org_admin', 'users', 'CRUDA'),
  ('org_admin', 'settings', 'CRUDA'),
  ('org_admin', 'notif', 'CRUDA'),
  ('org_admin', 'license', 'R'),
  ('coop_manager', 'org', 'R'),
  ('coop_manager', 'farmer', 'CRUDA'),
  ('coop_manager', 'master', 'CRUDA'),
  ('coop_manager', 'farm', 'CRUDA'),
  ('coop_manager', 'parcel', 'CRUDA'),
  ('coop_manager', 'survey', 'CRUDA'),
  ('coop_manager', 'gis', 'CRUDA'),
  ('coop_manager', 'tree', 'CRUDA'),
  ('coop_manager', 'media', 'CRUDA'),
  ('coop_manager', 'activity', 'CRUDA'),
  ('coop_manager', 'fert', 'CRUDA'),
  ('coop_manager', 'pest', 'CRUDA'),
  ('coop_manager', 'harvest', 'CRUDA'),
  ('coop_manager', 'inventory', 'CRUDA'),
  ('coop_manager', 'finance', 'CRUDA'),
  ('coop_manager', 'report', 'CRUDA'),
  ('coop_manager', 'ai', 'CRUDA'),
  ('coop_manager', 'audit', 'R'),
  ('coop_manager', 'users', 'R'),
  ('coop_manager', 'settings', 'R'),
  ('coop_manager', 'notif', 'CRUDA'),
  ('coop_manager', 'license', ''),
  ('group_leader', 'org', 'R'),
  ('group_leader', 'farmer', 'RU'),
  ('group_leader', 'master', 'R'),
  ('group_leader', 'farm', 'RU'),
  ('group_leader', 'parcel', 'RUA'),
  ('group_leader', 'survey', 'RA'),
  ('group_leader', 'gis', 'R'),
  ('group_leader', 'tree', 'RU'),
  ('group_leader', 'media', 'R'),
  ('group_leader', 'activity', 'RA'),
  ('group_leader', 'fert', 'R'),
  ('group_leader', 'pest', 'R'),
  ('group_leader', 'harvest', 'R'),
  ('group_leader', 'inventory', 'R'),
  ('group_leader', 'finance', 'R'),
  ('group_leader', 'report', 'R'),
  ('group_leader', 'ai', 'R'),
  ('group_leader', 'notif', 'RU'),
  ('group_leader', 'license', ''),
  ('group_leader', 'users', ''),
  ('farmer', 'farmer', 'RU'),
  ('farmer', 'master', 'R'),
  ('farmer', 'farm', 'CRUD'),
  ('farmer', 'parcel', 'CRU'),
  ('farmer', 'survey', 'CR'),
  ('farmer', 'gis', 'R'),
  ('farmer', 'tree', 'CRUD'),
  ('farmer', 'media', 'CRUD'),
  ('farmer', 'activity', 'CRUD'),
  ('farmer', 'fert', 'CRUD'),
  ('farmer', 'pest', 'CR'),
  ('farmer', 'harvest', 'CRUD'),
  ('farmer', 'inventory', 'R'),
  ('farmer', 'finance', 'CR'),
  ('farmer', 'report', 'R'),
  ('farmer', 'ai', 'R'),
  ('farmer', 'notif', 'RU'),
  ('farmer', 'license', ''),
  ('farmer', 'users', ''),
  ('surveyor', 'farmer', 'R'),
  ('surveyor', 'master', 'R'),
  ('surveyor', 'farm', 'R'),
  ('surveyor', 'parcel', 'CRU'),
  ('surveyor', 'survey', 'CRUD'),
  ('surveyor', 'gis', 'CRUD'),
  ('surveyor', 'tree', 'CR'),
  ('surveyor', 'media', 'CRUD'),
  ('surveyor', 'report', 'R'),
  ('surveyor', 'notif', 'RU'),
  ('surveyor', 'license', ''),
  ('surveyor', 'users', ''),
  ('enumerator', 'farmer', 'CRU'),
  ('enumerator', 'master', 'R'),
  ('enumerator', 'farm', 'CRU'),
  ('enumerator', 'parcel', 'R'),
  ('enumerator', 'survey', 'CR'),
  ('enumerator', 'gis', 'R'),
  ('enumerator', 'tree', 'CRU'),
  ('enumerator', 'media', 'CRU'),
  ('enumerator', 'activity', 'CR'),
  ('enumerator', 'notif', 'RU'),
  ('enumerator', 'license', ''),
  ('enumerator', 'users', ''),
  ('agronomist', 'farmer', 'R'),
  ('agronomist', 'master', 'CRU'),
  ('agronomist', 'farm', 'R'),
  ('agronomist', 'parcel', 'R'),
  ('agronomist', 'survey', 'R'),
  ('agronomist', 'gis', 'R'),
  ('agronomist', 'tree', 'RU'),
  ('agronomist', 'media', 'CRU'),
  ('agronomist', 'activity', 'CRU'),
  ('agronomist', 'fert', 'CRU'),
  ('agronomist', 'pest', 'CRUD'),
  ('agronomist', 'harvest', 'R'),
  ('agronomist', 'inventory', 'R'),
  ('agronomist', 'report', 'R'),
  ('agronomist', 'ai', 'CRUA'),
  ('agronomist', 'notif', 'RU'),
  ('agronomist', 'license', ''),
  ('agronomist', 'users', ''),
  ('extension', 'farmer', 'R'),
  ('extension', 'master', 'R'),
  ('extension', 'farm', 'R'),
  ('extension', 'parcel', 'R'),
  ('extension', 'survey', 'R'),
  ('extension', 'gis', 'R'),
  ('extension', 'tree', 'R'),
  ('extension', 'media', 'CR'),
  ('extension', 'activity', 'CR'),
  ('extension', 'fert', 'R'),
  ('extension', 'pest', 'CR'),
  ('extension', 'harvest', 'R'),
  ('extension', 'report', 'R'),
  ('extension', 'ai', 'R'),
  ('extension', 'notif', 'RU'),
  ('extension', 'license', ''),
  ('extension', 'users', ''),
  ('finance', 'farmer', 'R'),
  ('finance', 'master', 'R'),
  ('finance', 'farm', 'R'),
  ('finance', 'parcel', 'R'),
  ('finance', 'harvest', 'R'),
  ('finance', 'inventory', 'R'),
  ('finance', 'finance', 'CRUDA'),
  ('finance', 'report', 'R'),
  ('finance', 'ai', 'R'),
  ('finance', 'notif', 'RU'),
  ('finance', 'license', ''),
  ('finance', 'users', ''),
  ('inventory', 'master', 'R'),
  ('inventory', 'inventory', 'CRUD'),
  ('inventory', 'fert', 'R'),
  ('inventory', 'report', 'R'),
  ('inventory', 'notif', 'RU'),
  ('inventory', 'license', ''),
  ('inventory', 'users', ''),
  ('auditor', 'org', 'R'),
  ('auditor', 'farmer', 'R'),
  ('auditor', 'master', 'R'),
  ('auditor', 'farm', 'R'),
  ('auditor', 'parcel', 'R'),
  ('auditor', 'survey', 'R'),
  ('auditor', 'gis', 'R'),
  ('auditor', 'tree', 'R'),
  ('auditor', 'media', 'R'),
  ('auditor', 'activity', 'R'),
  ('auditor', 'fert', 'R'),
  ('auditor', 'pest', 'R'),
  ('auditor', 'harvest', 'R'),
  ('auditor', 'inventory', 'R'),
  ('auditor', 'finance', 'R'),
  ('auditor', 'report', 'R'),
  ('auditor', 'ai', 'R'),
  ('auditor', 'audit', 'R'),
  ('auditor', 'users', 'R'),
  ('auditor', 'settings', 'R'),
  ('auditor', 'notif', 'R'),
  ('auditor', 'license', ''),
  ('viewer', 'master', 'R'),
  ('viewer', 'farm', 'R'),
  ('viewer', 'parcel', 'R'),
  ('viewer', 'gis', 'R'),
  ('viewer', 'tree', 'R'),
  ('viewer', 'harvest', 'R'),
  ('viewer', 'report', 'R'),
  ('viewer', 'notif', 'RU'),
  ('viewer', 'license', ''),
  ('viewer', 'users', '')
on conflict (role, module) do update set perms = excluded.perms;

-- ---------------------------------------------------------------------
-- ANGGOTA: role SPMS per anggota Platform Inti.
-- Bila belum diatur, role diturunkan dari role Platform Inti:
--   owner/admin → super_admin · editor → enumerator · viewer → viewer
-- unit_id kosong = boleh semua unit; farmer_id wajib untuk role petani.
-- ---------------------------------------------------------------------
create table if not exists public.spms_members (
  org_id          uuid not null,
  user_id         uuid not null,
  role            text not null references public.spms_roles(role),
  unit_id         text,
  farmer_id       text,
  legacy_user_id  text,
  updated_at      timestamptz not null default now(),
  primary key (org_id, user_id),
  foreign key (org_id, user_id) references public.memberships(org_id, user_id) on delete cascade
);

create or replace function public.spms_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.role from spms_members s join memberships m on m.org_id = s.org_id and m.user_id = s.user_id
      where s.org_id = p_org and s.user_id = auth.uid()),
    (select case m.role when 'owner' then 'super_admin' when 'admin' then 'super_admin'
                        when 'editor' then 'enumerator' else 'viewer' end
       from memberships m where m.org_id = p_org and m.user_id = auth.uid()));
$$;
create or replace function public.spms_scope(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select scope from spms_roles where role = public.spms_role(p_org);
$$;
create or replace function public.spms_unit(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(unit_id, '') from spms_members where org_id = p_org and user_id = auth.uid();
$$;
create or replace function public.spms_farmer(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(farmer_id, '') from spms_members where org_id = p_org and user_id = auth.uid();
$$;
-- Izin: huruf C/R/U/D/A pada modul. Lisensi habis = baca-saja (R tetap boleh).
create or replace function public.spms_can(p_org uuid, p_module text, p_letter text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select position(p_letter in rp.perms) > 0 from spms_role_perms rp
                    where rp.role = public.spms_role(p_org) and rp.module = p_module), false)
     and (p_letter = 'R' or coalesce(public.has_license(p_org, 'spms'), false));
$$;
-- Unit: role cakupan "all" boleh semua unit; lainnya hanya unitnya (bila diatur)
create or replace function public.spms_unit_ok(p_org uuid, p_unit text, p_global boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.spms_scope(p_org)
    when 'all' then true
    when 'org' then public.spms_unit(p_org) is null or p_unit = public.spms_unit(p_org) or (p_global and p_unit is null)
    when 'own' then public.spms_unit(p_org) is null or p_unit = public.spms_unit(p_org) or (p_global and p_unit is null)
    else false end;
$$;

-- ---------------------------------------------------------------------
-- KONTEKS CEPAT untuk RLS: dihitung SEKALI per kueri lewat (select spms_ctx()),
-- lalu tiap baris cukup dicocokkan dengan jsonb (tanpa kueri tambahan).
-- {"<org_id>": {"r": role, "s": scope, "u": unit, "f": petani, "l": lisensi, "p": {modul: "CRUDA"}}}
-- ---------------------------------------------------------------------
create or replace function public.spms_ctx()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.org_id::text, jsonb_build_object(
           'r', x.role, 's', r.scope, 'u', x.unit, 'f', x.farmer,
           'l', coalesce(public.has_license(x.org_id, 'spms'), false),
           'p', (select coalesce(jsonb_object_agg(rp.module, rp.perms), '{}'::jsonb) from spms_role_perms rp where rp.role = x.role))), '{}'::jsonb)
  from (select m.org_id,
               coalesce(s.role, case m.role when 'owner' then 'super_admin' when 'admin' then 'super_admin'
                                            when 'editor' then 'enumerator' else 'viewer' end) as role,
               nullif(s.unit_id, '') as unit, nullif(s.farmer_id, '') as farmer
          from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
         where m.user_id = auth.uid()) x
  join spms_roles r on r.role = x.role;
$$;
-- cek izin + unit untuk satu baris (tanpa akses tabel → cepat)
create or replace function public.spms_chk(c jsonb, p_org uuid, p_unit text, p_module text, p_letter text, p_global boolean default false)
returns boolean language sql immutable as $$
  select case when c -> (p_org::text) is null then false else
    position(p_letter in coalesce(c -> (p_org::text) -> 'p' ->> p_module, '')) > 0
    and (p_letter = 'R' or coalesce((c -> (p_org::text) ->> 'l')::boolean, false))
    and (c -> (p_org::text) ->> 's' = 'all' or c -> (p_org::text) ->> 'u' is null
         or p_unit = c -> (p_org::text) ->> 'u' or (p_global and p_unit is null)) end;
$$;
create or replace function public.spms_c_own(c jsonb, p_org uuid) returns boolean language sql immutable as $$
  select c -> (p_org::text) ->> 's' = 'own';
$$;
create or replace function public.spms_c_farmer(c jsonb, p_org uuid) returns text language sql immutable as $$
  select c -> (p_org::text) ->> 'f';
$$;
grant execute on function public.spms_ctx() to authenticated;
grant execute on function public.spms_chk(jsonb, uuid, text, text, text, boolean), public.spms_c_own(jsonb, uuid), public.spms_c_farmer(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- TABEL DATA (kolom = field SPMS; '' di GAS menjadi NULL)
-- ---------------------------------------------------------------------
-- Organisasi (modul org, cakupan global)
create table if not exists public.spms_organisasi (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "code"            text,
  "name"            text,
  "type"            text,
  "region"          text,
  "address"         text,
  "leader"          text,
  "phone"           text,
  "status"          text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_organisasi add column if not exists "code" text;
alter table public.spms_organisasi add column if not exists "name" text;
alter table public.spms_organisasi add column if not exists "type" text;
alter table public.spms_organisasi add column if not exists "region" text;
alter table public.spms_organisasi add column if not exists "address" text;
alter table public.spms_organisasi add column if not exists "leader" text;
alter table public.spms_organisasi add column if not exists "phone" text;
alter table public.spms_organisasi add column if not exists "status" text;
create index if not exists spms_organisasi_org on public.spms_organisasi(org_id, unit_id) where not deleted;
create unique index if not exists spms_organisasi_code_uq on public.spms_organisasi(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;

-- Komoditas (modul master, cakupan global)
create table if not exists public.spms_komoditas (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "code"            text,
  "name"            text,
  "category"        text,
  "yield_unit"      text,
  "productive_age"  numeric,
  "replant_age"     numeric,
  "color"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_komoditas add column if not exists "code" text;
alter table public.spms_komoditas add column if not exists "name" text;
alter table public.spms_komoditas add column if not exists "category" text;
alter table public.spms_komoditas add column if not exists "yield_unit" text;
alter table public.spms_komoditas add column if not exists "productive_age" numeric;
alter table public.spms_komoditas add column if not exists "replant_age" numeric;
alter table public.spms_komoditas add column if not exists "color" text;
create index if not exists spms_komoditas_org on public.spms_komoditas(org_id, unit_id) where not deleted;
create unique index if not exists spms_komoditas_code_uq on public.spms_komoditas(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;

-- Varietas (modul master, cakupan global)
create table if not exists public.spms_varietas (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "commodity_id"    text,
  "code"            text,
  "name"            text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_varietas add column if not exists "commodity_id" text;
alter table public.spms_varietas add column if not exists "code" text;
alter table public.spms_varietas add column if not exists "name" text;
create index if not exists spms_varietas_org on public.spms_varietas(org_id, unit_id) where not deleted;
create index if not exists spms_varietas_commodity_id on public.spms_varietas("commodity_id");
create unique index if not exists spms_varietas_code_uq on public.spms_varietas(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;

-- Petani (modul farmer, cakupan org)
create table if not exists public.spms_petani (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "code"            text,
  "name"            text,
  "gender"          text,
  "birth_year"      numeric,
  "group_name"      text,
  "village"         text,
  "address"         text,
  "phone"           text,
  "family_count"    numeric,
  "photo"           text,
  "consent"         boolean,
  "status"          text,
  "notes"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_petani add column if not exists "code" text;
alter table public.spms_petani add column if not exists "name" text;
alter table public.spms_petani add column if not exists "gender" text;
alter table public.spms_petani add column if not exists "birth_year" numeric;
alter table public.spms_petani add column if not exists "group_name" text;
alter table public.spms_petani add column if not exists "village" text;
alter table public.spms_petani add column if not exists "address" text;
alter table public.spms_petani add column if not exists "phone" text;
alter table public.spms_petani add column if not exists "family_count" numeric;
alter table public.spms_petani add column if not exists "photo" text;
alter table public.spms_petani add column if not exists "consent" boolean;
alter table public.spms_petani add column if not exists "status" text;
alter table public.spms_petani add column if not exists "notes" text;
create index if not exists spms_petani_org on public.spms_petani(org_id, unit_id) where not deleted;
create unique index if not exists spms_petani_code_uq on public.spms_petani(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;

-- Kebun (modul farm, cakupan org)
create table if not exists public.spms_kebun (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "farmer_id"       text,
  "code"            text,
  "name"            text,
  "village"         text,
  "commodity_id"    text,
  "planting_year"   numeric,
  "status"          text,
  "notes"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_kebun add column if not exists "farmer_id" text;
alter table public.spms_kebun add column if not exists "code" text;
alter table public.spms_kebun add column if not exists "name" text;
alter table public.spms_kebun add column if not exists "village" text;
alter table public.spms_kebun add column if not exists "commodity_id" text;
alter table public.spms_kebun add column if not exists "planting_year" numeric;
alter table public.spms_kebun add column if not exists "status" text;
alter table public.spms_kebun add column if not exists "notes" text;
create index if not exists spms_kebun_org on public.spms_kebun(org_id, unit_id) where not deleted;
create index if not exists spms_kebun_farmer_id on public.spms_kebun("farmer_id");
create index if not exists spms_kebun_commodity_id on public.spms_kebun("commodity_id");
create unique index if not exists spms_kebun_code_uq on public.spms_kebun(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;

-- Bidang Lahan (modul parcel, cakupan org)
create table if not exists public.spms_bidang (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "farm_id"         text,
  "farmer_id"       text,
  "code"            text,
  "name"            text,
  "commodity_id"    text,
  "land_relation"   text,
  "area_m2"         numeric,
  "perimeter_m"     numeric,
  "method"          text,
  "accuracy_m"      numeric,
  "status"          text,
  "version"         numeric,
  "geom"            extensions.geometry(Geometry, 4326),
  "legal_note"      text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_bidang add column if not exists "farm_id" text;
alter table public.spms_bidang add column if not exists "farmer_id" text;
alter table public.spms_bidang add column if not exists "code" text;
alter table public.spms_bidang add column if not exists "name" text;
alter table public.spms_bidang add column if not exists "commodity_id" text;
alter table public.spms_bidang add column if not exists "land_relation" text;
alter table public.spms_bidang add column if not exists "area_m2" numeric;
alter table public.spms_bidang add column if not exists "perimeter_m" numeric;
alter table public.spms_bidang add column if not exists "method" text;
alter table public.spms_bidang add column if not exists "accuracy_m" numeric;
alter table public.spms_bidang add column if not exists "status" text;
alter table public.spms_bidang add column if not exists "version" numeric;
alter table public.spms_bidang add column if not exists "geom" extensions.geometry(Geometry, 4326);
alter table public.spms_bidang add column if not exists "legal_note" text;
create index if not exists spms_bidang_org on public.spms_bidang(org_id, unit_id) where not deleted;
create index if not exists spms_bidang_farm_id on public.spms_bidang("farm_id");
create index if not exists spms_bidang_farmer_id on public.spms_bidang("farmer_id");
create index if not exists spms_bidang_commodity_id on public.spms_bidang("commodity_id");
create unique index if not exists spms_bidang_code_uq on public.spms_bidang(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;
create index if not exists spms_bidang_geom on public.spms_bidang using gist (geom);

-- Sesi Survei (modul survey, cakupan org)
create table if not exists public.spms_survei (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "method"          text,
  "crs"             text,
  "device"          text,
  "receiver"        text,
  "correction"      text,
  "started_at"      text,
  "ended_at"        text,
  "n_points"        numeric,
  "accuracy_m"      numeric,
  "area_m2"         numeric,
  "perimeter_m"     numeric,
  "status"          text,
  "reviewer"        text,
  "review_note"     text,
  "geom"            extensions.geometry(Geometry, 4326),
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_survei add column if not exists "parcel_id" text;
alter table public.spms_survei add column if not exists "farmer_id" text;
alter table public.spms_survei add column if not exists "method" text;
alter table public.spms_survei add column if not exists "crs" text;
alter table public.spms_survei add column if not exists "device" text;
alter table public.spms_survei add column if not exists "receiver" text;
alter table public.spms_survei add column if not exists "correction" text;
alter table public.spms_survei add column if not exists "started_at" text;
alter table public.spms_survei add column if not exists "ended_at" text;
alter table public.spms_survei add column if not exists "n_points" numeric;
alter table public.spms_survei add column if not exists "accuracy_m" numeric;
alter table public.spms_survei add column if not exists "area_m2" numeric;
alter table public.spms_survei add column if not exists "perimeter_m" numeric;
alter table public.spms_survei add column if not exists "status" text;
alter table public.spms_survei add column if not exists "reviewer" text;
alter table public.spms_survei add column if not exists "review_note" text;
alter table public.spms_survei add column if not exists "geom" extensions.geometry(Geometry, 4326);
create index if not exists spms_survei_org on public.spms_survei(org_id, unit_id) where not deleted;
create index if not exists spms_survei_parcel_id on public.spms_survei("parcel_id");
create index if not exists spms_survei_farmer_id on public.spms_survei("farmer_id");
create index if not exists spms_survei_geom on public.spms_survei using gist (geom);

-- Titik Survei (modul survey, cakupan org)
create table if not exists public.spms_titik_survei (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "survey_id"       text,
  "no"              numeric,
  "lat"             numeric,
  "lng"             numeric,
  "acc"             numeric,
  "alt"             numeric,
  "ts"              text,
  "kind"            text,
  "note"            text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  pt                extensions.geometry(Point, 4326) generated always as (case when lat is not null and lng is not null then extensions.st_setsrid(extensions.st_makepoint(lng::float8, lat::float8), 4326) end) stored
);
alter table public.spms_titik_survei add column if not exists "survey_id" text;
alter table public.spms_titik_survei add column if not exists "no" numeric;
alter table public.spms_titik_survei add column if not exists "lat" numeric;
alter table public.spms_titik_survei add column if not exists "lng" numeric;
alter table public.spms_titik_survei add column if not exists "acc" numeric;
alter table public.spms_titik_survei add column if not exists "alt" numeric;
alter table public.spms_titik_survei add column if not exists "ts" text;
alter table public.spms_titik_survei add column if not exists "kind" text;
alter table public.spms_titik_survei add column if not exists "note" text;
create index if not exists spms_titik_survei_org on public.spms_titik_survei(org_id, unit_id) where not deleted;
create index if not exists spms_titik_survei_survey_id on public.spms_titik_survei("survey_id");
create index if not exists spms_titik_survei_pt on public.spms_titik_survei using gist (pt);

-- Riwayat Geometri (modul parcel, cakupan org)
create table if not exists public.spms_bidang_versi (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "version"         numeric,
  "geom"            extensions.geometry(Geometry, 4326),
  "area_m2"         numeric,
  "survey_id"       text,
  "reason"          text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_bidang_versi add column if not exists "parcel_id" text;
alter table public.spms_bidang_versi add column if not exists "version" numeric;
alter table public.spms_bidang_versi add column if not exists "geom" extensions.geometry(Geometry, 4326);
alter table public.spms_bidang_versi add column if not exists "area_m2" numeric;
alter table public.spms_bidang_versi add column if not exists "survey_id" text;
alter table public.spms_bidang_versi add column if not exists "reason" text;
create index if not exists spms_bidang_versi_org on public.spms_bidang_versi(org_id, unit_id) where not deleted;
create index if not exists spms_bidang_versi_parcel_id on public.spms_bidang_versi("parcel_id");
create index if not exists spms_bidang_versi_survey_id on public.spms_bidang_versi("survey_id");
create index if not exists spms_bidang_versi_geom on public.spms_bidang_versi using gist (geom);

-- Relasi Penguasaan (modul parcel, cakupan org)
create table if not exists public.spms_hak_lahan (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "relation"        text,
  "valid_from"      date,
  "valid_to"        date,
  "doc_ref"         text,
  "note"            text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_hak_lahan add column if not exists "parcel_id" text;
alter table public.spms_hak_lahan add column if not exists "farmer_id" text;
alter table public.spms_hak_lahan add column if not exists "relation" text;
alter table public.spms_hak_lahan add column if not exists "valid_from" date;
alter table public.spms_hak_lahan add column if not exists "valid_to" date;
alter table public.spms_hak_lahan add column if not exists "doc_ref" text;
alter table public.spms_hak_lahan add column if not exists "note" text;
create index if not exists spms_hak_lahan_org on public.spms_hak_lahan(org_id, unit_id) where not deleted;
create index if not exists spms_hak_lahan_parcel_id on public.spms_hak_lahan("parcel_id");
create index if not exists spms_hak_lahan_farmer_id on public.spms_hak_lahan("farmer_id");

-- Data Pohon (modul tree, cakupan org)
create table if not exists public.spms_pohon (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "code"            text,
  "commodity_id"    text,
  "variety_id"      text,
  "lat"             numeric,
  "lng"             numeric,
  "row_no"          numeric,
  "tree_no"         numeric,
  "planting_date"   date,
  "status"          text,
  "health"          text,
  "productivity"    text,
  "replaced_by"     text,
  "notes"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  pt                extensions.geometry(Point, 4326) generated always as (case when lat is not null and lng is not null then extensions.st_setsrid(extensions.st_makepoint(lng::float8, lat::float8), 4326) end) stored
);
alter table public.spms_pohon add column if not exists "parcel_id" text;
alter table public.spms_pohon add column if not exists "farmer_id" text;
alter table public.spms_pohon add column if not exists "code" text;
alter table public.spms_pohon add column if not exists "commodity_id" text;
alter table public.spms_pohon add column if not exists "variety_id" text;
alter table public.spms_pohon add column if not exists "lat" numeric;
alter table public.spms_pohon add column if not exists "lng" numeric;
alter table public.spms_pohon add column if not exists "row_no" numeric;
alter table public.spms_pohon add column if not exists "tree_no" numeric;
alter table public.spms_pohon add column if not exists "planting_date" date;
alter table public.spms_pohon add column if not exists "status" text;
alter table public.spms_pohon add column if not exists "health" text;
alter table public.spms_pohon add column if not exists "productivity" text;
alter table public.spms_pohon add column if not exists "replaced_by" text;
alter table public.spms_pohon add column if not exists "notes" text;
create index if not exists spms_pohon_org on public.spms_pohon(org_id, unit_id) where not deleted;
create index if not exists spms_pohon_parcel_id on public.spms_pohon("parcel_id");
create index if not exists spms_pohon_farmer_id on public.spms_pohon("farmer_id");
create index if not exists spms_pohon_commodity_id on public.spms_pohon("commodity_id");
create index if not exists spms_pohon_variety_id on public.spms_pohon("variety_id");
create unique index if not exists spms_pohon_code_uq on public.spms_pohon(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;
create index if not exists spms_pohon_pt on public.spms_pohon using gist (pt);

-- Riwayat Pohon (modul tree, cakupan org)
create table if not exists public.spms_event_pohon (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "tree_id"         text,
  "type"            text,
  "date"            date,
  "description"     text,
  "health"          text,
  "height_m"        numeric,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_event_pohon add column if not exists "tree_id" text;
alter table public.spms_event_pohon add column if not exists "type" text;
alter table public.spms_event_pohon add column if not exists "date" date;
alter table public.spms_event_pohon add column if not exists "description" text;
alter table public.spms_event_pohon add column if not exists "health" text;
alter table public.spms_event_pohon add column if not exists "height_m" numeric;
create index if not exists spms_event_pohon_org on public.spms_event_pohon(org_id, unit_id) where not deleted;
create index if not exists spms_event_pohon_tree_id on public.spms_event_pohon("tree_id");

-- Pembeli (modul harvest, cakupan org)
create table if not exists public.spms_pembeli (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "name"            text,
  "kind"            text,
  "contact"         text,
  "address"         text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_pembeli add column if not exists "name" text;
alter table public.spms_pembeli add column if not exists "kind" text;
alter table public.spms_pembeli add column if not exists "contact" text;
alter table public.spms_pembeli add column if not exists "address" text;
create index if not exists spms_pembeli_org on public.spms_pembeli(org_id, unit_id) where not deleted;

-- Barang Inventori (modul inventory, cakupan org)
create table if not exists public.spms_inventori (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "sku"             text,
  "name"            text,
  "category"        text,
  "unit"            text,
  "n"               numeric,
  "p"               numeric,
  "k"               numeric,
  "mg"              numeric,
  "min_stock"       numeric,
  "price"           numeric,
  "warehouse"       text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_inventori add column if not exists "sku" text;
alter table public.spms_inventori add column if not exists "name" text;
alter table public.spms_inventori add column if not exists "category" text;
alter table public.spms_inventori add column if not exists "unit" text;
alter table public.spms_inventori add column if not exists "n" numeric;
alter table public.spms_inventori add column if not exists "p" numeric;
alter table public.spms_inventori add column if not exists "k" numeric;
alter table public.spms_inventori add column if not exists "mg" numeric;
alter table public.spms_inventori add column if not exists "min_stock" numeric;
alter table public.spms_inventori add column if not exists "price" numeric;
alter table public.spms_inventori add column if not exists "warehouse" text;
create index if not exists spms_inventori_org on public.spms_inventori(org_id, unit_id) where not deleted;

-- Mutasi Stok (modul inventory, cakupan org)
create table if not exists public.spms_mutasi_stok (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "item_id"         text,
  "date"            date,
  "kind"            text,
  "qty"             numeric,
  "unit_cost"       numeric,
  "ref"             text,
  "note"            text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_mutasi_stok add column if not exists "item_id" text;
alter table public.spms_mutasi_stok add column if not exists "date" date;
alter table public.spms_mutasi_stok add column if not exists "kind" text;
alter table public.spms_mutasi_stok add column if not exists "qty" numeric;
alter table public.spms_mutasi_stok add column if not exists "unit_cost" numeric;
alter table public.spms_mutasi_stok add column if not exists "ref" text;
alter table public.spms_mutasi_stok add column if not exists "note" text;
create index if not exists spms_mutasi_stok_org on public.spms_mutasi_stok(org_id, unit_id) where not deleted;
create index if not exists spms_mutasi_stok_item_id on public.spms_mutasi_stok("item_id");

-- Aktivitas Kebun (modul activity, cakupan org)
create table if not exists public.spms_aktivitas (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "type"            text,
  "date"            date,
  "tree_ids"        text,
  "worker"          text,
  "status"          text,
  "cost"            numeric,
  "notes"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_aktivitas add column if not exists "parcel_id" text;
alter table public.spms_aktivitas add column if not exists "farmer_id" text;
alter table public.spms_aktivitas add column if not exists "type" text;
alter table public.spms_aktivitas add column if not exists "date" date;
alter table public.spms_aktivitas add column if not exists "tree_ids" text;
alter table public.spms_aktivitas add column if not exists "worker" text;
alter table public.spms_aktivitas add column if not exists "status" text;
alter table public.spms_aktivitas add column if not exists "cost" numeric;
alter table public.spms_aktivitas add column if not exists "notes" text;
create index if not exists spms_aktivitas_org on public.spms_aktivitas(org_id, unit_id) where not deleted;
create index if not exists spms_aktivitas_parcel_id on public.spms_aktivitas("parcel_id");
create index if not exists spms_aktivitas_farmer_id on public.spms_aktivitas("farmer_id");

-- Pemupukan (modul fert, cakupan org)
create table if not exists public.spms_pemupukan (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "tree_id"         text,
  "date"            date,
  "item_id"         text,
  "dosage"          numeric,
  "unit"            text,
  "tree_count"      numeric,
  "qty_total"       numeric,
  "cost"            numeric,
  "method"          text,
  "notes"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_pemupukan add column if not exists "parcel_id" text;
alter table public.spms_pemupukan add column if not exists "farmer_id" text;
alter table public.spms_pemupukan add column if not exists "tree_id" text;
alter table public.spms_pemupukan add column if not exists "date" date;
alter table public.spms_pemupukan add column if not exists "item_id" text;
alter table public.spms_pemupukan add column if not exists "dosage" numeric;
alter table public.spms_pemupukan add column if not exists "unit" text;
alter table public.spms_pemupukan add column if not exists "tree_count" numeric;
alter table public.spms_pemupukan add column if not exists "qty_total" numeric;
alter table public.spms_pemupukan add column if not exists "cost" numeric;
alter table public.spms_pemupukan add column if not exists "method" text;
alter table public.spms_pemupukan add column if not exists "notes" text;
create index if not exists spms_pemupukan_org on public.spms_pemupukan(org_id, unit_id) where not deleted;
create index if not exists spms_pemupukan_parcel_id on public.spms_pemupukan("parcel_id");
create index if not exists spms_pemupukan_farmer_id on public.spms_pemupukan("farmer_id");
create index if not exists spms_pemupukan_item_id on public.spms_pemupukan("item_id");

-- Hama & Penyakit (modul pest, cakupan org)
create table if not exists public.spms_hama_penyakit (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "tree_id"         text,
  "date"            date,
  "kind"            text,
  "name"            text,
  "severity"        text,
  "symptoms"        text,
  "treatment"       text,
  "status"          text,
  "lat"             numeric,
  "lng"             numeric,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  pt                extensions.geometry(Point, 4326) generated always as (case when lat is not null and lng is not null then extensions.st_setsrid(extensions.st_makepoint(lng::float8, lat::float8), 4326) end) stored
);
alter table public.spms_hama_penyakit add column if not exists "parcel_id" text;
alter table public.spms_hama_penyakit add column if not exists "farmer_id" text;
alter table public.spms_hama_penyakit add column if not exists "tree_id" text;
alter table public.spms_hama_penyakit add column if not exists "date" date;
alter table public.spms_hama_penyakit add column if not exists "kind" text;
alter table public.spms_hama_penyakit add column if not exists "name" text;
alter table public.spms_hama_penyakit add column if not exists "severity" text;
alter table public.spms_hama_penyakit add column if not exists "symptoms" text;
alter table public.spms_hama_penyakit add column if not exists "treatment" text;
alter table public.spms_hama_penyakit add column if not exists "status" text;
alter table public.spms_hama_penyakit add column if not exists "lat" numeric;
alter table public.spms_hama_penyakit add column if not exists "lng" numeric;
create index if not exists spms_hama_penyakit_org on public.spms_hama_penyakit(org_id, unit_id) where not deleted;
create index if not exists spms_hama_penyakit_parcel_id on public.spms_hama_penyakit("parcel_id");
create index if not exists spms_hama_penyakit_farmer_id on public.spms_hama_penyakit("farmer_id");
create index if not exists spms_hama_penyakit_pt on public.spms_hama_penyakit using gist (pt);

-- Panen (modul harvest, cakupan org)
create table if not exists public.spms_panen (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "parcel_id"       text,
  "farmer_id"       text,
  "tree_id"         text,
  "commodity_id"    text,
  "date"            date,
  "qty"             numeric,
  "unit"            text,
  "tree_count"      numeric,
  "grade"           text,
  "price"           numeric,
  "buyer_id"        text,
  "revenue"         numeric,
  "transport_cost"  numeric,
  "notes"           text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_panen add column if not exists "parcel_id" text;
alter table public.spms_panen add column if not exists "farmer_id" text;
alter table public.spms_panen add column if not exists "tree_id" text;
alter table public.spms_panen add column if not exists "commodity_id" text;
alter table public.spms_panen add column if not exists "date" date;
alter table public.spms_panen add column if not exists "qty" numeric;
alter table public.spms_panen add column if not exists "unit" text;
alter table public.spms_panen add column if not exists "tree_count" numeric;
alter table public.spms_panen add column if not exists "grade" text;
alter table public.spms_panen add column if not exists "price" numeric;
alter table public.spms_panen add column if not exists "buyer_id" text;
alter table public.spms_panen add column if not exists "revenue" numeric;
alter table public.spms_panen add column if not exists "transport_cost" numeric;
alter table public.spms_panen add column if not exists "notes" text;
create index if not exists spms_panen_org on public.spms_panen(org_id, unit_id) where not deleted;
create index if not exists spms_panen_parcel_id on public.spms_panen("parcel_id");
create index if not exists spms_panen_farmer_id on public.spms_panen("farmer_id");
create index if not exists spms_panen_commodity_id on public.spms_panen("commodity_id");
create index if not exists spms_panen_buyer_id on public.spms_panen("buyer_id");

-- Akun (COA) (modul finance, cakupan org)
create table if not exists public.spms_akun (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "code"            text,
  "name"            text,
  "type"            text,
  "is_cash"         boolean,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_akun add column if not exists "code" text;
alter table public.spms_akun add column if not exists "name" text;
alter table public.spms_akun add column if not exists "type" text;
alter table public.spms_akun add column if not exists "is_cash" boolean;
create index if not exists spms_akun_org on public.spms_akun(org_id, unit_id) where not deleted;
create unique index if not exists spms_akun_code_uq on public.spms_akun(org_id, coalesce(unit_id, ''), lower(code)) where not deleted and code is not null;

-- Jurnal (modul finance, cakupan org)
create table if not exists public.spms_jurnal (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "date"            date,
  "ref"             text,
  "description"     text,
  "parcel_id"       text,
  "farmer_id"       text,
  "total"           numeric,
  "status"          text,
  "reversal_of"     text,
  "source"          text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_jurnal add column if not exists "date" date;
alter table public.spms_jurnal add column if not exists "ref" text;
alter table public.spms_jurnal add column if not exists "description" text;
alter table public.spms_jurnal add column if not exists "parcel_id" text;
alter table public.spms_jurnal add column if not exists "farmer_id" text;
alter table public.spms_jurnal add column if not exists "total" numeric;
alter table public.spms_jurnal add column if not exists "status" text;
alter table public.spms_jurnal add column if not exists "reversal_of" text;
alter table public.spms_jurnal add column if not exists "source" text;
create index if not exists spms_jurnal_org on public.spms_jurnal(org_id, unit_id) where not deleted;
create index if not exists spms_jurnal_parcel_id on public.spms_jurnal("parcel_id");
create index if not exists spms_jurnal_farmer_id on public.spms_jurnal("farmer_id");

-- Baris Jurnal (modul finance, cakupan org)
create table if not exists public.spms_jurnal_baris (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "journal_id"      text,
  "account_id"      text,
  "debit"           numeric,
  "credit"          numeric,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_jurnal_baris add column if not exists "journal_id" text;
alter table public.spms_jurnal_baris add column if not exists "account_id" text;
alter table public.spms_jurnal_baris add column if not exists "debit" numeric;
alter table public.spms_jurnal_baris add column if not exists "credit" numeric;
create index if not exists spms_jurnal_baris_org on public.spms_jurnal_baris(org_id, unit_id) where not deleted;
create index if not exists spms_jurnal_baris_journal_id on public.spms_jurnal_baris("journal_id");
create index if not exists spms_jurnal_baris_account_id on public.spms_jurnal_baris("account_id");

-- Rekomendasi AI (modul ai, cakupan org)
create table if not exists public.spms_rekomendasi (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "kind"            text,
  "entity"          text,
  "entity_id"       text,
  "content"         text,
  "confidence"      numeric,
  "status"          text,
  "reviewer"        text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_rekomendasi add column if not exists "kind" text;
alter table public.spms_rekomendasi add column if not exists "entity" text;
alter table public.spms_rekomendasi add column if not exists "entity_id" text;
alter table public.spms_rekomendasi add column if not exists "content" text;
alter table public.spms_rekomendasi add column if not exists "confidence" numeric;
alter table public.spms_rekomendasi add column if not exists "status" text;
alter table public.spms_rekomendasi add column if not exists "reviewer" text;
create index if not exists spms_rekomendasi_org on public.spms_rekomendasi(org_id, unit_id) where not deleted;

-- Notifikasi (modul notif, cakupan org)
create table if not exists public.spms_notifikasi (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "user_id"         text,
  "title"           text,
  "body"            text,
  "status"          text,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);
alter table public.spms_notifikasi add column if not exists "user_id" text;
alter table public.spms_notifikasi add column if not exists "title" text;
alter table public.spms_notifikasi add column if not exists "body" text;
alter table public.spms_notifikasi add column if not exists "status" text;
create index if not exists spms_notifikasi_org on public.spms_notifikasi(org_id, unit_id) where not deleted;

-- Dokumentasi (modul media, cakupan org)
create table if not exists public.spms_media (
  id                text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  unit_id           text,
  "entity"          text,
  "entity_id"       text,
  "category"        text,
  "description"     text,
  "file_id"         text,
  "mime"            text,
  "size"            numeric,
  "thumb"           text,
  "lat"             numeric,
  "lng"             numeric,
  "captured_at"     text,
  "checksum"        text,
  "version"         numeric,
  created_by        uuid,
  legacy_created_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  pt                extensions.geometry(Point, 4326) generated always as (case when lat is not null and lng is not null then extensions.st_setsrid(extensions.st_makepoint(lng::float8, lat::float8), 4326) end) stored
);
alter table public.spms_media add column if not exists "entity" text;
alter table public.spms_media add column if not exists "entity_id" text;
alter table public.spms_media add column if not exists "category" text;
alter table public.spms_media add column if not exists "description" text;
alter table public.spms_media add column if not exists "file_id" text;
alter table public.spms_media add column if not exists "mime" text;
alter table public.spms_media add column if not exists "size" numeric;
alter table public.spms_media add column if not exists "thumb" text;
alter table public.spms_media add column if not exists "lat" numeric;
alter table public.spms_media add column if not exists "lng" numeric;
alter table public.spms_media add column if not exists "captured_at" text;
alter table public.spms_media add column if not exists "checksum" text;
alter table public.spms_media add column if not exists "version" numeric;
create index if not exists spms_media_org on public.spms_media(org_id, unit_id) where not deleted;
create index if not exists spms_media_pt on public.spms_media using gist (pt);
create index if not exists spms_media_entity on public.spms_media(entity, entity_id);

create table if not exists public.spms_settings (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  scope       text not null default 'global',      -- 'global' atau id unit
  key         text not null,                        -- brand, theme, map, ai, finance, org, ...
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (org_id, scope, key)
);
create table if not exists public.spms_audit (
  id              text primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  ts              timestamptz not null default now(),
  user_id         uuid,
  legacy_user_id  text,
  username        text,
  unit_id         text,
  action          text,
  entity          text,
  entity_id       text,
  detail          text
);
create index if not exists spms_audit_org on public.spms_audit(org_id, ts desc);

-- ---------------------------------------------------------------------
-- INFO INDUK: organisasi, unit & petani pemilik dari (entitas, id).
-- Dipakai aturan "milik sendiri" untuk Media/EventPohon/TitikSurvei, dll.
-- ---------------------------------------------------------------------
create or replace function public.spms_entity_info(p_ent text, p_id text, out org_id uuid, out unit_id text, out farmer_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  case p_ent
    when 'Organisasi' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_organisasi x where x.id = p_id;
    when 'Komoditas' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_komoditas x where x.id = p_id;
    when 'Varietas' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_varietas x where x.id = p_id;
    when 'Petani' then select x.org_id, x.unit_id, x.id into org_id, unit_id, farmer_id from spms_petani x where x.id = p_id;
    when 'Kebun' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_kebun x where x.id = p_id;
    when 'Bidang' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_bidang x where x.id = p_id;
    when 'Survei' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_survei x where x.id = p_id;
    when 'TitikSurvei' then select x.org_id, x.unit_id, (select v.farmer_id from spms_survei v where v.id = x.survey_id) into org_id, unit_id, farmer_id from spms_titik_survei x where x.id = p_id;
    when 'BidangVersi' then select x.org_id, x.unit_id, (select b.farmer_id from spms_bidang b where b.id = x.parcel_id) into org_id, unit_id, farmer_id from spms_bidang_versi x where x.id = p_id;
    when 'HakLahan' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_hak_lahan x where x.id = p_id;
    when 'Pohon' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_pohon x where x.id = p_id;
    when 'EventPohon' then select x.org_id, x.unit_id, (select p.farmer_id from spms_pohon p where p.id = x.tree_id) into org_id, unit_id, farmer_id from spms_event_pohon x where x.id = p_id;
    when 'Pembeli' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_pembeli x where x.id = p_id;
    when 'Inventori' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_inventori x where x.id = p_id;
    when 'MutasiStok' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_mutasi_stok x where x.id = p_id;
    when 'Aktivitas' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_aktivitas x where x.id = p_id;
    when 'Pemupukan' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_pemupukan x where x.id = p_id;
    when 'HamaPenyakit' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_hama_penyakit x where x.id = p_id;
    when 'Panen' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_panen x where x.id = p_id;
    when 'Akun' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_akun x where x.id = p_id;
    when 'Jurnal' then select x.org_id, x.unit_id, x.farmer_id into org_id, unit_id, farmer_id from spms_jurnal x where x.id = p_id;
    when 'JurnalBaris' then select x.org_id, x.unit_id, (select j.farmer_id from spms_jurnal j where j.id = x.journal_id) into org_id, unit_id, farmer_id from spms_jurnal_baris x where x.id = p_id;
    when 'Rekomendasi' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_rekomendasi x where x.id = p_id;
    when 'Notifikasi' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_notifikasi x where x.id = p_id;
    when 'Media' then select x.org_id, x.unit_id, null::text into org_id, unit_id, farmer_id from spms_media x where x.id = p_id;
    else null;
  end case;
end $$;
create or replace function public.spms_owner(p_ent text, p_id text)
returns text language sql stable security definer set search_path = public as $$
  select (public.spms_entity_info(p_ent, p_id)).farmer_id;
$$;

-- ---------------------------------------------------------------------
-- TRIGGER: cegah referensi lintas organisasi, isi unit/petani dari induk,
-- perbarui updated_at. (Saat impor, tanggal lama dipertahankan.)
-- ---------------------------------------------------------------------
create or replace function public.spms_organisasi_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  new.unit_id := null;
  return new;
end $$;
drop trigger if exists spms_organisasi_trg on public.spms_organisasi;
create trigger spms_organisasi_trg before insert or update on public.spms_organisasi for each row execute function public.spms_organisasi_trg();

create or replace function public.spms_komoditas_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_komoditas_trg on public.spms_komoditas;
create trigger spms_komoditas_trg before insert or update on public.spms_komoditas for each row execute function public.spms_komoditas_trg();

create or replace function public.spms_varietas_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."commodity_id" is not null then
    select org_id, unit_id into p from spms_komoditas where id = new."commodity_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi commodity_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_varietas_trg on public.spms_varietas;
create trigger spms_varietas_trg before insert or update on public.spms_varietas for each row execute function public.spms_varietas_trg();

create or replace function public.spms_petani_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_petani_trg on public.spms_petani;
create trigger spms_petani_trg before insert or update on public.spms_petani for each row execute function public.spms_petani_trg();

create or replace function public.spms_kebun_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."commodity_id" is not null then
    select org_id, unit_id into p from spms_komoditas where id = new."commodity_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi commodity_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_kebun_trg on public.spms_kebun;
create trigger spms_kebun_trg before insert or update on public.spms_kebun for each row execute function public.spms_kebun_trg();

create or replace function public.spms_bidang_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."farm_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_kebun where id = new."farm_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farm_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."commodity_id" is not null then
    select org_id, unit_id into p from spms_komoditas where id = new."commodity_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi commodity_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_bidang_trg on public.spms_bidang;
create trigger spms_bidang_trg before insert or update on public.spms_bidang for each row execute function public.spms_bidang_trg();

create or replace function public.spms_survei_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_survei_trg on public.spms_survei;
create trigger spms_survei_trg before insert or update on public.spms_survei for each row execute function public.spms_survei_trg();

create or replace function public.spms_titik_survei_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."survey_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_survei where id = new."survey_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi survey_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_titik_survei_trg on public.spms_titik_survei;
create trigger spms_titik_survei_trg before insert or update on public.spms_titik_survei for each row execute function public.spms_titik_survei_trg();

create or replace function public.spms_bidang_versi_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."survey_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_survei where id = new."survey_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi survey_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_bidang_versi_trg on public.spms_bidang_versi;
create trigger spms_bidang_versi_trg before insert or update on public.spms_bidang_versi for each row execute function public.spms_bidang_versi_trg();

create or replace function public.spms_hak_lahan_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_hak_lahan_trg on public.spms_hak_lahan;
create trigger spms_hak_lahan_trg before insert or update on public.spms_hak_lahan for each row execute function public.spms_hak_lahan_trg();

create or replace function public.spms_pohon_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."commodity_id" is not null then
    select org_id, unit_id into p from spms_komoditas where id = new."commodity_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi commodity_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  if new."variety_id" is not null then
    select org_id, unit_id into p from spms_varietas where id = new."variety_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi variety_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_pohon_trg on public.spms_pohon;
create trigger spms_pohon_trg before insert or update on public.spms_pohon for each row execute function public.spms_pohon_trg();

create or replace function public.spms_event_pohon_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."tree_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_pohon where id = new."tree_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi tree_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_event_pohon_trg on public.spms_event_pohon;
create trigger spms_event_pohon_trg before insert or update on public.spms_event_pohon for each row execute function public.spms_event_pohon_trg();

create or replace function public.spms_pembeli_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_pembeli_trg on public.spms_pembeli;
create trigger spms_pembeli_trg before insert or update on public.spms_pembeli for each row execute function public.spms_pembeli_trg();

create or replace function public.spms_inventori_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_inventori_trg on public.spms_inventori;
create trigger spms_inventori_trg before insert or update on public.spms_inventori for each row execute function public.spms_inventori_trg();

create or replace function public.spms_mutasi_stok_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."item_id" is not null then
    select org_id, unit_id into p from spms_inventori where id = new."item_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi item_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_mutasi_stok_trg on public.spms_mutasi_stok;
create trigger spms_mutasi_stok_trg before insert or update on public.spms_mutasi_stok for each row execute function public.spms_mutasi_stok_trg();

create or replace function public.spms_aktivitas_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_aktivitas_trg on public.spms_aktivitas;
create trigger spms_aktivitas_trg before insert or update on public.spms_aktivitas for each row execute function public.spms_aktivitas_trg();

create or replace function public.spms_pemupukan_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."item_id" is not null then
    select org_id, unit_id into p from spms_inventori where id = new."item_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi item_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_pemupukan_trg on public.spms_pemupukan;
create trigger spms_pemupukan_trg before insert or update on public.spms_pemupukan for each row execute function public.spms_pemupukan_trg();

create or replace function public.spms_hama_penyakit_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_hama_penyakit_trg on public.spms_hama_penyakit;
create trigger spms_hama_penyakit_trg before insert or update on public.spms_hama_penyakit for each row execute function public.spms_hama_penyakit_trg();

create or replace function public.spms_panen_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."commodity_id" is not null then
    select org_id, unit_id into p from spms_komoditas where id = new."commodity_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi commodity_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  if new."buyer_id" is not null then
    select org_id, unit_id into p from spms_pembeli where id = new."buyer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi buyer_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_panen_trg on public.spms_panen;
create trigger spms_panen_trg before insert or update on public.spms_panen for each row execute function public.spms_panen_trg();

create or replace function public.spms_akun_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_akun_trg on public.spms_akun;
create trigger spms_akun_trg before insert or update on public.spms_akun for each row execute function public.spms_akun_trg();

create or replace function public.spms_jurnal_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."parcel_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_bidang where id = new."parcel_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi parcel_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
      if new.farmer_id is null then new.farmer_id := p.farmer_id; end if;
    end if;
  end if;
  if new."farmer_id" is not null then
    select org_id, unit_id into p from spms_petani where id = new."farmer_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi farmer_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_jurnal_trg on public.spms_jurnal;
create trigger spms_jurnal_trg before insert or update on public.spms_jurnal for each row execute function public.spms_jurnal_trg();

create or replace function public.spms_jurnal_baris_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new."journal_id" is not null then
    select org_id, unit_id, farmer_id into p from spms_jurnal where id = new."journal_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi journal_id menunjuk data organisasi lain'; end if;
      if new.unit_id is null then new.unit_id := p.unit_id; end if;
    end if;
  end if;
  if new."account_id" is not null then
    select org_id, unit_id into p from spms_akun where id = new."account_id";
    if found then
      if p.org_id <> new.org_id then raise exception 'Referensi account_id menunjuk data organisasi lain'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_jurnal_baris_trg on public.spms_jurnal_baris;
create trigger spms_jurnal_baris_trg before insert or update on public.spms_jurnal_baris for each row execute function public.spms_jurnal_baris_trg();

create or replace function public.spms_rekomendasi_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_rekomendasi_trg on public.spms_rekomendasi;
create trigger spms_rekomendasi_trg before insert or update on public.spms_rekomendasi for each row execute function public.spms_rekomendasi_trg();

create or replace function public.spms_notifikasi_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_notifikasi_trg on public.spms_notifikasi;
create trigger spms_notifikasi_trg before insert or update on public.spms_notifikasi for each row execute function public.spms_notifikasi_trg();

create or replace function public.spms_media_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; i record;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'org_id tidak boleh diubah'; end if;
  if current_setting('spms.importing', true) is distinct from '1' then
    new.updated_at := now();
    if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  if new.entity is not null and new.entity_id is not null then
    select * into i from public.spms_entity_info(new.entity, new.entity_id);
    if i.org_id is not null and i.org_id <> new.org_id then raise exception 'Media menunjuk data organisasi lain'; end if;
    if new.unit_id is null then new.unit_id := i.unit_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists spms_media_trg on public.spms_media;
create trigger spms_media_trg before insert or update on public.spms_media for each row execute function public.spms_media_trg();

-- =====================================================================
-- KEAMANAN BARIS (RLS) — meniru scopeRows_/canTouch_ versi GAS
-- =====================================================================
alter table public.spms_organisasi enable row level security;
drop policy if exists spms_organisasi_sel on public.spms_organisasi;
drop policy if exists spms_organisasi_ins on public.spms_organisasi;
drop policy if exists spms_organisasi_upd on public.spms_organisasi;
drop policy if exists spms_organisasi_del on public.spms_organisasi;
create policy spms_organisasi_sel on public.spms_organisasi for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'R', true) and true);
create policy spms_organisasi_ins on public.spms_organisasi for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'C', true) and true);
create policy spms_organisasi_upd on public.spms_organisasi for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'U', true) or public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'D', true)) and true) with check ((public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'U', true) or public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'D', true)) and true);
create policy spms_organisasi_del on public.spms_organisasi for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, id, 'org', 'D', true) and true);
grant select, insert, update, delete on public.spms_organisasi to authenticated;
revoke all on public.spms_organisasi from anon;

alter table public.spms_komoditas enable row level security;
drop policy if exists spms_komoditas_sel on public.spms_komoditas;
drop policy if exists spms_komoditas_ins on public.spms_komoditas;
drop policy if exists spms_komoditas_upd on public.spms_komoditas;
drop policy if exists spms_komoditas_del on public.spms_komoditas;
create policy spms_komoditas_sel on public.spms_komoditas for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'R', true) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_komoditas_ins on public.spms_komoditas for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'C', true) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_komoditas_upd on public.spms_komoditas for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'U', true) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'D', true)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'U', true) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'D', true)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_komoditas_del on public.spms_komoditas for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'D', true) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_komoditas to authenticated;
revoke all on public.spms_komoditas from anon;

alter table public.spms_varietas enable row level security;
drop policy if exists spms_varietas_sel on public.spms_varietas;
drop policy if exists spms_varietas_ins on public.spms_varietas;
drop policy if exists spms_varietas_upd on public.spms_varietas;
drop policy if exists spms_varietas_del on public.spms_varietas;
create policy spms_varietas_sel on public.spms_varietas for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'R', true) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_varietas_ins on public.spms_varietas for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'C', true) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_varietas_upd on public.spms_varietas for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'U', true) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'D', true)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'U', true) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'D', true)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_varietas_del on public.spms_varietas for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'master', 'D', true) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_varietas to authenticated;
revoke all on public.spms_varietas from anon;

alter table public.spms_petani enable row level security;
drop policy if exists spms_petani_sel on public.spms_petani;
drop policy if exists spms_petani_ins on public.spms_petani;
drop policy if exists spms_petani_upd on public.spms_petani;
drop policy if exists spms_petani_del on public.spms_petani;
create policy spms_petani_sel on public.spms_petani for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_petani_ins on public.spms_petani for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_petani_upd on public.spms_petani for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_petani_del on public.spms_petani for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farmer', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_petani to authenticated;
revoke all on public.spms_petani from anon;

alter table public.spms_kebun enable row level security;
drop policy if exists spms_kebun_sel on public.spms_kebun;
drop policy if exists spms_kebun_ins on public.spms_kebun;
drop policy if exists spms_kebun_upd on public.spms_kebun;
drop policy if exists spms_kebun_del on public.spms_kebun;
create policy spms_kebun_sel on public.spms_kebun for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_kebun_ins on public.spms_kebun for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_kebun_upd on public.spms_kebun for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_kebun_del on public.spms_kebun for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'farm', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_kebun to authenticated;
revoke all on public.spms_kebun from anon;

alter table public.spms_bidang enable row level security;
drop policy if exists spms_bidang_sel on public.spms_bidang;
drop policy if exists spms_bidang_ins on public.spms_bidang;
drop policy if exists spms_bidang_upd on public.spms_bidang;
drop policy if exists spms_bidang_del on public.spms_bidang;
create policy spms_bidang_sel on public.spms_bidang for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_bidang_ins on public.spms_bidang for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_bidang_upd on public.spms_bidang for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_bidang_del on public.spms_bidang for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_bidang to authenticated;
revoke all on public.spms_bidang from anon;

alter table public.spms_survei enable row level security;
drop policy if exists spms_survei_sel on public.spms_survei;
drop policy if exists spms_survei_ins on public.spms_survei;
drop policy if exists spms_survei_upd on public.spms_survei;
drop policy if exists spms_survei_del on public.spms_survei;
create policy spms_survei_sel on public.spms_survei for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_survei_ins on public.spms_survei for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_survei_upd on public.spms_survei for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_survei_del on public.spms_survei for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_survei to authenticated;
revoke all on public.spms_survei from anon;

alter table public.spms_titik_survei enable row level security;
drop policy if exists spms_titik_survei_sel on public.spms_titik_survei;
drop policy if exists spms_titik_survei_ins on public.spms_titik_survei;
drop policy if exists spms_titik_survei_upd on public.spms_titik_survei;
drop policy if exists spms_titik_survei_del on public.spms_titik_survei;
create policy spms_titik_survei_sel on public.spms_titik_survei for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Survei', survey_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_titik_survei_ins on public.spms_titik_survei for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Survei', survey_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_titik_survei_upd on public.spms_titik_survei for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Survei', survey_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Survei', survey_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_titik_survei_del on public.spms_titik_survei for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'survey', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Survei', survey_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_titik_survei to authenticated;
revoke all on public.spms_titik_survei from anon;

alter table public.spms_bidang_versi enable row level security;
drop policy if exists spms_bidang_versi_sel on public.spms_bidang_versi;
drop policy if exists spms_bidang_versi_ins on public.spms_bidang_versi;
drop policy if exists spms_bidang_versi_upd on public.spms_bidang_versi;
drop policy if exists spms_bidang_versi_del on public.spms_bidang_versi;
create policy spms_bidang_versi_sel on public.spms_bidang_versi for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_bidang_versi_ins on public.spms_bidang_versi for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_bidang_versi_upd on public.spms_bidang_versi for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_bidang_versi_del on public.spms_bidang_versi for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_bidang_versi to authenticated;
revoke all on public.spms_bidang_versi from anon;

alter table public.spms_hak_lahan enable row level security;
drop policy if exists spms_hak_lahan_sel on public.spms_hak_lahan;
drop policy if exists spms_hak_lahan_ins on public.spms_hak_lahan;
drop policy if exists spms_hak_lahan_upd on public.spms_hak_lahan;
drop policy if exists spms_hak_lahan_del on public.spms_hak_lahan;
create policy spms_hak_lahan_sel on public.spms_hak_lahan for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) or public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
create policy spms_hak_lahan_ins on public.spms_hak_lahan for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) or public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
create policy spms_hak_lahan_upd on public.spms_hak_lahan for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) or public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) or public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
create policy spms_hak_lahan_del on public.spms_hak_lahan for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'parcel', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) or public.spms_owner('Bidang', parcel_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
grant select, insert, update, delete on public.spms_hak_lahan to authenticated;
revoke all on public.spms_hak_lahan from anon;

alter table public.spms_pohon enable row level security;
drop policy if exists spms_pohon_sel on public.spms_pohon;
drop policy if exists spms_pohon_ins on public.spms_pohon;
drop policy if exists spms_pohon_upd on public.spms_pohon;
drop policy if exists spms_pohon_del on public.spms_pohon;
create policy spms_pohon_sel on public.spms_pohon for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_pohon_ins on public.spms_pohon for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_pohon_upd on public.spms_pohon for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_pohon_del on public.spms_pohon for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_pohon to authenticated;
revoke all on public.spms_pohon from anon;

alter table public.spms_event_pohon enable row level security;
drop policy if exists spms_event_pohon_sel on public.spms_event_pohon;
drop policy if exists spms_event_pohon_ins on public.spms_event_pohon;
drop policy if exists spms_event_pohon_upd on public.spms_event_pohon;
drop policy if exists spms_event_pohon_del on public.spms_event_pohon;
create policy spms_event_pohon_sel on public.spms_event_pohon for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Pohon', tree_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_event_pohon_ins on public.spms_event_pohon for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Pohon', tree_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_event_pohon_upd on public.spms_event_pohon for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Pohon', tree_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Pohon', tree_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_event_pohon_del on public.spms_event_pohon for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'tree', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Pohon', tree_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_event_pohon to authenticated;
revoke all on public.spms_event_pohon from anon;

alter table public.spms_pembeli enable row level security;
drop policy if exists spms_pembeli_sel on public.spms_pembeli;
drop policy if exists spms_pembeli_ins on public.spms_pembeli;
drop policy if exists spms_pembeli_upd on public.spms_pembeli;
drop policy if exists spms_pembeli_del on public.spms_pembeli;
create policy spms_pembeli_sel on public.spms_pembeli for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_pembeli_ins on public.spms_pembeli for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_pembeli_upd on public.spms_pembeli for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_pembeli_del on public.spms_pembeli for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_pembeli to authenticated;
revoke all on public.spms_pembeli from anon;

alter table public.spms_inventori enable row level security;
drop policy if exists spms_inventori_sel on public.spms_inventori;
drop policy if exists spms_inventori_ins on public.spms_inventori;
drop policy if exists spms_inventori_upd on public.spms_inventori;
drop policy if exists spms_inventori_del on public.spms_inventori;
create policy spms_inventori_sel on public.spms_inventori for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_inventori_ins on public.spms_inventori for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_inventori_upd on public.spms_inventori for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_inventori_del on public.spms_inventori for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_inventori to authenticated;
revoke all on public.spms_inventori from anon;

alter table public.spms_mutasi_stok enable row level security;
drop policy if exists spms_mutasi_stok_sel on public.spms_mutasi_stok;
drop policy if exists spms_mutasi_stok_ins on public.spms_mutasi_stok;
drop policy if exists spms_mutasi_stok_upd on public.spms_mutasi_stok;
drop policy if exists spms_mutasi_stok_del on public.spms_mutasi_stok;
create policy spms_mutasi_stok_sel on public.spms_mutasi_stok for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_mutasi_stok_ins on public.spms_mutasi_stok for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_mutasi_stok_upd on public.spms_mutasi_stok for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_mutasi_stok_del on public.spms_mutasi_stok for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'inventory', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_mutasi_stok to authenticated;
revoke all on public.spms_mutasi_stok from anon;

alter table public.spms_aktivitas enable row level security;
drop policy if exists spms_aktivitas_sel on public.spms_aktivitas;
drop policy if exists spms_aktivitas_ins on public.spms_aktivitas;
drop policy if exists spms_aktivitas_upd on public.spms_aktivitas;
drop policy if exists spms_aktivitas_del on public.spms_aktivitas;
create policy spms_aktivitas_sel on public.spms_aktivitas for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_aktivitas_ins on public.spms_aktivitas for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_aktivitas_upd on public.spms_aktivitas for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_aktivitas_del on public.spms_aktivitas for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'activity', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_aktivitas to authenticated;
revoke all on public.spms_aktivitas from anon;

alter table public.spms_pemupukan enable row level security;
drop policy if exists spms_pemupukan_sel on public.spms_pemupukan;
drop policy if exists spms_pemupukan_ins on public.spms_pemupukan;
drop policy if exists spms_pemupukan_upd on public.spms_pemupukan;
drop policy if exists spms_pemupukan_del on public.spms_pemupukan;
create policy spms_pemupukan_sel on public.spms_pemupukan for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_pemupukan_ins on public.spms_pemupukan for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_pemupukan_upd on public.spms_pemupukan for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_pemupukan_del on public.spms_pemupukan for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'fert', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_pemupukan to authenticated;
revoke all on public.spms_pemupukan from anon;

alter table public.spms_hama_penyakit enable row level security;
drop policy if exists spms_hama_penyakit_sel on public.spms_hama_penyakit;
drop policy if exists spms_hama_penyakit_ins on public.spms_hama_penyakit;
drop policy if exists spms_hama_penyakit_upd on public.spms_hama_penyakit;
drop policy if exists spms_hama_penyakit_del on public.spms_hama_penyakit;
create policy spms_hama_penyakit_sel on public.spms_hama_penyakit for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_hama_penyakit_ins on public.spms_hama_penyakit for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_hama_penyakit_upd on public.spms_hama_penyakit for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_hama_penyakit_del on public.spms_hama_penyakit for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'pest', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_hama_penyakit to authenticated;
revoke all on public.spms_hama_penyakit from anon;

alter table public.spms_panen enable row level security;
drop policy if exists spms_panen_sel on public.spms_panen;
drop policy if exists spms_panen_ins on public.spms_panen;
drop policy if exists spms_panen_upd on public.spms_panen;
drop policy if exists spms_panen_del on public.spms_panen;
create policy spms_panen_sel on public.spms_panen for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_panen_ins on public.spms_panen for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_panen_upd on public.spms_panen for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_panen_del on public.spms_panen for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'harvest', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_panen to authenticated;
revoke all on public.spms_panen from anon;

alter table public.spms_akun enable row level security;
drop policy if exists spms_akun_sel on public.spms_akun;
drop policy if exists spms_akun_ins on public.spms_akun;
drop policy if exists spms_akun_upd on public.spms_akun;
drop policy if exists spms_akun_del on public.spms_akun;
create policy spms_akun_sel on public.spms_akun for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_akun_ins on public.spms_akun for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_akun_upd on public.spms_akun for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_akun_del on public.spms_akun for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_akun to authenticated;
revoke all on public.spms_akun from anon;

alter table public.spms_jurnal enable row level security;
drop policy if exists spms_jurnal_sel on public.spms_jurnal;
drop policy if exists spms_jurnal_ins on public.spms_jurnal;
drop policy if exists spms_jurnal_upd on public.spms_jurnal;
drop policy if exists spms_jurnal_del on public.spms_jurnal;
create policy spms_jurnal_sel on public.spms_jurnal for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_jurnal_ins on public.spms_jurnal for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_jurnal_upd on public.spms_jurnal for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_jurnal_del on public.spms_jurnal for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then farmer_id = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_jurnal to authenticated;
revoke all on public.spms_jurnal from anon;

alter table public.spms_jurnal_baris enable row level security;
drop policy if exists spms_jurnal_baris_sel on public.spms_jurnal_baris;
drop policy if exists spms_jurnal_baris_ins on public.spms_jurnal_baris;
drop policy if exists spms_jurnal_baris_upd on public.spms_jurnal_baris;
drop policy if exists spms_jurnal_baris_del on public.spms_jurnal_baris;
create policy spms_jurnal_baris_sel on public.spms_jurnal_baris for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Jurnal', journal_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_jurnal_baris_ins on public.spms_jurnal_baris for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Jurnal', journal_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_jurnal_baris_upd on public.spms_jurnal_baris for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Jurnal', journal_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Jurnal', journal_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
create policy spms_jurnal_baris_del on public.spms_jurnal_baris for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'finance', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then public.spms_owner('Jurnal', journal_id) = public.spms_c_farmer((select public.spms_ctx()), org_id) else true end));
grant select, insert, update, delete on public.spms_jurnal_baris to authenticated;
revoke all on public.spms_jurnal_baris from anon;

alter table public.spms_rekomendasi enable row level security;
drop policy if exists spms_rekomendasi_sel on public.spms_rekomendasi;
drop policy if exists spms_rekomendasi_ins on public.spms_rekomendasi;
drop policy if exists spms_rekomendasi_upd on public.spms_rekomendasi;
drop policy if exists spms_rekomendasi_del on public.spms_rekomendasi;
create policy spms_rekomendasi_sel on public.spms_rekomendasi for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_rekomendasi_ins on public.spms_rekomendasi for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_rekomendasi_upd on public.spms_rekomendasi for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
create policy spms_rekomendasi_del on public.spms_rekomendasi for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'ai', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then true else true end));
grant select, insert, update, delete on public.spms_rekomendasi to authenticated;
revoke all on public.spms_rekomendasi from anon;

alter table public.spms_notifikasi enable row level security;
drop policy if exists spms_notifikasi_sel on public.spms_notifikasi;
drop policy if exists spms_notifikasi_ins on public.spms_notifikasi;
drop policy if exists spms_notifikasi_upd on public.spms_notifikasi;
drop policy if exists spms_notifikasi_del on public.spms_notifikasi;
create policy spms_notifikasi_sel on public.spms_notifikasi for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (user_id is null or user_id = auth.uid()::text) else true end));
create policy spms_notifikasi_ins on public.spms_notifikasi for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (user_id is null or user_id = auth.uid()::text) else true end));
create policy spms_notifikasi_upd on public.spms_notifikasi for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (user_id is null or user_id = auth.uid()::text) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (user_id is null or user_id = auth.uid()::text) else true end));
create policy spms_notifikasi_del on public.spms_notifikasi for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'notif', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (user_id is null or user_id = auth.uid()::text) else true end));
grant select, insert, update, delete on public.spms_notifikasi to authenticated;
revoke all on public.spms_notifikasi from anon;

alter table public.spms_media enable row level security;
drop policy if exists spms_media_sel on public.spms_media;
drop policy if exists spms_media_ins on public.spms_media;
drop policy if exists spms_media_upd on public.spms_media;
drop policy if exists spms_media_del on public.spms_media;
create policy spms_media_sel on public.spms_media for select to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'R', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (created_by = auth.uid() or public.spms_owner(entity, entity_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
create policy spms_media_ins on public.spms_media for insert to authenticated with check (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'C', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (created_by = auth.uid() or public.spms_owner(entity, entity_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
create policy spms_media_upd on public.spms_media for update to authenticated using ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (created_by = auth.uid() or public.spms_owner(entity, entity_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end)) with check ((public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'U', false) or public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'D', false)) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (created_by = auth.uid() or public.spms_owner(entity, entity_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
create policy spms_media_del on public.spms_media for delete to authenticated using (public.spms_chk((select public.spms_ctx()), org_id, unit_id, 'media', 'D', false) and (case when public.spms_c_own((select public.spms_ctx()), org_id) then (created_by = auth.uid() or public.spms_owner(entity, entity_id) = public.spms_c_farmer((select public.spms_ctx()), org_id)) else true end));
grant select, insert, update, delete on public.spms_media to authenticated;
revoke all on public.spms_media from anon;

alter table public.spms_roles enable row level security;
alter table public.spms_role_perms enable row level security;
drop policy if exists spms_roles_sel on public.spms_roles;
create policy spms_roles_sel on public.spms_roles for select to authenticated using (true);
drop policy if exists spms_role_perms_sel on public.spms_role_perms;
create policy spms_role_perms_sel on public.spms_role_perms for select to authenticated using (true);
grant select on public.spms_roles, public.spms_role_perms to authenticated;

alter table public.spms_members enable row level security;
drop policy if exists spms_members_sel on public.spms_members;
create policy spms_members_sel on public.spms_members for select to authenticated using (public.is_member(org_id));
drop policy if exists spms_members_write on public.spms_members;
-- admin pengguna (super_admin / org_admin). org_admin tidak bisa membuat super_admin & hanya di unitnya.
create policy spms_members_write on public.spms_members for all to authenticated
  using (public.spms_can(org_id, 'users', 'U') and public.spms_unit_ok(org_id, unit_id, true))
  with check (public.spms_can(org_id, 'users', 'U') and public.spms_unit_ok(org_id, unit_id, true)
              and (role <> 'super_admin' or public.spms_role(org_id) = 'super_admin'));
grant select, insert, update, delete on public.spms_members to authenticated;

alter table public.spms_settings enable row level security;
drop policy if exists spms_settings_sel on public.spms_settings;
create policy spms_settings_sel on public.spms_settings for select to authenticated using (public.is_member(org_id));
drop policy if exists spms_settings_write on public.spms_settings;
create policy spms_settings_write on public.spms_settings for all to authenticated
  using (public.spms_can(org_id, 'settings', 'U')) with check (public.spms_can(org_id, 'settings', 'U'));
grant select, insert, update, delete on public.spms_settings to authenticated;

alter table public.spms_audit enable row level security;
drop policy if exists spms_audit_sel on public.spms_audit;
create policy spms_audit_sel on public.spms_audit for select to authenticated using (public.spms_can(org_id, 'audit', 'R'));
drop policy if exists spms_audit_ins on public.spms_audit;
create policy spms_audit_ins on public.spms_audit for insert to authenticated with check (public.is_member(org_id) and user_id = auth.uid());
grant select, insert on public.spms_audit to authenticated;
revoke all on public.spms_members, public.spms_settings, public.spms_audit, public.spms_roles, public.spms_role_perms from anon;

grant execute on function public.spms_role(uuid), public.spms_scope(uuid), public.spms_unit(uuid), public.spms_farmer(uuid),
  public.spms_can(uuid, text, text), public.spms_unit_ok(uuid, text, boolean), public.spms_owner(text, text) to authenticated;
revoke execute on function public.spms_entity_info(text, text) from public, anon;

create or replace function public.spms_storage_ok(p_name text, p_letter text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
              then public.spms_can(split_part(p_name, '/', 1)::uuid, 'media', p_letter) else false end;
$$;
grant execute on function public.spms_storage_ok(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- PENYIMPANAN FOTO/VIDEO/PDF: bucket privat "spms", jalur <org_id>/<...>
-- ---------------------------------------------------------------------
do $do$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Skema storage tidak ada — bucket spms dilewati.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('spms', 'spms', false, 52428800)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

  execute $p$drop policy if exists spms_obj_sel on storage.objects$p$;
  execute $p$drop policy if exists spms_obj_ins on storage.objects$p$;
  execute $p$drop policy if exists spms_obj_upd on storage.objects$p$;
  execute $p$drop policy if exists spms_obj_del on storage.objects$p$;
  execute $p$create policy spms_obj_sel on storage.objects for select to authenticated using (bucket_id = 'spms' and public.spms_storage_ok(name, 'R'))$p$;
  execute $p$create policy spms_obj_ins on storage.objects for insert to authenticated with check (bucket_id = 'spms' and public.spms_storage_ok(name, 'C'))$p$;
  execute $p$create policy spms_obj_upd on storage.objects for update to authenticated using (bucket_id = 'spms' and public.spms_storage_ok(name, 'U'))$p$;
  execute $p$create policy spms_obj_del on storage.objects for delete to authenticated using (bucket_id = 'spms' and public.spms_storage_ok(name, 'D'))$p$;
end $do$;

notify pgrst, 'reload schema';
