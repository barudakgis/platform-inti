-- =====================================================================
-- PLATFORM INTI — 001 CORE
-- Organisasi (tenant), profil, keanggotaan + role, registri aplikasi,
-- lisensi, dan audit log. Dipakai bersama oleh semua aplikasi.
-- Jalankan berurutan: 001 → 002 → 003 → 004 → 005
-- =====================================================================

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
-- (di Supabase hak ini sudah ada; baris ini untuk berjaga-jaga)
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- ORGANISASI = satu klien / perusahaan / kebun / masjid / RT, dst.
-- settings menampung judul aplikasi, logo, warna tema (bisa diedit admin)
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 2 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PROFIL — otomatis dibuat saat user mendaftar (lihat trigger di bawah)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ROLE & KEANGGOTAAN
-- owner  : pemilik organisasi (bisa semuanya)
-- admin  : kelola anggota & pengaturan
-- editor : tambah / ubah data
-- viewer : hanya melihat
-- ---------------------------------------------------------------------
do $$ begin
  create type public.org_role as enum ('owner', 'admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.org_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- ---------------------------------------------------------------------
-- REGISTRI APLIKASI (pengganti "Beranda Aplikasi / MY APP CENTER")
-- ---------------------------------------------------------------------
create table if not exists public.apps (
  code                text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  name                text not null,
  description         text,
  category            text,
  status              text not null default 'aktif' check (status in ('aktif', 'dev', 'arsip')),
  url                 text,
  icon                text,
  default_trial_days  int  not null default 30 check (default_trial_days >= 0),
  sort                int  not null default 100
);

-- ---------------------------------------------------------------------
-- LISENSI — organisasi mana boleh memakai aplikasi apa, sampai kapan.
-- Hanya pemilik platform (Anda) yang mengubah tabel ini, lewat
-- SQL Editor / service key. User biasa hanya bisa membaca.
-- ---------------------------------------------------------------------
create table if not exists public.licenses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  app_code     text not null references public.apps(code) on update cascade,
  plan         text not null default 'trial' check (plan in ('trial', 'basic', 'pro', 'enterprise')),
  max_users    int,
  valid_until  date,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (org_id, app_code)
);

-- ---------------------------------------------------------------------
-- AUDIT LOG — siapa mengubah apa, kapan (diisi otomatis oleh trigger)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  user_id     uuid,
  table_name  text not null,
  action      text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_org_idx on public.audit_log(org_id, created_at desc);

-- =====================================================================
-- FUNGSI BANTU (dipakai oleh RLS policy di semua modul)
-- =====================================================================
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.has_role(p_org uuid, p_roles public.org_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where org_id = p_org and user_id = auth.uid() and role = any(p_roles));
$$;

-- editor ke atas (owner, admin, editor)
create or replace function public.can_edit(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_org, array['owner','admin','editor']::public.org_role[]);
$$;

-- admin ke atas (owner, admin)
create or replace function public.is_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_org, array['owner','admin']::public.org_role[]);
$$;

create or replace function public.has_license(p_org uuid, p_app text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from licenses
                 where org_id = p_org and app_code = p_app and active
                   and (valid_until is null or valid_until >= current_date));
$$;

-- updated_at otomatis
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists organizations_updated on public.organizations;
create trigger organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();
drop trigger if exists profiles_updated on public.profiles;
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Audit trigger generik: pasang ke tabel mana saja yang punya kolom org_id
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  insert into audit_log(org_id, user_id, table_name, action, record_id, old_data, new_data)
  values (
    nullif(v_row->>'org_id','')::uuid,
    auth.uid(),
    tg_table_name,
    lower(tg_op),
    coalesce(v_row->>'id', v_row->>'user_id'),
    -- kolom geometri dibuang agar log tidak membengkak
    v_old - 'geom',
    v_new - 'geom'
  );
  return coalesce(new, old);
end $$;

-- Profil otomatis untuk user baru
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RPC (dipanggil dari aplikasi lewat supabase.rpc(...))
-- =====================================================================

-- Buat organisasi baru. Pemanggil otomatis jadi owner dan mendapat
-- lisensi trial untuk semua aplikasi berstatus 'aktif'.
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  insert into organizations(name, slug, settings)
  values (p_name, lower(p_slug), jsonb_build_object('app_title', p_name))
  returning id into v_org;

  insert into memberships(org_id, user_id, role) values (v_org, auth.uid(), 'owner');

  insert into licenses(org_id, app_code, plan, valid_until)
  select v_org, code, 'trial', current_date + default_trial_days
  from apps where status = 'aktif';

  return v_org;
end $$;

-- Tambah anggota berdasarkan email (user harus sudah mendaftar).
create or replace function public.add_member(p_org uuid, p_email text, p_role public.org_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_admin(p_org) then raise exception 'Hanya admin yang bisa menambah anggota'; end if;
  if p_role = 'owner' and not public.has_role(p_org, array['owner']::public.org_role[]) then
    raise exception 'Hanya owner yang bisa menunjuk owner lain';
  end if;
  select id into v_user from profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Email % belum terdaftar. Minta yang bersangkutan mendaftar dulu.', p_email;
  end if;
  insert into memberships(org_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  return v_user;
end $$;

-- Cegah organisasi kehilangan owner terakhir
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and (select count(*) from memberships where org_id = old.org_id and role = 'owner') <= 1
     -- tetap izinkan bila organisasi / akun user-nya sendiri sedang dihapus
     and exists (select 1 from organizations where id = old.org_id)
     and exists (select 1 from profiles where id = old.user_id) then
    raise exception 'Organisasi harus punya minimal satu owner';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists memberships_last_owner on public.memberships;
create trigger memberships_last_owner before update or delete on public.memberships
  for each row execute function public.protect_last_owner();

drop trigger if exists memberships_audit on public.memberships;
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function public.audit_trigger();
