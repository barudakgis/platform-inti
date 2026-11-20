-- =====================================================================
-- PLATFORM INTI — 002 ROW LEVEL SECURITY
-- Aturan dasar: user hanya bisa melihat data organisasi tempat ia
-- menjadi anggota. Semua penulisan dicek role-nya.
-- =====================================================================

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.memberships   enable row level security;
alter table public.apps          enable row level security;
alter table public.licenses      enable row level security;
alter table public.audit_log     enable row level security;

-- ORGANIZATIONS -------------------------------------------------------
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select to authenticated using (public.is_member(id));

drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations
  for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists org_delete on public.organizations;
create policy org_delete on public.organizations
  for delete to authenticated
  using (public.has_role(id, array['owner']::public.org_role[]));
-- INSERT sengaja tidak dibuka: wajib lewat RPC create_organization()

-- PROFILES ------------------------------------------------------------
drop policy if exists profile_select on public.profiles;
create policy profile_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (select 1 from public.memberships m1
               join public.memberships m2 on m1.org_id = m2.org_id
               where m1.user_id = auth.uid() and m2.user_id = profiles.id)
  );

drop policy if exists profile_update on public.profiles;
create policy profile_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- MEMBERSHIPS ---------------------------------------------------------
drop policy if exists member_select on public.memberships;
create policy member_select on public.memberships
  for select to authenticated using (public.is_member(org_id));

-- admin boleh ubah/hapus anggota, kecuali baris owner (hanya owner)
drop policy if exists member_update on public.memberships;
create policy member_update on public.memberships
  for update to authenticated
  using (public.is_admin(org_id)
         and (role <> 'owner' or public.has_role(org_id, array['owner']::public.org_role[])))
  with check (public.is_admin(org_id)
         and (role <> 'owner' or public.has_role(org_id, array['owner']::public.org_role[])));

drop policy if exists member_delete on public.memberships;
create policy member_delete on public.memberships
  for delete to authenticated
  using (
    user_id = auth.uid()   -- boleh keluar sendiri
    or (public.is_admin(org_id)
        and (role <> 'owner' or public.has_role(org_id, array['owner']::public.org_role[])))
  );
-- INSERT lewat RPC add_member() / create_organization()

-- APPS (katalog, bisa dibaca semua user login) -------------------------
drop policy if exists apps_select on public.apps;
create policy apps_select on public.apps for select to authenticated using (true);

-- LICENSES (hanya dibaca anggota; diubah oleh pemilik platform) --------
drop policy if exists lic_select on public.licenses;
create policy lic_select on public.licenses
  for select to authenticated using (public.is_member(org_id));

-- AUDIT LOG (hanya admin organisasi yang bisa membaca) -----------------
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (public.is_admin(org_id));

-- Hak eksekusi RPC
revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.add_member(uuid, text, public.org_role) from public, anon;
grant  execute on function public.create_organization(text, text) to authenticated;
grant  execute on function public.add_member(uuid, text, public.org_role) to authenticated;
