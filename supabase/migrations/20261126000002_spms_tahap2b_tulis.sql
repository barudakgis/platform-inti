-- =====================================================================
-- SPMS — TAHAP 2b: menyimpan data ke Supabase
-- Jalankan SETELAH Tahap 1 dan Tahap 2a. Aman dijalankan ulang.
--
-- Cara kerja:
--   Aplikasi menjalankan aturan bisnis SPMS (validasi, versi bidang, stok, jurnal, riwayat pohon)
--   lalu mengirim SEMUA perubahan satu aksi dalam satu paket ke spms_apply().
--   spms_apply():
--     1. memeriksa izin UTAMA aksi itu (sama dengan need_() di versi GAS) + lisensi aktif,
--     2. hanya menerima tabel yang memang ditulis aksi itu,
--     3. memberi izin tambahan SEMENTARA (hanya di transaksi ini) untuk tabel turunan,
--        mis. simpan survei ikut memperbarui geometri bidang,
--     4. menulis sebagai pengguna itu sendiri → RLS Tahap 1 tetap memeriksa
--        organisasi, unit & kepemilikan petani di SETIAP baris,
--     5. semua-atau-tidak-sama-sekali (satu transaksi), dan anti-dobel untuk sinkron offline (op_id).
-- =====================================================================

do $$ begin
  if to_regprocedure('public.spms_whoami(uuid)') is null then
    raise exception 'Tahap 2a SPMS belum terpasang. Jalankan dulu 20261126000001_spms_tahap2a_baca.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Izin sementara di dalam transaksi spms_apply (spms.grant) ikut dihitung di spms_ctx()
-- ---------------------------------------------------------------------
create or replace function public.spms_merge_perms(p jsonb, g jsonb)
returns jsonb language sql immutable as $$
  select case when g is null or jsonb_typeof(g) <> 'object' then p else
    coalesce(p, '{}'::jsonb) || coalesce((select jsonb_object_agg(k, coalesce(p ->> k, '') || v) from jsonb_each_text(g) e(k, v)), '{}'::jsonb) end;
$$;

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
         where m.user_id = auth.uid()) x
  join spms_roles r on r.role = x.role;
$$;

-- ---------------------------------------------------------------------
-- Kwitansi sinkron (anti-dobel saat Mode Lapangan mengirim ulang)
-- ---------------------------------------------------------------------
create table if not exists public.spms_sync_ops (
  user_id     uuid not null,
  op_id       text not null check (length(op_id) between 4 and 80),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  action      text,
  result      jsonb,
  created_at  timestamptz not null default now(),
  primary key (user_id, op_id)
);
create index if not exists spms_sync_ops_org on public.spms_sync_ops(org_id, created_at);
alter table public.spms_sync_ops enable row level security;
drop policy if exists spms_sync_ops_own on public.spms_sync_ops;
create policy spms_sync_ops_own on public.spms_sync_ops for all to authenticated
  using (user_id = auth.uid() and public.is_member(org_id)) with check (user_id = auth.uid() and public.is_member(org_id));
grant select, insert on public.spms_sync_ops to authenticated;
revoke all on public.spms_sync_ops from anon;

-- ---------------------------------------------------------------------
-- Penjaga pembukuan: setiap jurnal harus seimbang (debit = kredit) dan minimal 2 baris
-- (diperiksa di akhir transaksi; dilewati saat impor data lama)
-- ---------------------------------------------------------------------
create or replace function public.spms_jurnal_seimbang() returns trigger language plpgsql security definer set search_path = public as $$
declare d numeric; c numeric; n int; jid text := coalesce(new.journal_id, old.journal_id);
begin
  if current_setting('spms.importing', true) = '1' or jid is null then return null; end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) into d, c, n from spms_jurnal_baris where journal_id = jid and not deleted;
  if n > 0 and (n < 2 or abs(d - c) > 0.005) then
    raise exception 'Jurnal tidak seimbang / kurang dari 2 baris (debit % ≠ kredit %).', d, c using hint = 'VALIDATION';
  end if;
  return null;
end $$;
drop trigger if exists spms_jurnal_baris_seimbang on public.spms_jurnal_baris;
create constraint trigger spms_jurnal_baris_seimbang after insert or update on public.spms_jurnal_baris
  deferrable initially deferred for each row execute function public.spms_jurnal_seimbang();

-- ---------------------------------------------------------------------
-- spms_apply: tulis satu paket perubahan
--   p_ops: [{ t:'ins', e:'Pohon', row:{…baris bentuk GAS…} }, { t:'upd', e:'Bidang', id, patch:{…} }, { t:'audit', row:{…} }]
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
