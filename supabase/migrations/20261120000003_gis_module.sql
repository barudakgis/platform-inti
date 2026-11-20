-- =====================================================================
-- MODUL CONTOH: GIS (kode aplikasi: 'gis')
-- Pola ini dipakai ulang untuk setiap modul/aplikasi baru:
--   1) tabel punya org_id
--   2) RLS: anggota + lisensi aktif + role
--   3) audit trigger
-- =====================================================================

create table if not exists public.gis_layers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  geom_type   text not null default 'Mixed'
              check (geom_type in ('Point', 'LineString', 'Polygon', 'Mixed')),
  style       jsonb not null default '{"color":"#16a34a"}'::jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gis_layers_org_idx on public.gis_layers(org_id);

create table if not exists public.gis_features (
  -- id boleh dikirim dari aplikasi (UUID buatan HP) agar sinkron offline
  -- tidak menghasilkan data ganda
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  layer_id    uuid not null references public.gis_layers(id) on delete cascade,
  properties  jsonb not null default '{}'::jsonb,
  geom        extensions.geometry(Geometry, 4326) not null,
  area_ha     numeric,          -- dihitung otomatis (poligon)
  length_m    numeric,          -- dihitung otomatis (garis)
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gis_features_geom_idx  on public.gis_features using gist (geom);
create index if not exists gis_features_layer_idx on public.gis_features(layer_id);
create index if not exists gis_features_org_idx   on public.gis_features(org_id);

-- Hitung luas/panjang + samakan org_id dengan layer
create or replace function public.gis_features_before()
returns trigger language plpgsql set search_path = public, extensions as $$
declare v_org uuid;
begin
  select org_id into v_org from gis_layers where id = new.layer_id;
  if v_org is null then raise exception 'Layer tidak ditemukan'; end if;
  new.org_id := v_org;

  if not ST_IsValid(new.geom) then new.geom := ST_MakeValid(new.geom); end if;

  new.area_ha := case when GeometryType(new.geom) in ('POLYGON', 'MULTIPOLYGON')
                      then round((ST_Area(new.geom::geography) / 10000)::numeric, 4) end;
  new.length_m := case when GeometryType(new.geom) in ('LINESTRING', 'MULTILINESTRING')
                       then round(ST_Length(new.geom::geography)::numeric, 2) end;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists gis_features_before on public.gis_features;
create trigger gis_features_before before insert or update on public.gis_features
  for each row execute function public.gis_features_before();

drop trigger if exists gis_layers_updated on public.gis_layers;
create trigger gis_layers_updated before update on public.gis_layers
  for each row execute function public.set_updated_at();

drop trigger if exists gis_layers_audit on public.gis_layers;
create trigger gis_layers_audit after insert or update or delete on public.gis_layers
  for each row execute function public.audit_trigger();
drop trigger if exists gis_features_audit on public.gis_features;
create trigger gis_features_audit after insert or update or delete on public.gis_features
  for each row execute function public.audit_trigger();

-- RLS -----------------------------------------------------------------
alter table public.gis_layers   enable row level security;
alter table public.gis_features enable row level security;

drop policy if exists gis_layers_select on public.gis_layers;
create policy gis_layers_select on public.gis_layers for select to authenticated
  using (public.is_member(org_id) and public.has_license(org_id, 'gis'));
drop policy if exists gis_layers_insert on public.gis_layers;
create policy gis_layers_insert on public.gis_layers for insert to authenticated
  with check (public.can_edit(org_id) and public.has_license(org_id, 'gis'));
drop policy if exists gis_layers_update on public.gis_layers;
create policy gis_layers_update on public.gis_layers for update to authenticated
  using (public.can_edit(org_id)) with check (public.can_edit(org_id) and public.has_license(org_id, 'gis'));
drop policy if exists gis_layers_delete on public.gis_layers;
create policy gis_layers_delete on public.gis_layers for delete to authenticated
  using (public.is_admin(org_id));

drop policy if exists gis_features_select on public.gis_features;
create policy gis_features_select on public.gis_features for select to authenticated
  using (public.is_member(org_id) and public.has_license(org_id, 'gis'));
drop policy if exists gis_features_insert on public.gis_features;
create policy gis_features_insert on public.gis_features for insert to authenticated
  with check (public.can_edit(org_id) and public.has_license(org_id, 'gis'));
drop policy if exists gis_features_update on public.gis_features;
create policy gis_features_update on public.gis_features for update to authenticated
  using (public.can_edit(org_id)) with check (public.can_edit(org_id) and public.has_license(org_id, 'gis'));
drop policy if exists gis_features_delete on public.gis_features;
create policy gis_features_delete on public.gis_features for delete to authenticated
  using (public.can_edit(org_id));

-- =====================================================================
-- RPC GIS (security invoker → RLS tetap berlaku)
-- =====================================================================

-- Ambil fitur satu layer sebagai GeoJSON FeatureCollection.
-- p_bbox opsional: [minLng, minLat, maxLng, maxLat]
create or replace function public.gis_features_geojson(p_layer uuid, p_bbox float8[] default null,
                                                       p_limit int default 5000)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
        'type', 'Feature',
        'id', f.id,
        'geometry', ST_AsGeoJSON(f.geom, 7)::jsonb,
        'properties', f.properties || jsonb_build_object(
            '_id', f.id, '_area_ha', f.area_ha, '_length_m', f.length_m,
            '_updated_at', f.updated_at)
    )), '[]'::jsonb))
  from (
    select * from gis_features
    where layer_id = p_layer
      and (p_bbox is null or geom && ST_MakeEnvelope(p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], 4326))
    order by updated_at desc
    limit least(greatest(p_limit, 1), 20000)
  ) f;
$$;

-- Simpan/ubah satu fitur (idempoten: aman dikirim ulang saat sinkron offline)
create or replace function public.gis_upsert_feature(p_id uuid, p_layer uuid, p_geometry jsonb,
                                                     p_properties jsonb default '{}'::jsonb)
returns uuid language plpgsql set search_path = public, extensions as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  insert into gis_features(id, org_id, layer_id, properties, geom)
  values (v_id,
          (select org_id from gis_layers where id = p_layer),
          p_layer,
          coalesce(p_properties, '{}'::jsonb),
          ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::text), 4326))
  on conflict (id) do update
    set properties = excluded.properties,
        geom       = excluded.geom,
        layer_id   = excluded.layer_id;
  return v_id;
end $$;

-- Impor FeatureCollection GeoJSON (EPSG:4326) ke sebuah layer.
-- Mengembalikan jumlah fitur yang masuk.
create or replace function public.gis_import_geojson(p_layer uuid, p_fc jsonb)
returns int language plpgsql set search_path = public, extensions as $$
declare v_org uuid; v_count int;
begin
  select org_id into v_org from gis_layers where id = p_layer;
  if v_org is null then raise exception 'Layer tidak ditemukan / tidak punya akses'; end if;

  insert into gis_features(id, org_id, layer_id, properties, geom)
  select case when f->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (f->>'id')::uuid else gen_random_uuid() end,
         v_org, p_layer,
         coalesce(f->'properties', '{}'::jsonb) - '_id' - '_area_ha' - '_length_m' - '_updated_at',
         ST_SetSRID(ST_GeomFromGeoJSON((f->'geometry')::text), 4326)
  from jsonb_array_elements(p_fc->'features') f
  where f->'geometry' is not null and jsonb_typeof(f->'geometry') = 'object'
  on conflict (id) do update set properties = excluded.properties, geom = excluded.geom;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Ringkasan layer
create or replace function public.gis_layer_stats(p_layer uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'jumlah', count(*),
    'total_luas_ha', coalesce(round(sum(area_ha), 2), 0),
    'total_panjang_m', coalesce(round(sum(length_m), 1), 0),
    'bbox', case when count(*) > 0 then
       jsonb_build_array(ST_XMin(ST_Extent(geom)), ST_YMin(ST_Extent(geom)),
                         ST_XMax(ST_Extent(geom)), ST_YMax(ST_Extent(geom))) end)
  from gis_features where layer_id = p_layer;
$$;

grant execute on function public.gis_features_geojson(uuid, float8[], int) to authenticated;
grant execute on function public.gis_upsert_feature(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.gis_import_geojson(uuid, jsonb) to authenticated;
grant execute on function public.gis_layer_stats(uuid) to authenticated;
