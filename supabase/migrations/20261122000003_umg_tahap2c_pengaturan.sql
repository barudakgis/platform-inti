-- =====================================================================
-- MODUL UMG — TAHAP 2c: PENGATURAN · PROFIL · PENGGUNA · LISENSI
-- Pengganti aksi GAS (05_Api.gs): settings.save, profile.save,
-- profile.password*, users.save, license.activate.
--   * ganti password dikerjakan langsung oleh Supabase Auth di browser.
-- Juga: status Aktif/Nonaktif pengguna UMG, kode lisensi UMG2 (penerbit
-- lisensi lewat SQL Editor), folder logo UMG di Storage.
--
-- Jalankan SEKALI di Supabase → SQL Editor (aman dijalankan ulang).
-- Butuh Tahap 1, 2a, 2b sudah terpasang. Tidak menghapus data apa pun.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. STATUS PENGGUNA UMG (Aktif / Nonaktif)
--    Nonaktif = tidak bisa membuka UMG lagi (akun Platform Inti tetap ada).
-- ---------------------------------------------------------------------
alter table public.umg2_members add column if not exists status text not null default 'active';
do $$ begin
  alter table public.umg2_members add constraint umg2_members_status_chk check (status in ('active', 'disabled'));
exception when duplicate_object then null; end $$;

drop trigger if exists umg2_members_audit on public.umg2_members;
create trigger umg2_members_audit after insert or update or delete on public.umg2_members
  for each row execute function public.audit_trigger();

create or replace function public.umg2_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from umg2_members where org_id = p_org and user_id = auth.uid() and status = 'disabled') then null
  else coalesce(
    (select role from umg2_members where org_id = p_org and user_id = auth.uid()),
    (select case m.role when 'owner' then 'admin' when 'admin' then 'admin'
                        when 'editor' then 'surveyor' else 'viewer' end
       from memberships m where m.org_id = p_org and m.user_id = auth.uid())) end;
$$;

-- Fungsi Tahap 2a yang diperbarui (status pengguna, logo bawaan, kuota pengguna aktif)
create or replace function public.umg2_pub_user(p_org uuid, p_uid uuid, p_full boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_full then
      jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(p.full_name, ''), p.email, '-'),
        'role', public.umg2_role_of(p_org, m.user_id), 'has_photo', coalesce(p.avatar_url, '') <> '',
        'username', coalesce(p.email, ''),
        'status', coalesce((select status from umg2_members um where um.org_id = p_org and um.user_id = m.user_id), 'active'),
        'last_login', u.last_sign_in_at, 'created_at', m.created_at)
    else
      jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1), '-'),
        'role', public.umg2_role_of(p_org, m.user_id), 'has_photo', coalesce(p.avatar_url, '') <> '')
    end
  from memberships m
  join profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.org_id = p_org and m.user_id = p_uid;
$$;

create or replace function public.umg2_settings_pub(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; o jsonb; v_logo text;
begin
  select coalesce(settings, '{}'::jsonb) into s from umg2_settings where org_id = p_org;
  select coalesce(settings, '{}'::jsonb) into o from organizations where id = p_org;
  s := coalesce(s, '{}'::jsonb); o := coalesce(o, '{}'::jsonb);
  v_logo := case when s->>'logo' = 'none' then ''                       -- admin memilih logo bawaan
                 when coalesce(s->>'logo', '') ~ '^https://' then s->>'logo'
                 when coalesce(o->>'logo_url', '') ~ '^https://' then o->>'logo_url'
                 else '' end;
  return jsonb_build_object(
    'title', coalesce(nullif(s->>'app_title', ''), nullif(o->>'app_title', ''), 'Universal Mobile Mapping GIS'),
    'subtitle', coalesce(nullif(s->>'app_subtitle', ''), 'Enterprise Field Mapping'),
    'accent', case when coalesce(s->>'accent', '') ~ '^#[0-9a-fA-F]{6}$' then s->>'accent'
                   when coalesce(o->>'theme_color', '') ~ '^#[0-9a-fA-F]{6}$' then o->>'theme_color'
                   else '#0f766e' end,
    'logo_url', v_logo,
    'logo_ver', coalesce(nullif(s->>'logo_ver', ''), case when v_logo <> '' then left(md5(v_logo), 12) else '' end),
    'pmtiles_default', coalesce(s->>'pmtiles_default', ''),
    'maptiler_key', coalesce(s->>'maptiler_key', ''));
end $$;

create or replace function public.umg2_license_status(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid := public.umg2_pick_org(p_org);
  l licenses; t jsonb; v_valid boolean; v_exp text; v_left int; v_msg text := '';
  v_tiers constant jsonb := '{
    "TRIAL":      {"label":"Trial",      "max_users":3,      "max_features":300,     "offline_pmtiles":true},
    "BASIC":      {"label":"Basic",      "max_users":10,     "max_features":5000,    "offline_pmtiles":false},
    "PRO":        {"label":"Pro",        "max_users":50,     "max_features":50000,   "offline_pmtiles":true},
    "ENTERPRISE": {"label":"Enterprise", "max_users":100000, "max_features":1000000, "offline_pmtiles":true}}';
begin
  if v_org is null or not public.is_member(v_org) then
    perform public.umg2_fail('NO_ORG', 'Akun ini belum terdaftar di organisasi yang memakai UMG.');
  end if;
  select * into l from licenses where org_id = v_org and app_code = 'umg';
  if not found then
    return jsonb_build_object('tier', 'NONE', 'label', 'Tidak ada', 'valid', false, 'read_only', true,
      'licensee', '', 'exp', '', 'max_users', 0, 'max_features', 0, 'offline_pmtiles', false,
      'message', 'Organisasi ini belum punya lisensi UMG.', 'used_users', 0, 'used_features', 0, 'script_id', '');
  end if;
  t := v_tiers -> upper(l.plan);
  v_valid := l.active and (l.valid_until is null or l.valid_until >= current_date);
  v_exp := coalesce(to_char(l.valid_until, 'YYYY-MM-DD'), '');
  v_left := case when l.valid_until is null then null else greatest(0, l.valid_until - current_date + 1) end;
  v_msg := case
    when not l.active then 'Lisensi dinonaktifkan penyedia. Aplikasi berjalan dalam mode baca-saja.'
    when not v_valid then 'Lisensi berakhir (' || v_exp || '). Aplikasi berjalan dalam mode baca-saja.'
    when l.plan = 'trial' then 'Masa trial tersisa ' || v_left || ' hari.'
    else '' end;
  return jsonb_build_object(
    'tier', upper(l.plan), 'label', t->>'label', 'valid', v_valid, 'read_only', not v_valid,
    'licensee', (select name from organizations where id = v_org), 'license_id', l.id, 'exp', v_exp,
    'max_users', coalesce(l.max_users, (t->>'max_users')::int), 'max_features', (t->>'max_features')::int,
    'offline_pmtiles', (t->>'offline_pmtiles')::boolean, 'message', v_msg,
    'trial_days_left', case when l.plan = 'trial' then v_left end,
    'used_users', (select count(*) from memberships m where m.org_id = v_org
                     and not exists (select 1 from umg2_members um where um.org_id = m.org_id and um.user_id = m.user_id and um.status = 'disabled')),
    'used_features', (select count(*) from umg2_features where org_id = v_org and not deleted),
    -- pengganti "Script ID": kode organisasi, untuk dikirim ke penyedia saat perpanjangan
    'script_id', case when public.umg2_role(v_org) = 'admin' then v_org::text else '' end);
end $$;

create or replace function public.umg2_boot(p_org uuid default null, p_since text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_org uuid := public.umg2_pick_org(p_org);
  v_role text; v_admin boolean; v_feats jsonb; v_me jsonb; v_set jsonb; v_lic jsonb;
begin
  if auth.uid() is null then perform public.umg2_fail('UNAUTHENTICATED', 'Sesi berakhir. Silakan login kembali.'); end if;
  if v_org is null then
    perform public.umg2_fail('NO_ORG', 'Akun ini belum terdaftar di organisasi yang memakai UMG. Minta admin menambahkan Anda di Platform Inti → Anggota.');
  end if;
  if exists (select 1 from umg2_members where org_id = v_org and user_id = auth.uid() and status = 'disabled') then
    perform public.umg2_fail('DISABLED', 'Akun Anda dinonaktifkan oleh admin UMG. Hubungi admin organisasi.');
  end if;
  if not public.umg2_can(v_org, 'feature.read') then
    perform public.umg2_fail('FORBIDDEN', 'Anda tidak punya izin melihat data UMG di organisasi ini.');
  end if;
  v_role := public.umg2_role(v_org);
  v_admin := v_role = 'admin';
  v_feats := public.umg2_features_page(v_org, null, p_since, 0, 2000);
  v_set := public.umg2_settings_pub(v_org);
  v_lic := public.umg2_license_status(v_org);
  select public.umg2_pub_user(v_org, auth.uid(), true) || jsonb_build_object('photo', coalesce(p.avatar_url, ''))
    into v_me from profiles p where p.id = auth.uid();

  return jsonb_build_object(
    'app', public.umg2_server_info() || jsonb_build_object('db', jsonb_build_object(
             'backend', 'supabase',
             'tenant', case when v_admin then (select name from organizations where id = v_org) end,
             'plan', case when v_admin then v_lic->>'label' end,
             'status', case when v_admin then case when (v_lic->>'valid')::boolean then 'aktif' else 'baca-saja' end end)),
    'user', v_me,
    'org', (select jsonb_build_object('id', id, 'name', name) from organizations where id = v_org),
    'perms', public.umg2_perms(v_role),
    'settings', v_set - 'logo_url',
    'license', v_lic - 'used_users' - 'used_features' - 'script_id',
    'projects', (select coalesce(jsonb_agg(public.umg2_pub_project(p) order by p.created_at, p.id), '[]'::jsonb)
                 from umg2_projects p where p.org_id = v_org and not p.deleted),
    'layers', (select coalesce(jsonb_agg(public.umg2_pub_layer(l) order by l.created_at, l.id), '[]'::jsonb)
               from umg2_layers l where l.org_id = v_org and not l.deleted),
    'users', public.umg2_users_json(v_org, v_admin, true),
    'features', v_feats->'items', 'features_total', v_feats->'total', 'features_next', v_feats->'next');
end $$;

-- Pengguna UMG yang AKTIF di organisasi (untuk kuota lisensi)
create or replace function public.umg2_active_users(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from memberships m where m.org_id = p_org
    and not exists (select 1 from umg2_members um where um.org_id = m.org_id and um.user_id = m.user_id and um.status = 'disabled');
$$;

-- Validasi URL gambar hasil unggah ke bucket publik "branding"
create or replace function public.umg2_branding_url_ok(p_url text, p_prefix text)
returns boolean language sql immutable as $$
  select p_url ~ '^https://[A-Za-z0-9.-]+/storage/v1/object/public/branding/'
     and position('/storage/v1/object/public/branding/' || p_prefix in p_url) > 0
     and p_url !~ '\.\.' and length(p_url) <= 500;
$$;

-- ---------------------------------------------------------------------
-- 2. PENGATURAN (judul, subjudul, warna, PMTiles, MapTiler, logo) — admin
-- ---------------------------------------------------------------------
create or replace function public.umg2_settings_save(p_org uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); s jsonb; v text; v_old text := '';
begin
  perform public.umg2_require_write(v_org, array['*']);
  if public.umg2_role(v_org) is distinct from 'admin' then perform public.umg2_fail('FORBIDDEN', 'Hanya admin yang dapat mengubah pengaturan.'); end if;
  select coalesce(settings, '{}') into s from umg2_settings where org_id = v_org;
  s := coalesce(s, '{}');
  if p ? 'title' then
    v := trim(coalesce(public.umg2_jstr(p->'title'), ''));
    if length(v) > 80 then perform public.umg2_fail('VALIDATION', 'Judul maksimal 80 karakter.'); end if;
    s := s || jsonb_build_object('app_title', coalesce(nullif(v, ''), 'Universal Mobile Mapping GIS'));
  end if;
  if p ? 'subtitle' then
    v := trim(coalesce(public.umg2_jstr(p->'subtitle'), ''));
    if length(v) > 120 then perform public.umg2_fail('VALIDATION', 'Subjudul maksimal 120 karakter.'); end if;
    s := s || jsonb_build_object('app_subtitle', v);
  end if;
  if p ? 'accent' then
    v := coalesce(public.umg2_jstr(p->'accent'), '');
    if v !~ '^#[0-9a-fA-F]{6}$' then perform public.umg2_fail('VALIDATION', 'Warna aksen harus format #RRGGBB.'); end if;
    s := s || jsonb_build_object('accent', v);
  end if;
  if p ? 'pmtiles_default' then
    v := trim(coalesce(public.umg2_jstr(p->'pmtiles_default'), ''));
    if length(v) > 500 then perform public.umg2_fail('VALIDATION', 'URL PMTiles maksimal 500 karakter.'); end if;
    if v <> '' and v !~ '^https://' then perform public.umg2_fail('VALIDATION', 'URL PMTiles harus HTTPS.'); end if;
    s := s || jsonb_build_object('pmtiles_default', v);
  end if;
  if p ? 'maptiler_key' then
    v := trim(coalesce(public.umg2_jstr(p->'maptiler_key'), ''));
    if length(v) > 80 then perform public.umg2_fail('VALIDATION', 'API key MapTiler maksimal 80 karakter.'); end if;
    if v <> '' and v !~ '^[A-Za-z0-9_-]{8,80}$' then perform public.umg2_fail('VALIDATION', 'Format API key MapTiler tidak valid.'); end if;
    s := s || jsonb_build_object('maptiler_key', v);
  end if;
  if p ? 'logo' then
    v := trim(coalesce(public.umg2_jstr(p->'logo'), ''));
    if v <> '' and not public.umg2_branding_url_ok(v, v_org::text || '/umg/logo-') then
      perform public.umg2_fail('BAD_FILE', 'Logo harus diunggah lewat aplikasi (JPEG/PNG/WebP).');
    end if;
    v_old := coalesce(s->>'logo', '');
    s := s || jsonb_build_object('logo', case when v = '' then 'none' else v end,
                                 'logo_ver', (extract(epoch from clock_timestamp()) * 1000)::bigint::text);
  end if;
  insert into umg2_settings(org_id, settings, updated_at) values (v_org, s, clock_timestamp())
  on conflict (org_id) do update set settings = excluded.settings, updated_at = excluded.updated_at;
  return (public.umg2_settings_pub(v_org) - 'logo_url')
         || jsonb_build_object('_old_logo', case when v_old ~ '^https://' and v_old is distinct from s->>'logo' then v_old else '' end);
end $$;

-- ---------------------------------------------------------------------
-- 3. PROFIL SAYA (nama & foto) — setiap pengguna, juga saat lisensi habis
-- ---------------------------------------------------------------------
create or replace function public.umg2_profile_save(p_org uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_pick_org(p_org); v text; v_old text; me jsonb;
begin
  if auth.uid() is null then perform public.umg2_fail('UNAUTHENTICATED', 'Sesi berakhir. Silakan login kembali.'); end if;
  if v_org is null or public.umg2_role(v_org) is null then perform public.umg2_fail('FORBIDDEN', 'Akun Anda tidak aktif di UMG.'); end if;
  select avatar_url into v_old from profiles where id = auth.uid();
  if p ? 'name' then
    v := trim(coalesce(public.umg2_jstr(p->'name'), ''));
    if length(v) > 80 then perform public.umg2_fail('VALIDATION', 'Nama maksimal 80 karakter.'); end if;
    if v = '' then perform public.umg2_fail('VALIDATION', 'Nama wajib diisi.'); end if;
    update profiles set full_name = v, updated_at = now() where id = auth.uid();
  end if;
  if p ? 'photo' then
    v := trim(coalesce(public.umg2_jstr(p->'photo'), ''));
    if v <> '' and not public.umg2_branding_url_ok(v, v_org::text || '/avatars/' || auth.uid()::text || '-') then
      perform public.umg2_fail('BAD_FILE', 'Foto profil harus diunggah lewat aplikasi (JPEG/PNG/WebP).');
    end if;
    update profiles set avatar_url = nullif(v, ''), updated_at = now() where id = auth.uid();
  end if;
  select public.umg2_pub_user(v_org, auth.uid(), true) || jsonb_build_object('photo', coalesce(avatar_url, ''),
           '_old_photo', case when p ? 'photo' and coalesce(v_old, '') is distinct from coalesce(avatar_url, '') then coalesce(v_old, '') else '' end)
    into me from profiles where id = auth.uid();
  return me;
end $$;

-- ---------------------------------------------------------------------
-- 4. PENGGUNA (tambah / ubah role / aktif-nonaktif) — admin UMG
--    Akun baru dibuat aplikasi lewat Supabase Auth (daftar dengan email +
--    password awal), lalu fungsi ini memasukkannya ke organisasi.
-- ---------------------------------------------------------------------
create or replace function public.umg2_user_save(p_org uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); v_role text; v_status text; v_name text; v_uid uuid; v_email text;
  v_cur record; v_max int; v_admins int;
begin
  perform public.umg2_require_write(v_org, array['*']);
  if public.umg2_role(v_org) is distinct from 'admin' then perform public.umg2_fail('FORBIDDEN', 'Hanya admin yang dapat mengelola pengguna.'); end if;
  v_role := case when p->>'role' in ('admin', 'supervisor', 'surveyor', 'viewer') then p->>'role' end;
  if v_role is null then perform public.umg2_fail('VALIDATION', 'Role tidak valid.'); end if;
  v_status := case when p->>'status' = 'disabled' then 'disabled' else 'active' end;
  v_name := trim(coalesce(public.umg2_jstr(p->'name'), ''));
  if length(v_name) > 80 then perform public.umg2_fail('VALIDATION', 'Nama maksimal 80 karakter.'); end if;
  if v_name = '' then perform public.umg2_fail('VALIDATION', 'Nama wajib diisi.'); end if;
  v_max := coalesce((public.umg2_license_status(v_org)->>'max_users')::int, 0);

  if public.umg2_truthy(p->'id') then
    begin v_uid := (p->>'id')::uuid; exception when others then perform public.umg2_fail('NOT_FOUND', 'Pengguna tidak ditemukan.'); end;
    select m.user_id, coalesce(um.status, 'active') as status, public.umg2_role_of(v_org, m.user_id) as role into v_cur
      from memberships m left join umg2_members um on um.org_id = m.org_id and um.user_id = m.user_id
     where m.org_id = v_org and m.user_id = v_uid;
    if v_cur.user_id is null then perform public.umg2_fail('NOT_FOUND', 'Pengguna tidak ditemukan.'); end if;
    if v_uid = auth.uid() and (v_role <> 'admin' or v_status <> 'active') then
      perform public.umg2_fail('VALIDATION', 'Anda tidak dapat menurunkan role / menonaktifkan akun sendiri.');
    end if;
    if v_cur.status <> 'active' and v_status = 'active' and public.umg2_active_users(v_org) >= v_max then
      perform public.umg2_fail('LICENSE_LIMIT', 'Batas pengguna lisensi tercapai (' || v_max || ').');
    end if;
  else
    v_email := lower(trim(coalesce(public.umg2_jstr(p->'username'), public.umg2_jstr(p->'email'), '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then
      perform public.umg2_fail('VALIDATION', 'Isi EMAIL pengguna (bukan username) yang valid.');
    end if;
    if not public.is_admin(v_org) then
      perform public.umg2_fail('FORBIDDEN', 'Menambah anggota baru hanya bisa oleh owner/admin Platform Inti. Anda tetap bisa mengubah role pengguna yang sudah ada.');
    end if;
    select id into v_uid from profiles where lower(email) = v_email;
    if v_uid is null then
      perform public.umg2_fail('NOT_FOUND', 'Email ' || v_email || ' belum punya akun. Isi "Password awal" agar akun dibuat otomatis, atau minta ybs mendaftar di Platform Inti.');
    end if;
    if exists (select 1 from memberships where org_id = v_org and user_id = v_uid) then
      perform public.umg2_fail('CONFLICT', 'Pengguna ' || v_email || ' sudah ada di organisasi ini — ubah lewat tombol Edit.');
    end if;
    if v_status = 'active' and public.umg2_active_users(v_org) >= v_max then
      perform public.umg2_fail('LICENSE_LIMIT', 'Batas pengguna lisensi tercapai (' || v_max || ').');
    end if;
    -- di Platform Inti cukup "viewer"; hak di UMG diatur role UMG di bawah
    insert into memberships(org_id, user_id, role) values (v_org, v_uid, 'viewer');
  end if;

  insert into umg2_members(org_id, user_id, role, status, updated_at) values (v_org, v_uid, v_role, v_status, clock_timestamp())
  on conflict (org_id, user_id) do update set role = excluded.role, status = excluded.status, updated_at = excluded.updated_at;
  select count(*) into v_admins from memberships m where m.org_id = v_org and public.umg2_role_of(v_org, m.user_id) = 'admin'
    and not exists (select 1 from umg2_members um where um.org_id = v_org and um.user_id = m.user_id and um.status = 'disabled');
  if v_admins = 0 then perform public.umg2_fail('VALIDATION', 'Harus tersisa minimal satu admin UMG yang aktif.'); end if;
  update profiles set full_name = v_name, updated_at = now() where id = v_uid and coalesce(full_name, '') is distinct from v_name;
  return public.umg2_pub_user(v_org, v_uid, true);
end $$;

-- ---------------------------------------------------------------------
-- 5. LISENSI — kode aktivasi "UMG2.…" (ditandatangani HMAC-SHA256)
--    PENYEDIA membuat kode di SQL Editor:
--      select public.umg2_license_issue('<ID organisasi>', 'pro', '2027-12-31');
--      (opsional argumen ke-4: batas pengguna, mis. 25)
--    PELANGGAN menempel kode di UMG → Administrasi → Lisensi → Aktifkan.
--    Kunci rahasia tersimpan di tabel yang tidak bisa dibaca siapa pun
--    lewat aplikasi; satu kode hanya bisa dipakai satu kali.
-- ---------------------------------------------------------------------
create table if not exists public.umg2_license_secret (
  id      int primary key default 1 check (id = 1),
  secret  text not null
);
alter table public.umg2_license_secret enable row level security;   -- tanpa policy = tertutup
insert into public.umg2_license_secret(id, secret)
values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;

create table if not exists public.umg2_license_redeemed (
  code_id      text primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  payload      jsonb not null,
  redeemed_by  uuid,
  redeemed_at  timestamptz not null default now()
);
alter table public.umg2_license_redeemed enable row level security;
drop policy if exists umg2_license_redeemed_select on public.umg2_license_redeemed;
create policy umg2_license_redeemed_select on public.umg2_license_redeemed for select to authenticated
  using (public.umg2_role(org_id) = 'admin');

create or replace function public.umg2_b64url(b bytea)
returns text language sql immutable as $$
  select translate(rtrim(replace(encode(b, 'base64'), E'\n', ''), '='), '+/', '-_');
$$;
create or replace function public.umg2_b64url_decode(t text)
returns bytea language sql immutable as $$
  select decode(rpad(translate(t, '-_', '+/'), (length(t) + 3) / 4 * 4, '='), 'base64');
$$;

create or replace function public.umg2_license_issue(p_org uuid, p_plan text, p_valid_until date, p_max_users int default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_payload text; v_sig text;
begin
  if not exists (select 1 from organizations where id = p_org) then raise exception 'Organisasi % tidak ditemukan', p_org; end if;
  if p_plan not in ('trial', 'basic', 'pro', 'enterprise') then raise exception 'Paket harus trial, basic, pro, atau enterprise'; end if;
  v_payload := public.umg2_b64url(convert_to(jsonb_build_object('o', p_org, 'a', 'umg', 'p', p_plan,
                 'u', to_char(p_valid_until, 'YYYY-MM-DD'), 'm', p_max_users,
                 'i', encode(extensions.gen_random_bytes(9), 'hex'), 't', to_char(now(), 'YYYY-MM-DD'))::text, 'UTF8'));
  v_sig := public.umg2_b64url(extensions.hmac(v_payload, (select secret from umg2_license_secret where id = 1), 'sha256'));
  return 'UMG2.' || v_payload || '.' || v_sig;
end $$;

create or replace function public.umg2_license_activate(p_org uuid, p_key text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); parts text[]; d jsonb; v_until date;
begin
  if public.umg2_role(v_org) is distinct from 'admin' then perform public.umg2_fail('FORBIDDEN', 'Hanya admin yang dapat mengaktifkan lisensi.'); end if;
  parts := string_to_array(regexp_replace(coalesce(p_key, ''), '\s', '', 'g'), '.');
  if cardinality(parts) <> 3 or parts[1] <> 'UMG2' then
    perform public.umg2_fail('LICENSE_INVALID', 'Format kunci tidak dikenal. Kunci versi Supabase diawali "UMG2." (kunci UMG1 lama tidak berlaku lagi).');
  end if;
  if public.umg2_b64url(extensions.hmac(parts[2], (select secret from umg2_license_secret where id = 1), 'sha256')) <> parts[3] then
    perform public.umg2_fail('LICENSE_INVALID', 'Tanda tangan kunci tidak valid (kunci rusak / bukan dari penyedia).');
  end if;
  begin d := convert_from(public.umg2_b64url_decode(parts[2]), 'UTF8')::jsonb;
  exception when others then perform public.umg2_fail('LICENSE_INVALID', 'Isi kunci rusak.'); end;
  if d->>'a' <> 'umg' then perform public.umg2_fail('LICENSE_INVALID', 'Kunci ini bukan untuk aplikasi UMG.'); end if;
  if d->>'o' <> v_org::text then perform public.umg2_fail('LICENSE_INVALID', 'Kunci ini diterbitkan untuk organisasi lain. Kirim "Kode organisasi" yang benar ke penyedia.'); end if;
  if exists (select 1 from umg2_license_redeemed where code_id = d->>'i') then perform public.umg2_fail('LICENSE_INVALID', 'Kunci ini sudah pernah dipakai.'); end if;
  v_until := nullif(d->>'u', '')::date;
  if v_until is not null and v_until < current_date then perform public.umg2_fail('LICENSE_INVALID', 'Masa berlaku kunci sudah lewat (' || (d->>'u') || ').'); end if;
  insert into licenses(org_id, app_code, plan, valid_until, max_users, active, notes)
  values (v_org, 'umg', d->>'p', v_until, nullif(d->>'m', '')::int, true, 'Aktivasi kode ' || (d->>'i'))
  on conflict (org_id, app_code) do update set plan = excluded.plan, valid_until = excluded.valid_until,
    max_users = excluded.max_users, active = true, notes = excluded.notes;
  insert into umg2_license_redeemed(code_id, org_id, payload, redeemed_by) values (d->>'i', v_org, d, auth.uid());
  perform public.umg2_event(v_org, 'license.activate', 'license', d->>'i', jsonb_build_object('tier', upper(d->>'p'), 'exp', d->>'u'));
  return public.umg2_license_status(v_org);
end $$;

-- ---------------------------------------------------------------------
-- 6. STORAGE: logo UMG di branding/<org_id>/umg/…  (admin UMG)
--    Foto profil memakai aturan Platform Inti: branding/<org_id>/avatars/<user_id>-…
-- ---------------------------------------------------------------------
drop policy if exists umg2_logo_insert on storage.objects;
create policy umg2_logo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and split_part(name, '/', 2) = 'umg' and public.umg2_role(public.storage_org(name)) = 'admin');
drop policy if exists umg2_logo_update on storage.objects;
create policy umg2_logo_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and split_part(name, '/', 2) = 'umg' and public.umg2_role(public.storage_org(name)) = 'admin');
drop policy if exists umg2_logo_delete on storage.objects;
create policy umg2_logo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and split_part(name, '/', 2) = 'umg' and public.umg2_role(public.storage_org(name)) = 'admin');

-- ---------------------------------------------------------------------
-- 7. HAK AKSES
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array['umg2_active_users(uuid)', 'umg2_license_issue(uuid,text,date,integer)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array['umg2_settings_save(uuid,jsonb)', 'umg2_profile_save(uuid,jsonb)', 'umg2_user_save(uuid,jsonb)',
                            'umg2_license_activate(uuid,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
revoke all on public.umg2_license_secret from anon, authenticated;

-- =====================================================================
-- CEK CEPAT (opsional):  select id, name from organizations;
-- =====================================================================
