-- =====================================================================
-- SPMS — TAHAP 2a: tampilan SPMS membaca data dari Supabase
-- Jalankan SETELAH 1_spms_modul.sql & 2_spms_impor.sql (Tahap 1).
-- Isi:
--   spms_whoami(org)      siapa saya: organisasi, role SPMS, unit, petani, izin, lisensi
--   spms_users_list(org)  daftar pengguna (anggota Platform Inti + pengguna lama yang belum daftar)
--   spms_capacity(org)    jumlah baris per data + ukuran database (pengganti "Kapasitas Google Sheets")
-- Data tabel dibaca langsung lewat REST Supabase dan tetap dijaga RLS Tahap 1.
-- Aman dijalankan ulang.
-- =====================================================================

do $$ begin
  if to_regclass('public.spms_petani') is null or to_regprocedure('public.spms_ctx()') is null then
    raise exception 'Tahap 1 SPMS belum terpasang. Jalankan dulu 1_spms_modul.sql dan 2_spms_impor.sql.';
  end if;
end $$;

-- alamat aplikasi di Beranda Platform Inti (tombol Buka muncul setelah status 'aktif')
update public.apps set url = 'spms/' where code = 'spms' and coalesce(url, '') = '';

-- ---------------------------------------------------------------------
-- SIAPA SAYA
-- ---------------------------------------------------------------------
create or replace function public.spms_whoami(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_org uuid; c jsonb; l record; p record; v_legacy text;
begin
  if v_uid is null then
    raise exception 'Sesi berakhir. Silakan login kembali.' using hint = 'UNAUTHENTICATED';
  end if;
  -- organisasi: yang diminta (bila anggota) → yang punya lisensi SPMS → yang pertama
  select m.org_id into v_org from memberships m
   where m.user_id = v_uid
   order by (m.org_id = p_org) desc nulls last, public.has_license(m.org_id, 'spms') desc, m.created_at
   limit 1;
  if v_org is null then
    raise exception 'Akun ini belum menjadi anggota organisasi mana pun. Minta Owner menambahkan email Anda di menu Anggota Platform Inti.' using hint = 'NO_ORG';
  end if;
  c := public.spms_ctx() -> (v_org::text);
  select plan, valid_until, active, max_users into l from licenses where org_id = v_org and app_code = 'spms';
  select pr.email, pr.full_name, pr.phone, pr.avatar_url, au.last_sign_in_at into p
    from profiles pr left join auth.users au on au.id = pr.id where pr.id = v_uid;
  select legacy_user_id into v_legacy from spms_members where org_id = v_org and user_id = v_uid;
  return jsonb_build_object(
    'org', (select jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug) from organizations o where o.id = v_org),
    'orgs', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name), '[]'::jsonb)
               from organizations o join memberships m on m.org_id = o.id where m.user_id = v_uid),
    'user', jsonb_build_object('id', v_uid, 'email', p.email, 'name', coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)),
                               'phone', p.phone, 'avatar_url', p.avatar_url, 'last_login', p.last_sign_in_at, 'legacy_id', v_legacy),
    'role', c ->> 'r', 'scope', c ->> 's', 'unit', c ->> 'u', 'farmer', c ->> 'f',
    'perms', c -> 'p', 'licensed', coalesce((c ->> 'l')::boolean, false),
    'license', case when l.plan is null then null else jsonb_build_object('plan', l.plan, 'valid_until', l.valid_until, 'active', l.active, 'max_users', l.max_users) end,
    'server_time', now());
end $$;
revoke execute on function public.spms_whoami(uuid) from public, anon;
grant execute on function public.spms_whoami(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- DAFTAR PENGGUNA (bentuk sama dengan sheet Users versi GAS, tanpa password)
-- ---------------------------------------------------------------------
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
        'farmer_id', coalesce(s.farmer_id, ''), 'photo', coalesce(pr.avatar_url, ''), 'status', 'Aktif', 'must_change', 0,
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
revoke execute on function public.spms_users_list(uuid) from public, anon;
grant execute on function public.spms_users_list(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- KAPASITAS: baris per data + ukuran database (admin)
-- ---------------------------------------------------------------------
create or replace function public.spms_capacity(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e record; n bigint; t jsonb := '[]'::jsonb; total bigint := 0;
begin
  if coalesce(public.spms_role(p_org), '') not in ('super_admin', 'org_admin') then
    raise exception 'Khusus admin.' using hint = 'FORBIDDEN';
  end if;
  for e in select * from spms_entities order by ord loop
    execute format('select count(*) from public.%I where org_id = $1', e.tbl) into n using p_org;
    total := total + n;
    if n > 0 then t := t || jsonb_build_array(jsonb_build_object('name', e.label, 'rows', n)); end if;
  end loop;
  return jsonb_build_object('rows', total, 'tables', t, 'db_bytes', pg_database_size(current_database()),
                            'photos', (select count(*) from spms_media where org_id = p_org and not deleted));
end $$;
revoke execute on function public.spms_capacity(uuid) from public, anon;
grant execute on function public.spms_capacity(uuid) to authenticated;

notify pgrst, 'reload schema';
