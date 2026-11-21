-- =====================================================================
-- MODUL UMG — TAHAP 2a: BACA DATA
-- Pengganti aksi GAS (05_Api.gs): health, branding.get, boot,
-- features.list, users.list, audit.list, license.status.
-- (auth.login/logout, db.info, media.get dikerjakan langsung di browser
--  lewat Supabase Auth & Storage — lihat umg/supa-api.js.)
--
-- Jalankan SEKALI di Supabase → SQL Editor (aman dijalankan ulang).
-- Tidak mengubah / menghapus data apa pun.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Lisensi habis = BACA-SAJA (sama seperti versi GAS)
--    Tahap 1: tanpa lisensi aktif, data tidak bisa dibaca sama sekali.
--    Sekarang: selama organisasi PERNAH punya lisensi UMG, data tetap
--    bisa dilihat & diekspor; menulis tetap butuh lisensi aktif.
-- ---------------------------------------------------------------------
create or replace function public.umg2_can(p_org uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    case when p_perm in ('feature.read', 'export', 'audit.read')
         then exists (select 1 from licenses where org_id = p_org and app_code = 'umg')
         else public.has_license(p_org, 'umg') end
    and case public.umg2_role(p_org)
      when 'admin' then true
      when 'supervisor' then p_perm = any (array['project.write','layer.write','feature.read','feature.write.any',
                                                 'feature.review','audit.read','export'])
      when 'surveyor' then p_perm = any (array['feature.read','feature.write.own','export'])
      when 'viewer' then p_perm = any (array['feature.read','export'])
      else false end, false);
$$;

-- ---------------------------------------------------------------------
-- 1. FUNGSI BANTU (internal — tidak bisa dipanggil langsung dari aplikasi)
-- ---------------------------------------------------------------------

-- Versi "server" yang tampil di menu Tentang
create or replace function public.umg2_server_info()
returns jsonb language sql immutable as $$
  select jsonb_build_object('name', 'Universal Mobile Mapping GIS', 'version', '1.10.3',
                            'build', '2026-11-22 · Supabase 2a');
$$;

-- Organisasi UMG yang dipakai user ini (pilihan terakhir bila masih valid)
create or replace function public.umg2_pick_org(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.org_id
  from memberships m join organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
    and exists (select 1 from licenses l where l.org_id = m.org_id and l.app_code = 'umg')
  order by (m.org_id = p_org) desc nulls last, o.name
  limit 1;
$$;

-- Daftar izin per role (sama persis dengan PERMS di 00_Config.gs)
create or replace function public.umg2_perms(p_role text)
returns jsonb language sql immutable as $$
  select case p_role
    when 'admin' then '["*"]'::jsonb
    when 'supervisor' then '["project.write","layer.write","feature.read","feature.write.any","feature.review","audit.read","export"]'::jsonb
    when 'surveyor' then '["feature.read","feature.write.own","export"]'::jsonb
    when 'viewer' then '["feature.read","export"]'::jsonb
    else '[]'::jsonb end;
$$;

-- Pengaturan tampilan (pengganti settings() di GAS)
-- Logo: logo UMG (bila berupa alamat https) → logo organisasi Platform Inti
create or replace function public.umg2_settings_pub(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; o jsonb; v_logo text;
begin
  select coalesce(settings, '{}'::jsonb) into s from umg2_settings where org_id = p_org;
  select coalesce(settings, '{}'::jsonb) into o from organizations where id = p_org;
  s := coalesce(s, '{}'::jsonb); o := coalesce(o, '{}'::jsonb);
  v_logo := case when coalesce(s->>'logo', '') ~ '^https://' then s->>'logo'
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

-- Role UMG milik user mana pun (umg2_role hanya untuk user yang sedang login)
create or replace function public.umg2_role_of(p_org uuid, p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from umg2_members where org_id = p_org and user_id = p_uid),
    (select case m.role when 'owner' then 'admin' when 'admin' then 'admin'
                        when 'editor' then 'surveyor' else 'viewer' end
       from memberships m where m.org_id = p_org and m.user_id = p_uid));
$$;

-- Satu pengguna dalam bentuk pubUser() GAS
create or replace function public.umg2_pub_user(p_org uuid, p_uid uuid, p_full boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_full then
      jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(p.full_name, ''), p.email, '-'),
        'role', public.umg2_role_of(p_org, m.user_id), 'has_photo', coalesce(p.avatar_url, '') <> '',
        'username', coalesce(p.email, ''), 'status', 'active',
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

-- Semua anggota organisasi + nama user lama (GAS) yang tercatat di data,
-- agar kolom "dibuat oleh" tetap menampilkan nama, bukan kode.
create or replace function public.umg2_users_json(p_org uuid, p_full boolean, p_with_legacy boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb; v_legacy jsonb := '[]'::jsonb; v_ids text[];
begin
  select coalesce(jsonb_agg(public.umg2_pub_user(p_org, m.user_id, p_full) order by p.full_name nulls last, p.email), '[]'::jsonb)
    into v_out
  from memberships m join profiles p on p.id = m.user_id
  where m.org_id = p_org;

  if p_with_legacy and to_regclass('public.umg_users') is not null then
    select array_agg(distinct x) into v_ids from (
      select legacy_created_by x from umg2_features where org_id = p_org and created_by is null and legacy_created_by is not null
      union select legacy_updated_by from umg2_features where org_id = p_org and updated_by is null and legacy_updated_by is not null
      union select legacy_review_by from umg2_features where org_id = p_org and review_by is null and legacy_review_by is not null
      union select legacy_created_by from umg2_projects where org_id = p_org and created_by is null and legacy_created_by is not null
    ) t;
    if v_ids is not null then
      begin
        execute $q$
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', u.id, 'name', coalesce(nullif(u.name, ''), u.username, '-') || ' (akun lama)',
                   'role', case when u.role in ('admin','supervisor','surveyor','viewer') then u.role else 'viewer' end,
                   'has_photo', false, 'legacy', true)), '[]'::jsonb)
          from public.umg_users u where u.id = any($1)
        $q$ into v_legacy using v_ids;
      exception when others then v_legacy := '[]'::jsonb;   -- struktur tabel lama berbeda: abaikan
      end;
    end if;
  end if;
  return v_out || v_legacy;
end $$;

-- Pesan galat dengan kode (dibaca aplikasi dari kolom "hint")
create or replace function public.umg2_fail(p_code text, p_msg text)
returns void language plpgsql as $$
begin raise exception using message = p_msg, hint = p_code; end $$;

-- ---------------------------------------------------------------------
-- 2. AKSI YANG DIPANGGIL APLIKASI (supabase.rpc)
-- ---------------------------------------------------------------------

-- health — cek server & database (boleh tanpa login)
create or replace function public.umg2_health()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select public.umg2_server_info() || jsonb_build_object(
    'app', 'Universal Mobile Mapping GIS', 'status', 'ok', 'time', now(),
    'db', jsonb_build_object('ok', true, 'backend', 'supabase', 'postgis', extensions.postgis_lib_version()));
$$;

-- branding.get — judul, warna, logo. Tanpa login: tampilan bawaan saja.
create or replace function public.umg2_branding(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; s jsonb;
begin
  if auth.uid() is not null then v_org := public.umg2_pick_org(p_org); end if;
  if v_org is null then
    return jsonb_build_object('title', 'Universal Mobile Mapping GIS', 'subtitle', 'Enterprise Field Mapping',
      'accent', '#0f766e', 'logo_url', '', 'logo_ver', '', 'pmtiles_default', '',
      'app', 'Universal Mobile Mapping GIS', 'version', public.umg2_server_info()->>'version');
  end if;
  s := public.umg2_settings_pub(v_org) - 'maptiler_key';   -- kunci API tidak dibagikan di layar login
  return s || jsonb_build_object('app', 'Universal Mobile Mapping GIS', 'version', public.umg2_server_info()->>'version');
end $$;

-- license.status — status lisensi UMG organisasi (dari tabel licenses Platform Inti)
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
    'used_users', (select count(*) from memberships where org_id = v_org),
    'used_features', (select count(*) from umg2_features where org_id = v_org and not deleted),
    -- pengganti "Script ID": kode organisasi, untuk dikirim ke penyedia saat perpanjangan
    'script_id', case when public.umg2_role(v_org) = 'admin' then v_org::text else '' end);
end $$;

-- features.list — data lapangan per halaman (maks. 2000 per panggilan)
create or replace function public.umg2_features_page(
  p_org uuid default null, p_project text default null, p_since text default null,
  p_offset int default 0, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_org uuid := public.umg2_pick_org(p_org);
  v_since timestamptz := public.umg2_ts(p_since);
  v_lim int := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_total int; v_items jsonb;
begin
  if v_org is null or not public.umg2_can(v_org, 'feature.read') then
    perform public.umg2_fail('FORBIDDEN', 'Anda tidak punya izin melihat data UMG di organisasi ini.');
  end if;
  select count(*) into v_total from umg2_features f
  where f.org_id = v_org and (p_project is null or p_project = '' or f.project_id = p_project)
    and (case when v_since is not null then f.updated_at > v_since else not f.deleted end);
  select coalesce(jsonb_agg(public.umg2_pub_feature(f) order by f.updated_at, f.id), '[]'::jsonb) into v_items
  from (select * from umg2_features f
        where f.org_id = v_org and (p_project is null or p_project = '' or f.project_id = p_project)
          and (case when v_since is not null then f.updated_at > v_since else not f.deleted end)
        order by f.updated_at, f.id offset v_off limit v_lim) f;
  return jsonb_build_object('items', v_items, 'total', v_total,
                            'next', case when v_off + v_lim < v_total then v_off + v_lim end);
end $$;

-- boot — semua data awal dalam SATU panggilan (hemat kuota & cepat di HP)
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

-- users.list — halaman Administrasi → Pengguna (khusus admin)
create or replace function public.umg2_users_list(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.umg2_pick_org(p_org);
begin
  if v_org is null or public.umg2_role(v_org) is distinct from 'admin' then
    perform public.umg2_fail('FORBIDDEN', 'Hanya admin yang dapat melihat daftar pengguna.');
  end if;
  return public.umg2_users_json(v_org, true, false);
end $$;

-- audit.list — riwayat perubahan (admin & supervisor)
create or replace function public.umg2_audit_list(p_org uuid default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.umg2_pick_org(p_org);
begin
  if v_org is null or not public.umg2_can(v_org, 'audit.read') then
    perform public.umg2_fail('FORBIDDEN', 'Anda tidak punya izin melihat riwayat.');
  end if;
  return (
    select coalesce(jsonb_agg(r order by (r->>'ts') desc), '[]'::jsonb) from (
      select case when a.table_name = 'umg_legacy' then
          jsonb_build_object('ts', a.created_at,
            'user_id', coalesce(a.user_id::text, a.new_data->>'legacy_user', ''),
            'action', a.action, 'entity', coalesce(a.new_data->>'entity', ''),
            'entity_id', coalesce(a.record_id, ''),
            'detail', case when jsonb_typeof(a.new_data->'detail') = 'string' then a.new_data->>'detail'
                           else coalesce((a.new_data->'detail')::text, '') end)
        else
          jsonb_build_object('ts', a.created_at, 'user_id', coalesce(a.user_id::text, ''),
            'action', e.plural || '.' || case
                when a.action = 'insert' then 'create'
                when a.action = 'delete' then 'delete'
                when coalesce(a.new_data->>'deleted', '') = 'true' and coalesce(a.old_data->>'deleted', '') <> 'true' then 'delete'
                when e.plural = 'features' and a.new_data->>'status' is distinct from a.old_data->>'status' then 'review'
                else 'update' end,
            'entity', e.single, 'entity_id', coalesce(a.record_id, ''),
            'detail', coalesce(jsonb_strip_nulls(jsonb_build_object(
                'name', coalesce(a.new_data, a.old_data)->>'name',
                'status', coalesce(a.new_data, a.old_data)->>'status',
                'role', coalesce(a.new_data, a.old_data)->>'role',
                'version', coalesce(a.new_data, a.old_data)->'version'))::text, ''))
        end as r
      from audit_log a
      left join (values ('umg2_projects', 'projects', 'project'), ('umg2_layers', 'layers', 'layer'),
                        ('umg2_features', 'features', 'feature'), ('umg2_settings', 'settings', 'config'),
                        ('umg2_members', 'users', 'user')) e(tbl, plural, single) on e.tbl = a.table_name
      where a.org_id = v_org and (a.table_name = 'umg_legacy' or e.tbl is not null)
      order by a.created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x);
end $$;

-- ---------------------------------------------------------------------
-- 3. HAK AKSES
-- ---------------------------------------------------------------------
-- fungsi bantu: hanya dipakai dari dalam fungsi lain
revoke execute on function public.umg2_pick_org(uuid) from public, anon, authenticated;
revoke execute on function public.umg2_settings_pub(uuid) from public, anon, authenticated;
revoke execute on function public.umg2_pub_user(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.umg2_role_of(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.umg2_users_json(uuid, boolean, boolean) from public, anon, authenticated;

-- aksi untuk aplikasi
revoke execute on function public.umg2_boot(uuid, text) from public, anon;
revoke execute on function public.umg2_features_page(uuid, text, text, int, int) from public, anon;
revoke execute on function public.umg2_users_list(uuid) from public, anon;
revoke execute on function public.umg2_audit_list(uuid, int) from public, anon;
revoke execute on function public.umg2_license_status(uuid) from public, anon;
grant execute on function public.umg2_boot(uuid, text) to authenticated;
grant execute on function public.umg2_features_page(uuid, text, text, int, int) to authenticated;
grant execute on function public.umg2_users_list(uuid) to authenticated;
grant execute on function public.umg2_audit_list(uuid, int) to authenticated;
grant execute on function public.umg2_license_status(uuid) to authenticated;
grant execute on function public.umg2_health() to anon, authenticated;
grant execute on function public.umg2_branding(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CEK CEPAT (opsional) — jalankan baris di bawah satu per satu:
--   select public.umg2_health();
--   select id, name from organizations;
-- =====================================================================
