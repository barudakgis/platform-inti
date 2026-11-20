-- =====================================================================
-- PLATFORM INTI — 004 STORAGE (foto, dokumen, logo)
-- Aturan path: <org_id>/<nama-folder>/<nama-file>
--   files    : privat, hanya anggota organisasi
--   branding : publik (logo & foto profil), hanya admin yang unggah
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800),      -- 50 MB per file
       ('branding', 'branding', true, 2097152)   -- 2 MB per file
on conflict (id) do nothing;

-- fungsi bantu: ambil org_id dari segmen pertama path, aman bila bukan UUID
create or replace function public.storage_org(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end $$;

-- FILES (privat) ------------------------------------------------------
drop policy if exists files_select on storage.objects;
create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.is_member(public.storage_org(name)));

drop policy if exists files_insert on storage.objects;
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.can_edit(public.storage_org(name)));

drop policy if exists files_update on storage.objects;
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and public.can_edit(public.storage_org(name)));

drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.is_admin(public.storage_org(name)));

-- BRANDING (publik dibaca, admin menulis) -----------------------------
-- Bucket publik sudah bisa dibaca lewat URL publik tanpa policy select.
drop policy if exists branding_insert on storage.objects;
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin(public.storage_org(name)));

drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin(public.storage_org(name)));

drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin(public.storage_org(name)));

-- FOTO PROFIL: setiap anggota boleh mengelola fotonya sendiri di
--   branding/<org_id>/avatars/<user_id>-<apa saja>
drop policy if exists avatar_insert on storage.objects;
create policy avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
              and split_part(name, '/', 2) = 'avatars'
              and split_part(name, '/', 3) like auth.uid()::text || '-%'
              and public.is_member(public.storage_org(name)));

drop policy if exists avatar_update on storage.objects;
create policy avatar_update on storage.objects for update to authenticated
  using (bucket_id = 'branding'
         and split_part(name, '/', 2) = 'avatars'
         and split_part(name, '/', 3) like auth.uid()::text || '-%');

drop policy if exists avatar_delete on storage.objects;
create policy avatar_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
         and split_part(name, '/', 2) = 'avatars'
         and split_part(name, '/', 3) like auth.uid()::text || '-%');
