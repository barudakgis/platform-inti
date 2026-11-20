-- =====================================================================
-- TEMPLATE MODUL BARU
-- 1. Salin file ini ke supabase/migrations/<tanggal>_<kode>.sql
--    contoh: 20261201000001_invoice.sql
-- 2. Ganti semua "contoh" dengan kode aplikasi (huruf kecil, tanpa spasi)
--    dan "contoh_data" dengan nama tabel.
-- 3. Ubah kolom-kolom sesuai kebutuhan aplikasi.
-- 4. Jalankan di SQL Editor (atau: npx supabase db push)
-- =====================================================================

-- (a) daftarkan aplikasi di katalog
insert into public.apps (code, name, description, category, status, icon, default_trial_days, sort)
values ('contoh', 'Aplikasi Contoh', 'Deskripsi singkat', 'Bisnis', 'dev', '📦', 14, 100)
on conflict (code) do nothing;

-- (b) tabel data — WAJIB punya org_id
create table if not exists public.contoh_data (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  nama        text not null,
  jumlah      numeric(18,2) default 0,
  tanggal     date default current_date,
  status      text not null default 'draft' check (status in ('draft', 'final', 'batal')),
  catatan     text,
  -- lokasi opsional (hapus bila tidak perlu)
  geom        extensions.geometry(Point, 4326),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists contoh_data_org_idx on public.contoh_data(org_id);

-- (c) updated_at + audit otomatis
drop trigger if exists contoh_data_updated on public.contoh_data;
create trigger contoh_data_updated before update on public.contoh_data
  for each row execute function public.set_updated_at();
drop trigger if exists contoh_data_audit on public.contoh_data;
create trigger contoh_data_audit after insert or update or delete on public.contoh_data
  for each row execute function public.audit_trigger();

-- (d) keamanan: anggota + lisensi + role
alter table public.contoh_data enable row level security;

drop policy if exists contoh_select on public.contoh_data;
create policy contoh_select on public.contoh_data for select to authenticated
  using (public.is_member(org_id) and public.has_license(org_id, 'contoh'));

drop policy if exists contoh_insert on public.contoh_data;
create policy contoh_insert on public.contoh_data for insert to authenticated
  with check (public.can_edit(org_id) and public.has_license(org_id, 'contoh'));

drop policy if exists contoh_update on public.contoh_data;
create policy contoh_update on public.contoh_data for update to authenticated
  using (public.can_edit(org_id))
  with check (public.can_edit(org_id) and public.has_license(org_id, 'contoh'));

drop policy if exists contoh_delete on public.contoh_data;
create policy contoh_delete on public.contoh_data for delete to authenticated
  using (public.is_admin(org_id));

-- (e) beri lisensi trial ke organisasi yang SUDAH ada (organisasi baru
--     otomatis dapat bila status aplikasi 'aktif')
-- insert into public.licenses (org_id, app_code, plan, valid_until)
-- select id, 'contoh', 'trial', current_date + 14 from public.organizations
-- on conflict (org_id, app_code) do nothing;
