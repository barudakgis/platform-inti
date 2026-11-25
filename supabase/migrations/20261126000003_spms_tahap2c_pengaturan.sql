-- =====================================================================
-- SPMS — TAHAP 2c: PENGGUNA · PENGATURAN · PROFIL · LISENSI · AI
-- Jalankan SETELAH Tahap 1, 2a, 2b. Aman dijalankan ulang. Tidak menghapus data.
--   1. Status pengguna SPMS Aktif/Nonaktif (Nonaktif = tidak bisa membuka SPMS)
--   2. spms_user_save      tambah/ubah pengguna & role SPMS (unit, data petani)
--   3. spms_settings_save  judul, logo, tema, peta, AI, keuangan (global / per unit)
--   4. Lisensi "SPMS2.…"   penyedia membuat kode di SQL Editor, pelanggan menempel di aplikasi
--   5. AI                  API key per organisasi (tertutup), kuota bulanan, log pemakaian
--                          → dipanggil Edge Function "spms-ai" (kunci tidak pernah ke browser)
--   6. spms_apply          + aksi aiVision (simpan rekomendasi hasil analisis foto)
-- Profil & ganti password memakai Supabase Auth + tabel profiles Platform Inti.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.spms_apply(uuid,text,text,jsonb,text,jsonb)') is null then
    raise exception 'Tahap 2b SPMS belum terpasang. Jalankan dulu 20261126000002_spms_tahap2b_tulis.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. STATUS PENGGUNA SPMS
-- ---------------------------------------------------------------------
alter table public.spms_members add column if not exists status text not null default 'Aktif';
do $$ begin
  alter table public.spms_members add constraint spms_members_status_ck check (status in ('Aktif', 'Nonaktif'));
exception when duplicate_object then null; end $$;

create or replace function public.spms_ctx()
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (select nullif(current_setting('spms.grant', true), '')::jsonb as v)
  select coalesce(jsonb_object_agg(x.org_id::text, jsonb_build_object(
           'r', x.role, 's', r.scope, 'u', x.unit, 'f', x.farmer,
           'l', coalesce(public.has_license(x.org_id, 'spms'), false),
           'p', public.spms_merge_perms(
                  (select coalesce(jsonb_object_agg(rp.module, rp.perms), '{}'::jsonb) from spms_role_perms rp where rp.role = x.role),
                  case when (select v ->> 'org' from g) = x.org_id::text then (select v -> 'perms' from g) end))), '{}'::jsonb)
  from (select m.org_id,
               coalesce(s.role, case m.role when 'owner' then 'super_admin' when 'admin' then 'super_admin'
                                            when 'editor' then 'enumerator' else 'viewer' end) as role,
               nullif(s.unit_id, '') as unit, nullif(s.farmer_id, '') as farmer
          from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
         where m.user_id = auth.uid() and coalesce(s.status, 'Aktif') = 'Aktif') x
  join spms_roles r on r.role = x.role;
$$;

create or replace function public.spms_role(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when coalesce(s.status, 'Aktif') <> 'Aktif' then null else
         coalesce(s.role, case m.role when 'owner' then 'super_admin' when 'admin' then 'super_admin'
                                      when 'editor' then 'enumerator' else 'viewer' end) end
    from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
   where m.org_id = p_org and m.user_id = auth.uid();
$$;

-- role SPMS efektif seorang anggota (untuk pengelolaan pengguna)
create or replace function public.spms_role_of(p_org uuid, p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(s.role, case m.role when 'owner' then 'super_admin' when 'admin' then 'super_admin'
                                      when 'editor' then 'enumerator' else 'viewer' end)
    from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
   where m.org_id = p_org and m.user_id = p_uid;
$$;
revoke execute on function public.spms_role_of(uuid, uuid) from public, anon, authenticated;

-- siapa saya: + status nonaktif + AI
create or replace function public.spms_whoami(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org uuid; c jsonb; l record; p record; v_legacy text; v_status text;
begin
  if v_uid is null then
    raise exception 'Sesi berakhir. Silakan login kembali.' using hint = 'UNAUTHENTICATED';
  end if;
  select m.org_id into v_org from memberships m
   where m.user_id = v_uid
   order by (m.org_id = p_org) desc nulls last, public.has_license(m.org_id, 'spms') desc, m.created_at
   limit 1;
  if v_org is null then
    raise exception 'Akun ini belum menjadi anggota organisasi mana pun. Minta Owner menambahkan email Anda di menu Anggota Platform Inti.' using hint = 'NO_ORG';
  end if;
  select legacy_user_id, status into v_legacy, v_status from spms_members where org_id = v_org and user_id = v_uid;
  if coalesce(v_status, 'Aktif') <> 'Aktif' then
    raise exception 'Akun Anda dinonaktifkan untuk SPMS. Hubungi admin organisasi.' using hint = 'DISABLED';
  end if;
  c := public.spms_ctx() -> (v_org::text);
  select plan, valid_until, active, max_users into l from licenses where org_id = v_org and app_code = 'spms';
  select pr.email, pr.full_name, pr.phone, pr.avatar_url, au.last_sign_in_at into p
    from profiles pr left join auth.users au on au.id = pr.id where pr.id = v_uid;
  return jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug) from organizations o where o.id = v_org),
    'orgs', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name), '[]'::jsonb)
               from organizations o join memberships m on m.org_id = o.id where m.user_id = v_uid),
    'user', jsonb_build_object('id', v_uid, 'email', p.email, 'name', coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)),
                               'phone', p.phone, 'avatar_url', p.avatar_url, 'last_login', p.last_sign_in_at, 'legacy_id', v_legacy),
    'role', c ->> 'r', 'scope', c ->> 's', 'unit', c ->> 'u', 'farmer', c ->> 'f',
    'perms', c -> 'p', 'licensed', coalesce((c ->> 'l')::boolean, false),
    'license', case when l.plan is null then null else jsonb_build_object('plan', l.plan, 'valid_until', l.valid_until, 'active', l.active, 'max_users', l.max_users) end,
    'ai_has_key', exists (select 1 from spms_ai_keys k where k.org_id = v_org),
    'platform_admin', public.is_admin(v_org),
    'server_time', now());
end $$;

-- daftar pengguna: + status SPMS
create or replace function public.spms_users_list(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.spms_can(p_org, 'users', 'R') then
    raise exception 'Anda tidak punya izin melihat daftar pengguna.' using hint = 'FORBIDDEN';
  end if;
  return (
    select coalesce(jsonb_agg(u order by u ->> 'name'), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', m.user_id::text, 'org_id', coalesce(s.unit_id, ''), 'username', pr.email, 'name', coalesce(nullif(pr.full_name, ''), split_part(pr.email, '@', 1)),
        'email', pr.email, 'phone', coalesce(pr.phone, ''),
        'role', coalesce(s.role, case m.role when 'owner' then 'super_admin' when 'admin' then 'super_admin' when 'editor' then 'enumerator' else 'viewer' end),
        'farmer_id', coalesce(s.farmer_id, ''), 'photo', coalesce(pr.avatar_url, ''), 'status', coalesce(s.status, 'Aktif'), 'must_change', 0,
        'last_login', coalesce(au.last_sign_in_at::text, ''), 'platform_role', m.role::text, 'deleted', 0) u
      from memberships m
      join profiles pr on pr.id = m.user_id
      left join auth.users au on au.id = m.user_id
      left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
      where m.org_id = p_org
      union all
      select jsonb_build_object(
        'id', 'legacy:' || l.id, 'org_id', coalesce(l.unit_id, ''), 'username', coalesce(l.username, ''), 'name', coalesce(l.name, l.username, '') || ' (akun lama)',
        'email', coalesce(l.email, ''), 'phone', coalesce(l.phone, ''), 'role', coalesce(l.role, 'viewer'), 'farmer_id', coalesce(l.farmer_id, ''),
        'photo', '', 'status', 'Belum daftar', 'must_change', 0, 'last_login', coalesce(l.last_login, ''), 'platform_role', '', 'deleted', 0) u
      from spms_legacy_users l
      where l.org_id = p_org and l.linked_user is null and coalesce(l.status, '') <> 'Nonaktif'
    ) x);
end $$;

-- ---------------------------------------------------------------------
-- 2. PENGGUNA: tambah / ubah role SPMS / aktif-nonaktif
--    Akun baru dibuat aplikasi lewat Supabase Auth (email + password awal),
--    lalu fungsi ini memasukkannya ke organisasi. Aturan sama dengan versi GAS.
-- ---------------------------------------------------------------------
create or replace function public.spms_plan_limit(p_org uuid, p_what text)
returns int language sql stable security definer set search_path = public as $$
  select case p_what
    when 'users' then coalesce(l.max_users, case l.plan when 'basic' then 10 when 'pro' then 50 when 'enterprise' then 100000 else 3 end)
    when 'ai' then case l.plan when 'basic' then 150 when 'pro' then 1500 when 'enterprise' then 20000 else 20 end
  end
  from (select (select plan from licenses where org_id = p_org and app_code = 'spms') as plan,
               (select max_users from licenses where org_id = p_org and app_code = 'spms') as max_users) l;
$$;
create or replace function public.spms_active_users(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
   where m.org_id = p_org and coalesce(s.status, 'Aktif') = 'Aktif';
$$;
revoke execute on function public.spms_plan_limit(uuid, text), public.spms_active_users(uuid) from public, anon, authenticated;

create or replace function public.spms_user_save(p_org uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_myrole text := public.spms_role(p_org); v_myscope text; v_myunit text;
  v_uid uuid; v_email text; v_role text := p ->> 'role'; v_status text := coalesce(nullif(p ->> 'status', ''), 'Aktif');
  v_unit text := nullif(p ->> 'org_id', ''); v_farmer text := nullif(p ->> 'farmer_id', ''); v_name text := btrim(coalesce(p ->> 'name', ''));
  v_old record; v_new boolean := coalesce(p ->> 'id', '') = ''; v_supers int;
begin
  if v_myrole is null then raise exception 'Bukan anggota aktif organisasi ini.' using hint = 'FORBIDDEN'; end if;
  select scope into v_myscope from spms_roles where role = v_myrole;
  v_myunit := public.spms_unit(p_org);
  if not public.spms_can(p_org, 'users', case when v_new then 'C' else 'U' end) then
    raise exception 'Akses ditolak: Anda tidak memiliki izin mengelola pengguna.' using hint = 'FORBIDDEN';
  end if;
  if coalesce(p ->> 'id', '') like 'legacy:%' then
    raise exception 'Ini akun SPMS lama. Minta yang bersangkutan mendaftar di Platform Inti dengan email yang sama, lalu admin menjalankan penautan (blok E).' using hint = 'VALIDATION';
  end if;
  if not exists (select 1 from spms_roles where role = v_role) then raise exception 'Peran tidak valid.' using hint = 'VALIDATION'; end if;
  if v_status not in ('Aktif', 'Nonaktif') then raise exception 'Status tidak valid.' using hint = 'VALIDATION'; end if;
  if v_role = 'super_admin' and v_myrole <> 'super_admin' then raise exception 'Tidak dapat membuat / mengubah Super Admin.' using hint = 'FORBIDDEN'; end if;
  if length(v_name) > 120 then raise exception 'Nama maksimal 120 karakter.' using hint = 'VALIDATION'; end if;
  -- unit: super_admin memilih (kosong = semua unit); admin lain = unitnya sendiri
  if v_myscope <> 'all' and v_myunit is not null then v_unit := v_myunit; end if;
  if v_role <> 'super_admin' and v_unit is null and v_myrole <> 'super_admin' then
    raise exception 'Organisasi/unit wajib dipilih.' using hint = 'VALIDATION';
  end if;
  if v_unit is not null and not exists (select 1 from spms_organisasi where id = v_unit and org_id = p_org and not deleted) then
    raise exception 'Unit tidak ditemukan.' using hint = 'VALIDATION';
  end if;
  if v_role = 'farmer' then
    if v_farmer is null or not exists (select 1 from spms_petani where id = v_farmer and org_id = p_org and not deleted and (v_unit is null or unit_id = v_unit)) then
      raise exception 'Akun peran Petani wajib ditautkan ke data petani pada unit yang sama.' using hint = 'VALIDATION';
    end if;
  end if;

  if not v_new then
    begin v_uid := (p ->> 'id')::uuid; exception when others then raise exception 'Pengguna tidak ditemukan.' using hint = 'NOT_FOUND'; end;
    select m.user_id, public.spms_role_of(p_org, m.user_id) as role, s.unit_id, coalesce(s.status, 'Aktif') as status into v_old
      from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id where m.org_id = p_org and m.user_id = v_uid;
    if v_old.user_id is null then raise exception 'Pengguna tidak ditemukan.' using hint = 'NOT_FOUND'; end if;
    if v_myscope <> 'all' and v_myunit is not null and coalesce(v_old.unit_id, '') <> v_myunit then
      raise exception 'Pengguna ini di luar unit Anda.' using hint = 'FORBIDDEN';
    end if;
    if v_old.role = 'super_admin' and v_myrole <> 'super_admin' then raise exception 'Tidak dapat mengubah Super Admin.' using hint = 'FORBIDDEN'; end if;
    if v_uid = v_me and (v_role <> v_old.role or v_status <> 'Aktif') then
      raise exception 'Anda tidak dapat mengubah peran / menonaktifkan akun sendiri.' using hint = 'VALIDATION';
    end if;
    if v_old.status <> 'Aktif' and v_status = 'Aktif' and public.spms_active_users(p_org) >= public.spms_plan_limit(p_org, 'users') then
      raise exception 'Batas pengguna lisensi tercapai (%). Upgrade lisensi untuk menambah pengguna.', public.spms_plan_limit(p_org, 'users') using hint = 'LICENSE_LIMIT';
    end if;
  else
    v_email := lower(btrim(coalesce(nullif(p ->> 'email', ''), p ->> 'username', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then
      raise exception 'Isi EMAIL pengguna (bukan username) yang valid.' using hint = 'VALIDATION';
    end if;
    if not public.is_admin(p_org) then
      raise exception 'Menambah anggota baru hanya bisa oleh owner/admin Platform Inti. Anda tetap bisa mengubah role pengguna yang sudah ada.' using hint = 'FORBIDDEN';
    end if;
    select id into v_uid from profiles where lower(email) = v_email;
    if v_uid is null then
      raise exception 'Email % belum punya akun. Isi "Password awal" agar akun dibuat otomatis, atau minta ybs mendaftar di Platform Inti.', v_email using hint = 'NOT_FOUND';
    end if;
    if exists (select 1 from memberships where org_id = p_org and user_id = v_uid) then
      raise exception 'Pengguna % sudah ada di organisasi ini — ubah lewat tombol Edit.', v_email using hint = 'CONFLICT';
    end if;
    if v_status = 'Aktif' and public.spms_active_users(p_org) >= public.spms_plan_limit(p_org, 'users') then
      raise exception 'Batas pengguna lisensi tercapai (%). Upgrade lisensi untuk menambah pengguna.', public.spms_plan_limit(p_org, 'users') using hint = 'LICENSE_LIMIT';
    end if;
    insert into memberships(org_id, user_id, role) values (p_org, v_uid, 'viewer');   -- hak SPMS diatur role SPMS di bawah
  end if;

  insert into spms_members (org_id, user_id, role, unit_id, farmer_id, status, updated_at)
  values (p_org, v_uid, v_role, v_unit, case when v_role = 'farmer' then v_farmer end, v_status, now())
  on conflict (org_id, user_id) do update set role = excluded.role, unit_id = excluded.unit_id, farmer_id = excluded.farmer_id,
    status = excluded.status, updated_at = now();
  select count(*) into v_supers from memberships m left join spms_members s on s.org_id = m.org_id and s.user_id = m.user_id
   where m.org_id = p_org and coalesce(s.status, 'Aktif') = 'Aktif' and public.spms_role_of(p_org, m.user_id) = 'super_admin';
  if v_supers = 0 then raise exception 'Harus tersisa minimal satu Super Admin SPMS yang aktif.' using hint = 'VALIDATION'; end if;
  update profiles set full_name = coalesce(nullif(v_name, ''), full_name), phone = coalesce(nullif(p ->> 'phone', ''), phone), updated_at = now() where id = v_uid;
  insert into spms_audit (id, org_id, user_id, username, unit_id, action, entity, entity_id, detail)
  values (replace(gen_random_uuid()::text, '-', ''), p_org, v_me, (select email from profiles where id = v_me), v_myunit,
          case when v_new then 'user_create' else 'user_update' end, 'Users', v_uid::text, v_role || ' ' || v_status);
  return (select u from jsonb_array_elements(public.spms_users_list(p_org)) u where u ->> 'id' = v_uid::text);
end $$;
revoke execute on function public.spms_user_save(uuid, jsonb) from public, anon;
grant execute on function public.spms_user_save(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. PENGATURAN (aturan sama dengan h_settingsSave versi GAS)
-- ---------------------------------------------------------------------
create or replace function public.spms_settings_save(p_org uuid, p_key text, p_value jsonb, p_global boolean default false, p_replace boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_scope text; v_prev jsonb; v_val jsonb := coalesce(p_value, '{}'::jsonb);
begin
  if not public.spms_can(p_org, 'settings', 'U') then raise exception 'Akses ditolak: Anda tidak memiliki izin mengubah pengaturan.' using hint = 'FORBIDDEN'; end if;
  if p_key not in ('brand', 'theme', 'map', 'ai', 'finance', 'org') then raise exception 'Kunci pengaturan tidak valid.' using hint = 'VALIDATION'; end if;
  if jsonb_typeof(v_val) <> 'object' then raise exception 'Isi pengaturan harus berupa objek.' using hint = 'VALIDATION'; end if;
  v_scope := case when (select scope from spms_roles where role = public.spms_role(p_org)) = 'all' and p_global then 'global'
                  else coalesce(public.spms_unit(p_org), 'global') end;
  v_val := v_val - 'api_key';    -- API key AI TIDAK disimpan di pengaturan (lihat spms_ai_key_set)
  select value into v_prev from spms_settings where org_id = p_org and scope = v_scope and key = p_key;
  if v_prev is not null and not p_replace and jsonb_typeof(v_prev) = 'object' then v_val := v_prev || v_val; end if;
  if p_key = 'map' and length(coalesce(v_val -> 'pmtiles', 'null'::jsonb)::text) > 20000 then raise exception 'Daftar layer PMTiles terlalu banyak.' using hint = 'VALIDATION'; end if;
  if length(v_val::text) > 300000 then raise exception 'Data pengaturan terlalu besar (logo maks ±200 KB setelah kompresi).' using hint = 'VALIDATION'; end if;
  insert into spms_settings (org_id, scope, key, value, updated_at) values (p_org, v_scope, p_key, v_val, now())
  on conflict (org_id, scope, key) do update set value = excluded.value, updated_at = now();
  insert into spms_audit (id, org_id, user_id, username, unit_id, action, entity, entity_id, detail)
  values (replace(gen_random_uuid()::text, '-', ''), p_org, auth.uid(), (select email from profiles where id = auth.uid()), public.spms_unit(p_org),
          'settings', 'Settings', v_scope || '|' || p_key, '');
  return jsonb_build_object('scope', v_scope, 'key', p_key, 'value', v_val);
end $$;
revoke execute on function public.spms_settings_save(uuid, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.spms_settings_save(uuid, text, jsonb, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LISENSI — kode aktivasi "SPMS2.…" (HMAC-SHA256)
--    PENYEDIA:  select public.spms_license_issue('<Kode organisasi>', 'pro', '2027-12-31');
--               (opsional argumen ke-4: batas pengguna, mis. 25)
--    PELANGGAN: SPMS → Lisensi → tempel kode → Aktifkan (Super Admin)
-- ---------------------------------------------------------------------
create table if not exists public.spms_license_secret (
  id      int primary key default 1 check (id = 1),
  secret  text not null
);
alter table public.spms_license_secret enable row level security;   -- tanpa policy = tertutup
insert into public.spms_license_secret(id, secret) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;
revoke all on public.spms_license_secret from anon, authenticated;

create table if not exists public.spms_license_redeemed (
  code_id      text primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  payload      jsonb not null,
  redeemed_by  uuid,
  redeemed_at  timestamptz not null default now()
);
alter table public.spms_license_redeemed enable row level security;
drop policy if exists spms_license_redeemed_sel on public.spms_license_redeemed;
create policy spms_license_redeemed_sel on public.spms_license_redeemed for select to authenticated using (public.spms_role(org_id) = 'super_admin');
grant select on public.spms_license_redeemed to authenticated;

create or replace function public.spms_b64url(b bytea) returns text language sql immutable as $$
  select translate(rtrim(replace(encode(b, 'base64'), E'\n', ''), '='), '+/', '-_');
$$;
create or replace function public.spms_b64url_decode(t text) returns bytea language sql immutable as $$
  select decode(rpad(translate(t, '-_', '+/'), (length(t) + 3) / 4 * 4, '='), 'base64');
$$;

create or replace function public.spms_license_issue(p_org uuid, p_plan text, p_valid_until date, p_max_users int default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_payload text; v_sig text;
begin
  if not exists (select 1 from organizations where id = p_org) then raise exception 'Organisasi % tidak ditemukan', p_org; end if;
  if p_plan not in ('trial', 'basic', 'pro', 'enterprise') then raise exception 'Paket harus trial, basic, pro, atau enterprise'; end if;
  v_payload := public.spms_b64url(convert_to(jsonb_build_object('o', p_org, 'a', 'spms', 'p', p_plan,
                 'u', to_char(p_valid_until, 'YYYY-MM-DD'), 'm', p_max_users,
                 'i', encode(extensions.gen_random_bytes(9), 'hex'), 't', to_char(now(), 'YYYY-MM-DD'))::text, 'UTF8'));
  v_sig := public.spms_b64url(extensions.hmac(v_payload, (select secret from spms_license_secret where id = 1), 'sha256'));
  return 'SPMS2.' || v_payload || '.' || v_sig;
end $$;
revoke execute on function public.spms_license_issue(uuid, text, date, int) from public, anon, authenticated;

create or replace function public.spms_license_activate(p_org uuid, p_key text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare parts text[]; d jsonb; v_until date;
begin
  if public.spms_role(p_org) is distinct from 'super_admin' then
    raise exception 'Hanya Super Admin yang dapat mengaktifkan lisensi.' using hint = 'FORBIDDEN';
  end if;
  parts := string_to_array(regexp_replace(coalesce(p_key, ''), '\s', '', 'g'), '.');
  if cardinality(parts) <> 3 or parts[1] <> 'SPMS2' then
    raise exception 'Format kunci tidak dikenal. Kunci versi Supabase diawali "SPMS2." (kunci SPMS1 versi Google Sheets tidak berlaku).' using hint = 'LICENSE_INVALID';
  end if;
  if public.spms_b64url(extensions.hmac(parts[2], (select secret from spms_license_secret where id = 1), 'sha256')) <> parts[3] then
    raise exception 'Tanda tangan kunci tidak valid (kunci rusak / bukan dari penyedia).' using hint = 'LICENSE_INVALID';
  end if;
  begin d := convert_from(public.spms_b64url_decode(parts[2]), 'UTF8')::jsonb;
  exception when others then raise exception 'Isi kunci rusak.' using hint = 'LICENSE_INVALID'; end;
  if d ->> 'a' <> 'spms' then raise exception 'Kunci ini bukan untuk aplikasi SPMS.' using hint = 'LICENSE_INVALID'; end if;
  if d ->> 'o' <> p_org::text then raise exception 'Kunci ini diterbitkan untuk organisasi lain. Kirim "Kode organisasi" yang benar ke penyedia.' using hint = 'LICENSE_INVALID'; end if;
  if exists (select 1 from spms_license_redeemed where code_id = d ->> 'i') then raise exception 'Kunci ini sudah pernah dipakai.' using hint = 'LICENSE_INVALID'; end if;
  v_until := nullif(d ->> 'u', '')::date;
  if v_until is not null and v_until < current_date then raise exception 'Masa berlaku kunci sudah lewat (%).', d ->> 'u' using hint = 'LICENSE_INVALID'; end if;
  insert into licenses(org_id, app_code, plan, valid_until, max_users, active, notes)
  values (p_org, 'spms', d ->> 'p', v_until, nullif(d ->> 'm', '')::int, true, 'Aktivasi kode ' || (d ->> 'i'))
  on conflict (org_id, app_code) do update set plan = excluded.plan, valid_until = excluded.valid_until,
    max_users = excluded.max_users, active = true, notes = excluded.notes;
  insert into spms_license_redeemed(code_id, org_id, payload, redeemed_by) values (d ->> 'i', p_org, d, auth.uid());
  insert into spms_audit (id, org_id, user_id, username, action, entity, entity_id, detail)
  values (replace(gen_random_uuid()::text, '-', ''), p_org, auth.uid(), (select email from profiles where id = auth.uid()),
          'license_activate', 'License', d ->> 'i', upper(d ->> 'p') || ' s/d ' || coalesce(d ->> 'u', '-'));
  return jsonb_build_object('plan', d ->> 'p', 'valid_until', v_until, 'max_users', nullif(d ->> 'm', '')::int);
end $$;
revoke execute on function public.spms_license_activate(uuid, text) from public, anon;
grant execute on function public.spms_license_activate(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. AI — API key per organisasi (tertutup), kuota, log pemakaian
--    Browser TIDAK pernah menerima API key. Edge Function "spms-ai" membaca key
--    dengan kunci server (service_role / secret key) lalu memanggil Gemini/OpenAI.
-- ---------------------------------------------------------------------
create table if not exists public.spms_ai_keys (
  org_id      uuid primary key references public.organizations(id) on delete cascade,
  api_key     text not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table public.spms_ai_keys enable row level security;   -- tanpa policy = tertutup
revoke all on public.spms_ai_keys from anon, authenticated;

create table if not exists public.spms_ai_runs (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid,
  unit_id     text,
  ts          timestamptz not null default now(),
  provider    text, model text, kind text,
  tokens_in   int not null default 0,
  tokens_out  int not null default 0,
  status      text
);
create index if not exists spms_ai_runs_org on public.spms_ai_runs(org_id, ts);
alter table public.spms_ai_runs enable row level security;
drop policy if exists spms_ai_runs_sel on public.spms_ai_runs;
create policy spms_ai_runs_sel on public.spms_ai_runs for select to authenticated using (public.is_member(org_id));
grant select on public.spms_ai_runs to authenticated;
revoke all on public.spms_ai_runs from anon;

create or replace function public.spms_ai_key_set(p_org uuid, p_key text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if coalesce(public.spms_role(p_org), '') not in ('super_admin', 'org_admin') then
    raise exception 'Hanya admin yang dapat mengatur API key.' using hint = 'FORBIDDEN';
  end if;
  if btrim(coalesce(p_key, '')) = '' then delete from spms_ai_keys where org_id = p_org; return false; end if;
  if length(p_key) > 400 then raise exception 'API key terlalu panjang.' using hint = 'VALIDATION'; end if;
  insert into spms_ai_keys (org_id, api_key, updated_by, updated_at) values (p_org, btrim(p_key), auth.uid(), now())
  on conflict (org_id) do update set api_key = excluded.api_key, updated_by = excluded.updated_by, updated_at = now();
  insert into spms_audit (id, org_id, user_id, username, action, entity, entity_id, detail)
  values (replace(gen_random_uuid()::text, '-', ''), p_org, auth.uid(), (select email from profiles where id = auth.uid()), 'ai_key', 'Settings', 'ai', 'API key diperbarui');
  return true;
end $$;
revoke execute on function public.spms_ai_key_set(uuid, text) from public, anon;
grant execute on function public.spms_ai_key_set(uuid, text) to authenticated;

-- Dipanggil Edge Function DENGAN JWT pengguna: izin, lisensi, kuota, pengaturan model (tanpa API key)
create or replace function public.spms_ai_check(p_org uuid, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.spms_role(p_org); v_unit text := public.spms_unit(p_org); s jsonb := '{}'::jsonb; v_used int; v_lim int;
begin
  if auth.uid() is null or v_role is null then raise exception 'Bukan anggota aktif organisasi ini.' using hint = 'FORBIDDEN'; end if;
  if p_kind = 'test' then
    if v_role not in ('super_admin', 'org_admin') then raise exception 'Khusus admin.' using hint = 'FORBIDDEN'; end if;
  elsif not (public.spms_can(p_org, 'ai', 'R') or (p_kind = 'gis' and public.spms_can(p_org, 'gis', 'R'))
             or (p_kind = 'report' and public.spms_can(p_org, 'report', 'R'))) then
    raise exception 'Akses ditolak: role Anda tidak memiliki izin AI.' using hint = 'FORBIDDEN';
  end if;
  if not public.has_license(p_org, 'spms') then raise exception 'Lisensi SPMS tidak aktif — fitur AI dimatikan.' using hint = 'READ_ONLY'; end if;
  select coalesce((select value from spms_settings where org_id = p_org and scope = 'global' and key = 'ai'), '{}'::jsonb)
         || coalesce((select value from spms_settings where org_id = p_org and scope = v_unit and key = 'ai'), '{}'::jsonb) into s;
  if coalesce(s ->> 'enabled', '0') not in ('1', 'true') then raise exception 'AI belum diaktifkan. Admin dapat mengaktifkannya di Pengaturan → AI.' using hint = 'AI_OFF'; end if;
  if not exists (select 1 from spms_ai_keys where org_id = p_org) then raise exception 'API key AI belum diisi admin (Pengaturan → AI).' using hint = 'AI_OFF'; end if;
  select count(*) into v_used from spms_ai_runs where org_id = p_org and ts >= date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  v_lim := public.spms_plan_limit(p_org, 'ai');
  if v_used >= v_lim then raise exception 'Kuota AI bulan ini habis (%/%). Upgrade paket lisensi untuk kuota lebih besar.', v_used, v_lim using hint = 'QUOTA'; end if;
  return jsonb_build_object('ok', true, 'user_id', auth.uid(), 'unit', v_unit, 'provider', coalesce(nullif(s ->> 'provider', ''), 'gemini'),
                            'model', coalesce(nullif(s ->> 'model', ''), 'gemini-2.5-flash'), 'base_url', coalesce(s ->> 'base_url', ''), 'used', v_used, 'limit', v_lim);
end $$;
revoke execute on function public.spms_ai_check(uuid, text) from public, anon;
grant execute on function public.spms_ai_check(uuid, text) to authenticated;

-- HANYA untuk Edge Function (kunci server). Tidak bisa dipanggil dari browser.
create or replace function public.spms_ai_key_get(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select api_key from spms_ai_keys where org_id = p_org;
$$;
create or replace function public.spms_ai_log(p_org uuid, p_user uuid, p_unit text, p_provider text, p_model text, p_kind text,
                                              p_tin int, p_tout int, p_status text)
returns void language sql volatile security definer set search_path = public as $$
  insert into spms_ai_runs (org_id, user_id, unit_id, provider, model, kind, tokens_in, tokens_out, status)
  values (p_org, p_user, p_unit, left(p_provider, 40), left(p_model, 80), left(p_kind, 20), greatest(coalesce(p_tin, 0), 0), greatest(coalesce(p_tout, 0), 0), left(p_status, 120));
$$;
revoke execute on function public.spms_ai_key_get(uuid) from public, anon, authenticated;
revoke execute on function public.spms_ai_log(uuid, uuid, text, text, text, text, int, int, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.spms_ai_key_get(uuid) to service_role;
    grant execute on function public.spms_ai_log(uuid, uuid, text, text, text, text, int, int, text) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. spms_apply: + aksi aiVision (rekomendasi hasil analisis foto; sama dengan versi GAS)
-- ---------------------------------------------------------------------
create or replace function public.spms_apply(p_org uuid, p_action text, p_ent text, p_ops jsonb,
                                             p_op_id text default null, p_result jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid(); v_prev jsonb; o jsonb; v_t text; v_e text; v_tbl text; v_mod text; r jsonb; c jsonb;
  v_cols text; v_set text; v_n int; k text; v_ins boolean; v_upd boolean; v_main text[];
  v_allow jsonb; v_derived jsonb := '{}'::jsonb; v_grant jsonb := '{}'::jsonb; v_letter text;
  n_ins int := 0; n_upd int := 0; n_aud int := 0;
begin
  if v_uid is null then raise exception 'Sesi berakhir. Silakan login kembali.' using hint = 'UNAUTHENTICATED'; end if;
  if not public.is_member(p_org) then raise exception 'Bukan anggota organisasi ini.' using hint = 'FORBIDDEN'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 then raise exception 'Tidak ada perubahan.' using hint = 'VALIDATION'; end if;
  if jsonb_array_length(p_ops) > 6000 then raise exception 'Terlalu banyak perubahan dalam satu aksi (maks 6000).' using hint = 'VALIDATION'; end if;

  -- anti-dobel (sinkron offline)
  if p_op_id is not null then
    select result into v_prev from spms_sync_ops where user_id = v_uid and op_id = p_op_id;
    if found then return jsonb_build_object('ok', true, 'dup', true, 'result', v_prev); end if;
  end if;

  if not public.has_license(p_org, 'spms') then
    raise exception 'Lisensi SPMS tidak aktif / sudah berakhir. Aplikasi dalam mode baca-saja: data tetap dapat dilihat & diekspor.' using hint = 'READ_ONLY';
  end if;

  -- ---- izin utama per aksi (sama dengan need_() versi GAS) & tabel yang boleh ditulis ----
  v_ins := exists (select 1 from jsonb_array_elements(p_ops) x where x ->> 't' = 'ins' and x ->> 'e' = p_ent);
  v_upd := exists (select 1 from jsonb_array_elements(p_ops) x where x ->> 't' = 'upd' and x ->> 'e' = p_ent);
  if p_ent is not null then select module into v_mod from spms_entities where ent = p_ent; end if;
  case p_action
    when 'save' then
      if v_mod is null then raise exception 'Entitas tidak dikenal: %', p_ent using hint = 'VALIDATION'; end if;
      if p_ent in ('Jurnal', 'JurnalBaris') then raise exception 'Gunakan menu Keuangan untuk mencatat jurnal.' using hint = 'VALIDATION'; end if;
      v_main := array[p_ent];
      if v_ins and not public.spms_can(p_org, v_mod, 'C') then v_letter := 'C'; end if;
      if v_upd and not public.spms_can(p_org, v_mod, 'U') then v_letter := 'U'; end if;
      v_derived := case p_ent when 'Bidang' then '{"BidangVersi":"C"}' when 'Pohon' then '{"EventPohon":"C"}'
                              when 'Pemupukan' then '{"MutasiStok":"CU"}' when 'Panen' then '{"Jurnal":"","JurnalBaris":""}'
                              when 'Organisasi' then '{"Akun":""}' else '{}' end::jsonb;
    when 'bulkSave' then
      if v_mod is null then raise exception 'Entitas tidak dikenal: %', p_ent using hint = 'VALIDATION'; end if;
      v_main := array[p_ent];
      if v_ins and not public.spms_can(p_org, v_mod, 'C') then v_letter := 'C'; end if;
      if v_upd and not public.spms_can(p_org, v_mod, 'U') then v_letter := 'U'; end if;
    when 'remove' then
      if v_mod is null then raise exception 'Entitas tidak dikenal: %', p_ent using hint = 'VALIDATION'; end if;
      if p_ent in ('Jurnal', 'JurnalBaris') then raise exception 'Jurnal tidak dapat dihapus. Gunakan jurnal pembalik.' using hint = 'VALIDATION'; end if;
      v_main := array[p_ent];
      if not public.spms_can(p_org, v_mod, 'D') then v_letter := 'D'; end if;
      if v_ins or exists (select 1 from jsonb_array_elements(p_ops) x where x ->> 't' = 'upd' and x ->> 'e' = p_ent
                            and coalesce(x -> 'patch' ->> 'deleted', '') not in ('1', 'true')) then
        raise exception 'Aksi hapus hanya boleh menandai data terhapus.' using hint = 'VALIDATION';
      end if;
      v_derived := case p_ent when 'Pemupukan' then '{"MutasiStok":"U"}' else '{}' end::jsonb;
    when 'saveSurvey' then
      v_main := array['Survei', 'TitikSurvei'];
      if not public.spms_can(p_org, 'survey', 'C') then v_mod := 'survey'; v_letter := 'C'; end if;
      v_derived := '{"Bidang":"U","BidangVersi":"C","Survei":"U"}';
    when 'parcelTransition' then
      v_main := array['Bidang'];
      v_letter := case when exists (select 1 from jsonb_array_elements(p_ops) x where x ->> 'e' = 'Bidang'
                                      and x -> 'patch' ->> 'status' in ('verified', 'approved', 'rejected', 'superseded')) then 'A' else 'U' end;
      if public.spms_can(p_org, 'parcel', v_letter) then v_letter := null; else v_mod := 'parcel'; end if;
      v_derived := '{"Survei":"U"}';
    when 'replaceTree' then
      v_main := array['Pohon', 'EventPohon'];
      if not (public.spms_can(p_org, 'tree', 'C') and public.spms_can(p_org, 'tree', 'U')) then v_mod := 'tree'; v_letter := 'CU'; end if;
    when 'uploadMedia' then
      v_main := array['Media'];
      if not public.spms_can(p_org, 'media', 'C') then v_mod := 'media'; v_letter := 'C'; end if;
      v_derived := '{"EventPohon":"C"}';
    when 'aiVision' then
      v_main := array['Rekomendasi'];
      if not public.spms_can(p_org, 'ai', 'R') then v_mod := 'ai'; v_letter := 'R'; end if;
      v_derived := '{"Rekomendasi":"C"}';
    when 'journalPost', 'quickTxn' then
      v_main := array['Jurnal', 'JurnalBaris'];
      if not public.spms_can(p_org, 'finance', 'C') then v_mod := 'finance'; v_letter := 'C'; end if;
    when 'journalReverse' then
      v_main := array['Jurnal', 'JurnalBaris'];
      if not public.spms_can(p_org, 'finance', 'A') then v_mod := 'finance'; v_letter := 'A'; end if;
      v_derived := '{"Jurnal":"CU","JurnalBaris":"C"}';
    else
      raise exception 'Aksi tulis tidak dikenal: %', p_action using hint = 'VALIDATION';
  end case;
  if v_letter is not null then
    raise exception 'Akses ditolak: role Anda tidak memiliki izin "%" pada modul %.', v_letter, coalesce(v_mod, p_ent) using hint = 'FORBIDDEN';
  end if;

  -- tabel di luar daftar aksi ditolak
  for o in select * from jsonb_array_elements(p_ops) loop
    v_e := o ->> 'e';
    if o ->> 't' = 'audit' then continue; end if;
    if o ->> 't' not in ('ins', 'upd') then raise exception 'Jenis perubahan tidak dikenal.' using hint = 'VALIDATION'; end if;
    if not (v_e = any (v_main) or v_derived ? v_e) then
      raise exception 'Aksi % tidak boleh mengubah data %.', p_action, v_e using hint = 'FORBIDDEN';
    end if;
    -- izin sementara hanya untuk tabel turunan yang benar-benar ditulis
    if v_derived ? v_e and coalesce(v_derived ->> v_e, '') <> '' then
      select module into v_mod from spms_entities where ent = v_e;
      v_grant := v_grant || jsonb_build_object(v_mod, coalesce(v_grant ->> v_mod, '') || (v_derived ->> v_e));
    end if;
  end loop;
  if v_grant <> '{}'::jsonb then
    perform set_config('spms.grant', jsonb_build_object('org', p_org, 'perms', v_grant)::text, true);
  end if;

  -- ---- tulis (sebagai pengguna: RLS & trigger Tahap 1 tetap berlaku di setiap baris) ----
  for o in select * from jsonb_array_elements(p_ops) loop
    v_t := o ->> 't'; v_e := o ->> 'e';
    if v_t = 'audit' then
      r := o -> 'row';
      insert into spms_audit (id, org_id, ts, user_id, username, unit_id, action, entity, entity_id, detail)
      values (coalesce(nullif(r ->> 'id', ''), replace(gen_random_uuid()::text, '-', '')), p_org, now(), v_uid, r ->> 'username', nullif(r ->> 'org_id', ''),
              r ->> 'action', r ->> 'entity', r ->> 'entity_id', left(r ->> 'detail', 4000));   -- tanpa ON CONFLICT: itu menuntut izin baca audit
      n_aud := n_aud + 1;
      continue;
    end if;
    select tbl into v_tbl from spms_entities where ent = v_e;
    r := case when v_t = 'ins' then o -> 'row' else o -> 'patch' end;
    if r is null or jsonb_typeof(r) <> 'object' then raise exception 'Data perubahan % kosong.', v_e using hint = 'VALIDATION'; end if;
    select jsonb_object_agg(f.col, public.spms_clean(f.typ, r -> f.col)) into c from spms_fields f where f.ent = v_e and r ? f.col;
    c := coalesce(c, '{}'::jsonb);
    for k in select key from jsonb_each_text(c) where value = '#GEOM_GAGAL' loop
      raise exception 'Geometri % tidak valid.', k using hint = 'VALIDATION';
    end loop;
    if r ? 'org_id' and v_e <> 'Organisasi' then c := c || jsonb_build_object('unit_id', nullif(r ->> 'org_id', '')); end if;
    if r ? 'deleted' then c := c || jsonb_build_object('deleted', coalesce(r ->> 'deleted', '') in ('1', 'true')); end if;
    if v_t = 'ins' then
      if coalesce(r ->> 'id', '') !~ '^[A-Za-z0-9_.:-]{1,80}$' then raise exception 'ID data tidak valid.' using hint = 'VALIDATION'; end if;
      c := c || jsonb_build_object('id', r ->> 'id', 'org_id', p_org,
                                   'created_at', coalesce(nullif(r ->> 'created_at', ''), now()::text), 'created_by', v_uid);
      if v_e = 'Organisasi' then c := c || jsonb_build_object('unit_id', null); end if;
      select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(c) key;
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', v_tbl, v_cols, v_cols, v_tbl) using c;
      exception when unique_violation then
        raise exception 'Data % dengan kode/ID yang sama sudah ada. Muat ulang lalu coba lagi.', v_e using hint = 'CONFLICT';
      end;
      n_ins := n_ins + 1;
    else
      c := c - 'id' - 'org_id' - 'created_at' - 'created_by';
      if c = '{}'::jsonb then continue; end if;
      select string_agg(format('%I = x.%I', key, key), ', ') into v_set from jsonb_object_keys(c) key;
      begin
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) x where t.id = $2 and t.org_id = $3', v_tbl, v_set, v_tbl)
          using c, o ->> 'id', p_org;
      exception when unique_violation then
        raise exception 'Kode % sudah dipakai data lain. Muat ulang lalu coba lagi.', v_e using hint = 'CONFLICT';
      end;
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'Data % tidak ditemukan atau di luar akses Anda.', v_e using hint = 'FORBIDDEN'; end if;
      n_upd := n_upd + 1;
    end if;
  end loop;

  perform set_config('spms.grant', '', true);
  if p_op_id is not null then
    insert into spms_sync_ops (user_id, op_id, org_id, action, result) values (v_uid, p_op_id, p_org, p_action, p_result);
  end if;
  return jsonb_build_object('ok', true, 'inserted', n_ins, 'updated', n_upd, 'audit', n_aud, 'server_time', now());
end $$;
revoke execute on function public.spms_apply(uuid, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.spms_apply(uuid, text, text, jsonb, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
