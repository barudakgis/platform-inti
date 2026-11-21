-- =====================================================================
-- MODUL UMG — TAHAP 2b: SIMPAN · SINKRON · REVIEW · PROYEK · LAYER
-- Pengganti aksi GAS (05_Api.gs): sync.push, features.review,
-- projects.save, projects.delete, layers.save, layers.delete.
-- Semua aturan validasi meniru GAS (validateAttrs, validateSchema,
-- validateStyle, checkSchemaChange, applyOp, 04_Geo.gs).
--
-- Jalankan SEKALI di Supabase → SQL Editor (aman dijalankan ulang).
-- Butuh Tahap 1 + Tahap 2a sudah terpasang. Tidak menghapus data apa pun.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. KONSTANTA & BANTUAN UMUM
-- ---------------------------------------------------------------------
create or replace function public.umg2_jstr(v jsonb)
returns text language sql immutable as $$
  select case when v is null or jsonb_typeof(v) = 'null' then null else v #>> '{}' end;
$$;

create or replace function public.umg2_empty(v jsonb)
returns boolean language sql immutable as $$
  select v is null or jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and v #>> '{}' = '');
$$;

-- "truthy" ala JavaScript (true, angka ≠ 0, teks tidak kosong, objek/daftar)
create or replace function public.umg2_truthy(v jsonb)
returns boolean language sql immutable as $$
  select case jsonb_typeof(v)
    when 'boolean' then v::text = 'true'
    when 'number' then (v #>> '{}')::numeric <> 0
    when 'string' then v #>> '{}' <> ''
    when 'object' then true when 'array' then true else false end;
$$;

create or replace function public.umg2_now_local(p_datetime boolean)
returns text language sql stable as $$
  select to_char(now() at time zone 'Asia/Jakarta', case when p_datetime then 'YYYY-MM-DD"T"HH24:MI' else 'YYYY-MM-DD' end);
$$;

-- Nomor ID otomatis berikutnya: PREFIX + 4 digit, melanjutkan angka terbesar
create or replace function public.umg2_next_auto_id(p_prefix text, p_vals text[])
returns text language sql immutable as $$
  select p_prefix || lpad((coalesce(max(substr(v, length(p_prefix) + 1)::numeric), 0) + 1)::text, 4, '0')
  from unnest(coalesce(p_vals, '{}')) v
  where v is not null and left(v, length(p_prefix)) = p_prefix and substr(v, length(p_prefix) + 1) ~ '^\d+$';
$$;

create or replace function public.umg2_symbol_keys()
returns text[] language sql immutable as $$
  select array['circle','square','triangle','diamond','cross','pentagon','factory','house','building','warehouse','shop','govt',
    'school','hospital','mosque','church','temple','police','fire','hotel','food','field','airport','port','boat','truck','bus',
    'train','parking','fuel','tree','forest','leaf','grass','grain','farm','mountain','pest','animal','water','river','waterplant',
    'tower','power','solar','oil','waste','construction','lab','camera','flag','pin','info','warning','star'];
$$;

-- Jenis hitung otomatis & tipe geometri yang cocok (Geo.CALC)
create or replace function public.umg2_calc_types(p_calc text)
returns text[] language sql immutable as $$
  select case p_calc
    when 'area_ha' then array['Polygon'] when 'area_m2' then array['Polygon'] when 'perimeter_m' then array['Polygon']
    when 'length_m' then array['LineString'] when 'count_in' then array['Polygon']
    when 'vertices' then array['LineString','Polygon']
    when 'x' then array['Point','LineString','Polygon'] when 'y' then array['Point','LineString','Polygon']
    when 'utm_x' then array['Point','LineString','Polygon'] when 'utm_y' then array['Point','LineString','Polygon']
    when 'utm_zone' then array['Point','LineString','Polygon'] end;
$$;

-- Izin per role TANPA syarat lisensi (untuk membedakan pesan "role" vs "lisensi")
create or replace function public.umg2_role_allows(p_role text, p_perm text)
returns boolean language sql immutable as $$
  select coalesce(case p_role when 'admin' then true
    when 'supervisor' then p_perm = any (array['project.write','layer.write','feature.read','feature.write.any','feature.review','audit.read','export'])
    when 'surveyor' then p_perm = any (array['feature.read','feature.write.own','export'])
    when 'viewer' then p_perm = any (array['feature.read','export']) else false end, false);
$$;

-- Pastikan boleh menulis: role punya izin + lisensi aktif (License.assertWritable)
create or replace function public.umg2_require_write(p_org uuid, p_perms text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.umg2_role(p_org); v_lic jsonb;
begin
  if v_role is null then perform public.umg2_fail('FORBIDDEN', 'Anda bukan anggota organisasi ini.'); end if;
  if not exists (select 1 from unnest(p_perms) p where public.umg2_role_allows(v_role, p)) then
    perform public.umg2_fail('FORBIDDEN', 'Role Anda tidak dapat melakukan tindakan ini.');
  end if;
  if not public.has_license(p_org, 'umg') then
    v_lic := public.umg2_license_status(p_org);
    perform public.umg2_fail('LICENSE_READ_ONLY', coalesce(nullif(v_lic->>'message', ''), 'Lisensi tidak aktif; mode baca-saja.'));
  end if;
  return v_role;
end $$;

-- Organisasi + kunci antrean tulis per organisasi (pengganti LockService GAS)
create or replace function public.umg2_write_org(p_org uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_pick_org(p_org);
begin
  if auth.uid() is null then perform public.umg2_fail('UNAUTHENTICATED', 'Sesi berakhir. Silakan login kembali.'); end if;
  if v_org is null then perform public.umg2_fail('NO_ORG', 'Akun ini belum terdaftar di organisasi yang memakai UMG.'); end if;
  perform pg_advisory_xact_lock(hashtext('umg2:' || v_org::text));
  return v_org;
end $$;

-- Catatan riwayat khusus (konflik sinkron dll.) — tampil di Administrasi → Riwayat
create or replace function public.umg2_event(p_org uuid, p_action text, p_entity text, p_id text, p_detail jsonb)
returns void language sql volatile security definer set search_path = public as $$
  insert into audit_log(org_id, user_id, table_name, action, record_id, new_data)
  values (p_org, auth.uid(), 'umg2_event', p_action, p_id, jsonb_build_object('entity', p_entity, 'detail', p_detail));
$$;

-- ---------------------------------------------------------------------
-- 1. GEOMETRI (port 04_Geo.gs — rumus bola yang sama agar luas/panjang identik)
-- ---------------------------------------------------------------------
create or replace function public.umg2_haversine(a jsonb, b jsonb)
returns double precision language plpgsql immutable as $$
declare r constant double precision := 6378137; k constant double precision := pi() / 180;
  dlat double precision := ((b->>1)::float8 - (a->>1)::float8) * k;
  dlon double precision := ((b->>0)::float8 - (a->>0)::float8) * k;
  h double precision;
begin
  h := sin(dlat / 2) ^ 2 + cos((a->>1)::float8 * k) * cos((b->>1)::float8 * k) * sin(dlon / 2) ^ 2;
  return 2 * r * asin(least(1, sqrt(h)));
end $$;

create or replace function public.umg2_line_length(c jsonb)
returns double precision language plpgsql immutable as $$
declare d double precision := 0; i int;
begin
  for i in 1 .. jsonb_array_length(c) - 1 loop d := d + public.umg2_haversine(c->(i - 1), c->i); end loop;
  return d;
end $$;

create or replace function public.umg2_ring_area(ring jsonb)
returns double precision language plpgsql immutable as $$
declare r constant double precision := 6378137; k constant double precision := pi() / 180;
  n int := jsonb_array_length(ring); area double precision := 0; i int; lo jsonb; mi jsonb; up jsonb;
begin
  if n > 1 and ring->0 = ring->(n - 1) then n := n - 1; end if;
  if n < 3 then return 0; end if;
  for i in 0 .. n - 1 loop
    lo := ring->i; mi := ring->((i + 1) % n); up := ring->((i + 2) % n);
    area := area + ((up->>0)::float8 * k - (lo->>0)::float8 * k) * sin((mi->>1)::float8 * k);
  end loop;
  return abs(area * r * r / 2);
end $$;

create or replace function public.umg2_metrics(g jsonb)
returns jsonb language plpgsql immutable as $$
declare outer_a double precision; i int; c jsonb := g->'coordinates';
begin
  if g->>'type' = 'LineString' then return jsonb_build_object('length_m', round(public.umg2_line_length(c)::numeric, 2)); end if;
  if g->>'type' = 'Polygon' then
    outer_a := public.umg2_ring_area(c->0);
    for i in 1 .. jsonb_array_length(c) - 1 loop outer_a := outer_a - public.umg2_ring_area(c->i); end loop;
    return jsonb_build_object('area_m2', round(outer_a::numeric, 2), 'area_ha', round(round((outer_a / 100)::numeric) / 100, 2),
                              'perimeter_m', round(public.umg2_line_length(c->0)::numeric, 2));
  end if;
  return '{}'::jsonb;
end $$;

-- Pembulatan koordinat 7 desimal (ketinggian 2 desimal) — Geo.round
create or replace function public.umg2_round_pos(p jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_array(round((p->>0)::numeric, 7), round((p->>1)::numeric, 7))
         || case when jsonb_array_length(p) > 2 and jsonb_typeof(p->2) = 'number' then jsonb_build_array(round((p->>2)::numeric, 2)) else '[]'::jsonb end;
$$;

create or replace function public.umg2_round_geom(g jsonb)
returns jsonb language sql immutable as $$
  select case g->>'type'
    when 'Point' then jsonb_build_object('type', 'Point', 'coordinates', public.umg2_round_pos(g->'coordinates'))
    when 'LineString' then jsonb_build_object('type', 'LineString', 'coordinates',
      (select jsonb_agg(public.umg2_round_pos(p) order by o) from jsonb_array_elements(g->'coordinates') with ordinality t(p, o)))
    else jsonb_build_object('type', 'Polygon', 'coordinates',
      (select jsonb_agg((select jsonb_agg(public.umg2_round_pos(p) order by o) from jsonb_array_elements(r) with ordinality t(p, o)) order by ro)
       from jsonb_array_elements(g->'coordinates') with ordinality s(r, ro))) end;
$$;

create or replace function public.umg2_bbox(g jsonb)
returns jsonb language sql immutable as $$
  with pts as (
    select p from (select g->'coordinates' p where g->>'type' = 'Point') a
    union all select p from jsonb_array_elements(case when g->>'type' = 'LineString' then g->'coordinates' else '[]' end) p
    union all select p from jsonb_array_elements(case when g->>'type' = 'Polygon' then g->'coordinates' else '[]' end) r,
                            jsonb_array_elements(r) p)
  select jsonb_build_array(round(min((p->>0)::numeric), 7), round(min((p->>1)::numeric), 7),
                           round(max((p->>0)::numeric), 7), round(max((p->>1)::numeric), 7)) from pts;
$$;

-- Satu posisi: valid? (pesan galat sama dengan checkPos)
create or replace function public.umg2_check_pos(p jsonb, p_where text)
returns text language plpgsql immutable as $$
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < 2 or jsonb_array_length(p) > 4 then return 'Koordinat ' || p_where || ' tidak valid.'; end if;
  if jsonb_typeof(p->0) <> 'number' or jsonb_typeof(p->1) <> 'number' then return 'Koordinat ' || p_where || ' bukan angka.'; end if;
  if (p->>0)::numeric < -180 or (p->>0)::numeric > 180 then return 'Bujur (lon) ' || p_where || ' di luar rentang -180..180.'; end if;
  if (p->>1)::numeric < -90 or (p->>1)::numeric > 90 then return 'Lintang (lat) ' || p_where || ' di luar rentang -90..90.'; end if;
  return null;
end $$;

-- Validasi geometri terhadap tipe layer (Geo.validate) → {ok, errors, bbox, metrics}
create or replace function public.umg2_geo_validate(g jsonb, p_expected text, p_work_area jsonb, p_max_vertices int default 20000)
returns jsonb language plpgsql immutable set search_path = public, extensions as $$
declare errs text[] := '{}'; c jsonb; e text; ring jsonb; ri int; i int; n int; vertices int := 0; bb jsonb;
begin
  if g is null or jsonb_typeof(g) <> 'object' then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Geometri kosong.')); end if;
  if coalesce(g->>'type', '') not in ('Point', 'LineString', 'Polygon') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Tipe geometri "' || coalesce(g->>'type', 'undefined') || '" tidak didukung.'));
  end if;
  if p_expected is not null and g->>'type' <> p_expected then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Tipe geometri ' || (g->>'type') || ' tidak sesuai layer (' || p_expected || ').'));
  end if;
  c := g->'coordinates';
  if c is null or jsonb_typeof(c) <> 'array' or jsonb_array_length(c) = 0 then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Geometri kosong (tanpa koordinat).'));
  end if;
  if g->>'type' = 'Point' then
    e := public.umg2_check_pos(c, 'titik'); if e is not null then errs := errs || e; end if; vertices := 1;
  elsif g->>'type' = 'LineString' then
    if jsonb_array_length(c) < 2 then errs := errs || 'Garis minimal 2 titik.'::text; end if;
    for i in 0 .. jsonb_array_length(c) - 1 loop
      exit when cardinality(errs) >= 5;
      e := public.umg2_check_pos(c->i, '#' || (i + 1)); if e is not null then errs := errs || e; end if;
    end loop;
    vertices := jsonb_array_length(c);
    if cardinality(errs) = 0 and public.umg2_line_length(c) <= 0 then errs := errs || 'Panjang garis nol.'::text; end if;
  else
    for ri in 0 .. jsonb_array_length(c) - 1 loop
      ring := c->ri;
      if jsonb_typeof(ring) <> 'array' or jsonb_array_length(ring) < 4 then
        errs := errs || ('Ring ' || (ri + 1) || ' minimal 4 posisi (tertutup).'); continue;
      end if;
      n := jsonb_array_length(ring);
      for i in 0 .. n - 1 loop
        exit when cardinality(errs) >= 5;
        e := public.umg2_check_pos(ring->i, 'ring ' || (ri + 1) || ' #' || (i + 1)); if e is not null then errs := errs || e; end if;
      end loop;
      vertices := vertices + n;
      if cardinality(errs) = 0 and not ((ring->0->0) = (ring->(n - 1)->0) and (ring->0->1) = (ring->(n - 1)->1)) then
        errs := errs || ('Ring ' || (ri + 1) || ' tidak tertutup.');
      end if;
      if cardinality(errs) = 0 and n - 1 <= 3000 and not ST_IsSimple(ST_GeomFromGeoJSON(jsonb_build_object('type', 'LineString',
           'coordinates', (select jsonb_agg(jsonb_build_array(p->0, p->1) order by o) from jsonb_array_elements(ring) with ordinality t(p, o)))::text)) then
        errs := errs || ('Ring ' || (ri + 1) || ' berpotongan sendiri (self-intersection).');
      end if;
    end loop;
    if cardinality(errs) = 0 and public.umg2_ring_area(c->0) <= 0.01 then errs := errs || 'Luas poligon nol / terlalu kecil.'::text; end if;
  end if;
  if vertices > coalesce(p_max_vertices, 20000) then errs := errs || ('Jumlah vertex (' || vertices || ') melebihi batas.'); end if;
  if cardinality(errs) > 0 then return jsonb_build_object('ok', false, 'errors', to_jsonb(errs), 'vertices', vertices); end if;
  bb := public.umg2_bbox(g);
  if p_work_area is not null and jsonb_typeof(p_work_area) = 'array' and jsonb_array_length(p_work_area) = 4 and (
       (bb->>0)::numeric < (p_work_area->>0)::numeric or (bb->>1)::numeric < (p_work_area->>1)::numeric
    or (bb->>2)::numeric > (p_work_area->>2)::numeric or (bb->>3)::numeric > (p_work_area->>3)::numeric) then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Geometri berada di luar area kerja proyek.'), 'vertices', vertices);
  end if;
  return jsonb_build_object('ok', true, 'errors', '[]'::jsonb, 'bbox', bb, 'metrics', public.umg2_metrics(g), 'vertices', vertices);
end $$;

-- WGS84 → UTM (Geo.toUTM)
create or replace function public.umg2_utm(lon double precision, lat double precision)
returns jsonb language plpgsql immutable as $$
declare a constant float8 := 6378137; f constant float8 := 1 / 298.257223563; k0 constant float8 := 0.9996; tr constant float8 := pi() / 180;
  zone int := floor((lon + 180) / 6) + 1; lon0 float8; e2 float8; ep2 float8; phi float8; lam float8;
  nn float8; t float8; cc float8; aa float8; m float8; x float8; y float8;
begin
  lon0 := ((zone - 1) * 6 - 180 + 3) * tr; e2 := f * (2 - f); ep2 := e2 / (1 - e2); phi := lat * tr; lam := lon * tr;
  nn := a / sqrt(1 - e2 * sin(phi) ^ 2); t := tan(phi) ^ 2; cc := ep2 * cos(phi) ^ 2; aa := cos(phi) * (lam - lon0);
  m := a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ^ 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ^ 3 / 1024) * sin(2 * phi)
       + (15 * e2 * e2 / 256 + 45 * e2 ^ 3 / 1024) * sin(4 * phi) - (35 * e2 ^ 3 / 3072) * sin(6 * phi));
  x := k0 * nn * (aa + (1 - t + cc) * aa ^ 3 / 6 + (5 - 18 * t + t * t + 72 * cc - 58 * ep2) * aa ^ 5 / 120) + 500000;
  y := k0 * (m + nn * tan(phi) * (aa * aa / 2 + (5 - t + 9 * cc + 4 * cc * cc) * aa ^ 4 / 24 + (61 - 58 * t + t * t + 600 * cc - 330 * ep2) * aa ^ 6 / 720));
  if lat < 0 then y := y + 10000000; end if;
  return jsonb_build_object('zone', zone, 'easting', round(x::numeric, 2), 'northing', round(y::numeric, 2));
end $$;

-- Titik wakil geometri (Geo.center): titik, centroid poligon, atau tengah panjang garis
create or replace function public.umg2_center(g jsonb)
returns double precision[] language plpgsql immutable as $$
declare r jsonb; c jsonb; i int; j int; aa float8 := 0; cx float8 := 0; cy float8 := 0; cr float8; half float8; acc float8 := 0; d float8; t float8;
begin
  if g is null then return null; end if;
  if g->>'type' like 'Multi%' then g := jsonb_build_object('type', substr(g->>'type', 6), 'coordinates', g->'coordinates'->0); end if;
  if g->>'type' = 'Point' then return array[(g->'coordinates'->>0)::float8, (g->'coordinates'->>1)::float8]; end if;
  if g->>'type' = 'Polygon' then
    r := g->'coordinates'->0; j := jsonb_array_length(r) - 1;
    for i in 0 .. jsonb_array_length(r) - 1 loop
      cr := (r->j->>0)::float8 * (r->i->>1)::float8 - (r->i->>0)::float8 * (r->j->>1)::float8;
      aa := aa + cr; cx := cx + ((r->j->>0)::float8 + (r->i->>0)::float8) * cr; cy := cy + ((r->j->>1)::float8 + (r->i->>1)::float8) * cr;
      j := i;
    end loop;
    if aa = 0 then return array[(r->0->>0)::float8, (r->0->>1)::float8]; end if;
    return array[cx / (3 * aa), cy / (3 * aa)];
  end if;
  c := g->'coordinates'; half := public.umg2_line_length(c) / 2;
  for i in 1 .. jsonb_array_length(c) - 1 loop
    d := public.umg2_haversine(c->(i - 1), c->i);
    if acc + d >= half and d > 0 then
      t := (half - acc) / d;
      return array[(c->(i - 1)->>0)::float8 + t * ((c->i->>0)::float8 - (c->(i - 1)->>0)::float8),
                   (c->(i - 1)->>1)::float8 + t * ((c->i->>1)::float8 - (c->(i - 1)->>1)::float8)];
    end if;
    acc := acc + d;
  end loop;
  return array[(c->0->>0)::float8, (c->0->>1)::float8];
end $$;

-- Nilai atribut hitung otomatis (Geo.calcValue)
create or replace function public.umg2_calc_value(fd jsonb, g jsonb, p_org uuid, p_self text)
returns numeric language plpgsql stable set search_path = public, extensions as $$
declare m jsonb; c float8[]; poly geometry; n int;
begin
  if g is null or fd->>'calc' is null then return null; end if;
  case fd->>'calc'
    when 'area_ha', 'area_m2', 'perimeter_m', 'length_m' then
      m := public.umg2_metrics(g); return (m->>(fd->>'calc'))::numeric;
    when 'x' then c := public.umg2_center(g); return round(c[1]::numeric, 7);
    when 'y' then c := public.umg2_center(g); return round(c[2]::numeric, 7);
    when 'utm_x' then c := public.umg2_center(g); return (public.umg2_utm(c[1], c[2])->>'easting')::numeric;
    when 'utm_y' then c := public.umg2_center(g); return (public.umg2_utm(c[1], c[2])->>'northing')::numeric;
    when 'utm_zone' then c := public.umg2_center(g); return (public.umg2_utm(c[1], c[2])->>'zone')::numeric;
    when 'vertices' then
      if g->>'type' = 'LineString' then return jsonb_array_length(g->'coordinates'); end if;
      return (select sum(jsonb_array_length(r) - 1) from jsonb_array_elements(g->'coordinates') r);
    when 'count_in' then
      if fd->>'calc_layer' is null then return null; end if;
      poly := ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON(g::text)), 4326);
      select count(*) into n from umg2_features x
      where x.org_id = p_org and x.layer_id = fd->>'calc_layer' and not x.deleted and x.id <> p_self and x.geom is not null
        and x.geom && poly
        and ST_Covers(poly, case when GeometryType(x.geom) = 'POINT' then ST_Force2D(x.geom)
              else (select ST_SetSRID(ST_MakePoint(cc[1], cc[2]), 4326) from (select public.umg2_center(ST_AsGeoJSON(x.geom)::jsonb) cc) z) end);
      return n;
    else return null;
  end case;
end $$;

create or replace function public.umg2_apply_calc(p_schema jsonb, p_attrs jsonb, g jsonb, p_org uuid, p_self text)
returns jsonb language plpgsql stable as $$
declare fd jsonb; v numeric;
begin
  for fd in select * from jsonb_array_elements(coalesce(p_schema, '[]')) loop
    continue when fd->>'calc' is null;
    v := public.umg2_calc_value(fd, g, p_org, p_self);
    if v is null then p_attrs := p_attrs - (fd->>'key');
    else p_attrs := jsonb_set(p_attrs, array[fd->>'key'], to_jsonb(case when fd->>'type' = 'integer' then round(v) else v end));
    end if;
  end loop;
  return p_attrs;
end $$;

-- ---------------------------------------------------------------------
-- 2. ATRIBUT, RELASI, SKEMA, GAYA (port validateAttrs dkk.)
-- ---------------------------------------------------------------------
create or replace function public.umg2_validate_attrs(p_org uuid, p_schema jsonb, p_attrs jsonb, p_existing jsonb,
                                                      p_is_new boolean, p_layer text, p_self text)
returns jsonb language plpgsql stable set search_path = public as $$
declare errs text[] := '{}'; out jsonb := '{}'; fd jsonb; k text; lbl text; v jsonb; vt text; old jsonb := coalesce(p_existing, '{}');
  peers jsonb[]; peers_loaded boolean := false; n numeric; ok boolean;
begin
  if p_attrs is null or jsonb_typeof(p_attrs) <> 'object' then p_attrs := '{}'; end if;
  for fd in select * from jsonb_array_elements(coalesce(p_schema, '[]')) loop
    k := fd->>'key'; lbl := coalesce(fd->>'label', k);
    continue when fd->>'calc' is not null;
    v := p_attrs->k;
    if fd->>'type' = 'date' and public.umg2_truthy(fd->'locked') and not p_is_new and not public.umg2_empty(old->k) then
      out := jsonb_set(out, array[k], old->k); continue;
    end if;
    if fd->>'type' = 'date' and public.umg2_truthy(fd->'auto_now') and p_is_new and public.umg2_empty(v) then
      v := to_jsonb(public.umg2_now_local(fd->>'format' = 'datetime'));
    end if;
    if public.umg2_truthy(fd->'unique') and fd ? 'auto_id' and jsonb_typeof(fd->'auto_id') <> 'null' and fd->>'type' = 'text'
       and (public.umg2_empty(v) or trim(public.umg2_jstr(v)) = '') then
      if not p_is_new and public.umg2_truthy(old->k) then v := old->k;
      else
        if not peers_loaded then
          select coalesce(array_agg(attrs), '{}') into peers from umg2_features
          where org_id = p_org and layer_id = p_layer and not deleted and id <> p_self;
          peers_loaded := true;
        end if;
        v := to_jsonb(public.umg2_next_auto_id(coalesce(fd->>'auto_id', ''), (select array_agg(public.umg2_jstr(a->k)) from unnest(peers) a)));
      end if;
    end if;
    if public.umg2_empty(v) then
      if public.umg2_truthy(fd->'required') or public.umg2_truthy(fd->'unique') then errs := errs || ('"' || lbl || '" wajib diisi.'); end if;
      continue;
    end if;
    vt := public.umg2_jstr(v);
    case fd->>'type'
      when 'number' then
        n := case when jsonb_typeof(v) = 'number' then vt::numeric
                  when jsonb_typeof(v) = 'boolean' then case when vt = 'true' then 1 else 0 end
                  when trim(vt) ~ '^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$' then trim(vt)::numeric end;
        if n is null then errs := errs || ('"' || coalesce(fd->>'label', '') || '" harus angka.'); else out := jsonb_set(out, array[k], to_jsonb(n)); end if;
      when 'integer' then
        if vt !~ '^-?\d+$' then errs := errs || ('"' || coalesce(fd->>'label', '') || '" harus bilangan bulat.'); else out := jsonb_set(out, array[k], to_jsonb(vt::numeric)); end if;
      when 'bool' then out := jsonb_set(out, array[k], to_jsonb(v = 'true'::jsonb or v = '"true"'::jsonb or v = '1'::jsonb or v = '"1"'::jsonb));
      when 'date' then
        if fd->>'format' = 'datetime' then
          if vt !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then errs := errs || ('"' || coalesce(fd->>'label', '') || '" format tanggal & jam YYYY-MM-DDTHH:mm.');
          else out := jsonb_set(out, array[k], to_jsonb(left(vt, 16))); end if;
        elsif vt !~ '^\d{4}-\d{2}-\d{2}$' then errs := errs || ('"' || coalesce(fd->>'label', '') || '" format tanggal YYYY-MM-DD.');
        else out := jsonb_set(out, array[k], to_jsonb(vt)); end if;
      when 'relation' then
        vt := trim(vt);
        select exists (select 1 from umg2_features x where x.org_id = p_org and x.layer_id = fd->>'target' and not x.deleted
                       and case when coalesce(fd->>'target_key', '') <> '' then public.umg2_jstr(x.attrs->(fd->>'target_key')) = vt else x.id = vt end)
          into ok;
        if not ok then errs := errs || ('"' || coalesce(fd->>'label', '') || '" merujuk data induk yang tidak ada / sudah dihapus'
                                         || case when coalesce(fd->>'target_key', '') <> '' then ' (ID "' || vt || '")' else '' end || '.');
        else out := jsonb_set(out, array[k], to_jsonb(vt)); end if;
      when 'select' then
        if not coalesce(fd->'options', '[]') @> jsonb_build_array(vt) then errs := errs || ('"' || coalesce(fd->>'label', '') || '" harus salah satu pilihan.');
        else out := jsonb_set(out, array[k], to_jsonb(vt)); end if;
      else
        if length(vt) > 5000 then errs := errs || ('"' || coalesce(fd->>'label', '') || '" terlalu panjang.'); else out := jsonb_set(out, array[k], to_jsonb(trim(vt))); end if;
    end case;
    if public.umg2_truthy(fd->'unique') and out ? k then
      if not peers_loaded then
        select coalesce(array_agg(attrs), '{}') into peers from umg2_features
        where org_id = p_org and layer_id = p_layer and not deleted and id <> p_self;
        peers_loaded := true;
      end if;
      if exists (select 1 from unnest(peers) a where not public.umg2_empty(a->k) and lower(public.umg2_jstr(a->k)) = lower(public.umg2_jstr(out->k))) then
        errs := errs || ('"' || coalesce(fd->>'label', '') || '" = "' || public.umg2_jstr(out->k) || '" sudah dipakai data lain (ID unik).');
      end if;
    end if;
  end loop;
  for k in select jsonb_object_keys(p_attrs) loop
    if not exists (select 1 from jsonb_array_elements(coalesce(p_schema, '[]')) f where f->>'key' = k) then
      errs := errs || ('Atribut "' || k || '" tidak ada di skema layer.');
    end if;
  end loop;
  return jsonb_build_object('ok', cardinality(errs) = 0, 'errors', to_jsonb(errs), 'attrs', out);
end $$;

-- Data lain yang atribut relasinya menunjuk fitur ini (referencingFeatures)
create or replace function public.umg2_referencing(p_org uuid, p_layer text, p_id text, p_attrs jsonb)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('id', x.id, 'layer', l.name)), '[]'::jsonb)
  from umg2_layers l
  cross join lateral jsonb_array_elements(l.schema) fd
  join umg2_features x on x.layer_id = l.id and x.org_id = p_org and not x.deleted and x.id <> p_id
  where l.org_id = p_org and not l.deleted and fd->>'type' = 'relation' and fd->>'target' = p_layer
    and not public.umg2_empty(x.attrs->(fd->>'key'))
    and case when coalesce(fd->>'target_key', '') = '' then public.umg2_jstr(x.attrs->(fd->>'key')) = p_id
             else not public.umg2_empty(p_attrs->(fd->>'target_key'))
                  and public.umg2_jstr(x.attrs->(fd->>'key')) = public.umg2_jstr(p_attrs->(fd->>'target_key')) end;
$$;

create or replace function public.umg2_validate_schema(p_org uuid, p_fields jsonb, p_project text, p_self text, p_geom text)
returns jsonb language plpgsql stable set search_path = public as $$
declare f jsonb; o jsonb; out jsonb := '[]'; seen text[] := '{}'; k text; typ text; opts jsonb; px text; ck text; cl text;
  t text; tk text; tschema jsonb; tf jsonb; lbl text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then perform public.umg2_fail('VALIDATION', 'Skema atribut harus berupa daftar.'); end if;
  if jsonb_array_length(p_fields) > 60 then perform public.umg2_fail('VALIDATION', 'Maksimal 60 atribut per layer.'); end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    k := trim(coalesce(public.umg2_jstr(f->'key'), ''));
    if k !~ '^[a-z][a-z0-9_]{0,39}$' then perform public.umg2_fail('VALIDATION', 'Kunci atribut "' || k || '" tidak valid (huruf kecil, angka, _).'); end if;
    if k = any(seen) then perform public.umg2_fail('VALIDATION', 'Kunci atribut duplikat: ' || k); end if;
    seen := seen || k;
    typ := case when f->>'type' in ('text','number','integer','select','date','bool','relation') then f->>'type' else 'text' end;
    opts := '[]';
    if typ = 'select' then
      select coalesce(jsonb_agg(o2), '[]') into opts from (
        select trim(x) o2 from (select case when jsonb_typeof(f->'options') = 'array' then public.umg2_jstr(e) end x
                                 from jsonb_array_elements(case when jsonb_typeof(f->'options') = 'array' then f->'options' else '[]' end) e
                                union all
                                select s from unnest(string_to_array(case when jsonb_typeof(f->'options') = 'array' then '' else coalesce(public.umg2_jstr(f->'options'), '') end, ',')) s) z
        where trim(coalesce(x, '')) <> '' limit 100) w;
      if jsonb_array_length(opts) = 0 then perform public.umg2_fail('VALIDATION', 'Atribut pilihan "' || k || '" belum punya opsi.'); end if;
    end if;
    lbl := trim(coalesce(nullif(public.umg2_jstr(f->'label'), ''), k));
    if length(lbl) > 80 then perform public.umg2_fail('VALIDATION', 'Label maksimal 80 karakter.'); end if;
    o := jsonb_build_object('key', k, 'label', lbl, 'type', typ, 'required', public.umg2_truthy(f->'required'), 'options', opts);
    if typ = 'date' then
      o := o || jsonb_build_object('format', case when f->>'format' = 'datetime' then 'datetime' else 'date' end,
                                   'auto_now', public.umg2_truthy(f->'auto_now'), 'locked', public.umg2_truthy(f->'locked'));
    end if;
    if public.umg2_truthy(f->'unique') and typ in ('text', 'integer', 'number') then
      o := o || '{"unique": true, "required": true}';
      if typ = 'text' and f ? 'auto_id' and jsonb_typeof(f->'auto_id') <> 'null' and f->'auto_id' <> 'false'::jsonb then
        px := trim(case when f->'auto_id' = 'true'::jsonb then '' else public.umg2_jstr(f->'auto_id') end);
        if px !~ '^[A-Za-z0-9_.\-/]{0,12}$' then perform public.umg2_fail('VALIDATION', 'Prefix ID otomatis "' || px || '" maks. 12 karakter (huruf, angka, - _ . /).'); end if;
        o := o || jsonb_build_object('auto_id', px);
      end if;
    end if;
    if public.umg2_truthy(f->'calc') and typ in ('number', 'integer') then
      ck := public.umg2_jstr(f->'calc');
      if public.umg2_calc_types(ck) is null then perform public.umg2_fail('VALIDATION', 'Jenis hitung otomatis "' || ck || '" tidak dikenal.'); end if;
      if coalesce(p_geom, '') <> '' and not (p_geom = any(public.umg2_calc_types(ck))) then
        perform public.umg2_fail('VALIDATION', 'Hitung otomatis "' || ck || '" tidak berlaku untuk layer ' || p_geom || ' (atribut "' || k || '").');
      end if;
      o := (o - 'unique') || jsonb_build_object('calc', ck, 'required', false);
      if ck = 'count_in' then
        cl := coalesce(public.umg2_jstr(f->'calc_layer'), '');
        if cl = '' or cl = p_self or not exists (select 1 from umg2_layers x where x.id = cl and x.org_id = p_org and x.project_id = p_project and not x.deleted and x.geom_type <> 'None') then
          perform public.umg2_fail('VALIDATION', 'Atribut "' || k || '": pilih layer yang dihitung (proyek yang sama, bergeometri).');
        end if;
        o := o || jsonb_build_object('calc_layer', cl);
      end if;
    end if;
    if typ = 'relation' then
      t := coalesce(public.umg2_jstr(f->'target'), '');
      if t = '' or not (t = p_self or exists (select 1 from umg2_layers x where x.id = t and x.org_id = p_org and x.project_id = p_project and not x.deleted)) then
        perform public.umg2_fail('VALIDATION', 'Atribut relasi "' || k || '" harus memilih layer tujuan di proyek yang sama.');
      end if;
      o := o || jsonb_build_object('target', t);
      tk := trim(coalesce(public.umg2_jstr(f->'target_key'), ''));
      if tk <> '' then
        tschema := case when t = p_self then p_fields else (select schema from umg2_layers where id = t) end;
        select x into tf from jsonb_array_elements(tschema) x where public.umg2_jstr(x->'key') = tk limit 1;
        if tf is null or not public.umg2_truthy(tf->'unique') then
          perform public.umg2_fail('VALIDATION', 'Relasi "' || k || '": kunci induk "' || tk || '" harus atribut ID unik di layer induk.');
        end if;
        o := o || jsonb_build_object('target_key', tk);
      end if;
    end if;
    out := out || jsonb_build_array(o);
  end loop;
  if (select count(*) from jsonb_array_elements(out) x where x->'unique' = 'true'::jsonb) > 3 then
    perform public.umg2_fail('VALIDATION', 'Maksimal 3 atribut ID unik per layer.');
  end if;
  return out;
end $$;

create or replace function public.umg2_validate_style(st jsonb, p_schema jsonb)
returns jsonb language plpgsql stable as $$
declare out jsonb; sym text[] := public.umg2_symbol_keys(); v_by text; fd jsonb; cls jsonb := '[]'; c jsonb; seen text[] := '{}'; cv text;
  lb jsonb; keys text[]; fld text; fld2 text; lw jsonb; wf text;
begin
  if st is null or jsonb_typeof(st) <> 'object' then st := '{}'; end if;
  out := jsonb_build_object(
    'color', case when coalesce(public.umg2_jstr(st->'color'), '') ~ '^#[0-9a-fA-F]{6}$' then st->>'color' else '#e11d48' end,
    'symbol', case when public.umg2_jstr(st->'symbol') = any(sym) then st->>'symbol' else 'circle' end,
    'mode', case when st->>'mode' = 'glyph' then 'glyph' else 'badge' end,
    'size', case when st->>'size' in ('s', 'm', 'l') then st->>'size' else 'm' end);
  v_by := coalesce(public.umg2_jstr(st->'by'), '');
  if v_by <> '' then
    select x into fd from jsonb_array_elements(coalesce(p_schema, '[]')) x where x->>'key' = v_by limit 1;
    if fd is null or not (fd->>'type' = any(array['text','select','integer','number','bool','relation'])) then
      perform public.umg2_fail('VALIDATION', 'Atribut klasifikasi simbol "' || v_by || '" tidak ada di skema layer.');
    end if;
    if jsonb_typeof(st->'classes') = 'array' and jsonb_array_length(st->'classes') > 60 then perform public.umg2_fail('VALIDATION', 'Maksimal 60 kelas simbol per layer.'); end if;
    for c in select * from jsonb_array_elements(case when jsonb_typeof(st->'classes') = 'array' then st->'classes' else '[]' end) loop
      cv := left(coalesce(case when jsonb_typeof(c) = 'object' then public.umg2_jstr(c->'v') end, ''), 120);
      continue when cv = any(seen);
      seen := seen || cv;
      if length(coalesce(public.umg2_jstr(c->'label'), '')) > 80 then perform public.umg2_fail('VALIDATION', 'Teks maksimal 80 karakter.'); end if;
      cls := cls || jsonb_build_array(jsonb_build_object('v', cv,
        'color', case when coalesce(public.umg2_jstr(c->'color'), '') ~ '^#[0-9a-fA-F]{6}$' then c->>'color' else out->>'color' end,
        'symbol', case when public.umg2_jstr(c->'symbol') = any(sym) then c->>'symbol' else out->>'symbol' end,
        'label', trim(coalesce(public.umg2_jstr(c->'label'), ''))));
    end loop;
    out := out || jsonb_build_object('by', v_by, 'classes', cls);
  end if;
  if jsonb_typeof(st->'label') = 'object' then
    lb := st->'label';
    keys := array['_status'] || coalesce((select array_agg(x->>'key') from jsonb_array_elements(coalesce(p_schema, '[]')) x), '{}');
    fld := case when coalesce(public.umg2_jstr(lb->'field'), '') = any(keys) then lb->>'field' else '' end;
    fld2 := case when coalesce(public.umg2_jstr(lb->'field2'), '') = any(keys) then lb->>'field2' else '' end;
    out := out || jsonb_build_object('label', jsonb_build_object('on', public.umg2_truthy(lb->'on'), 'field', fld, 'field2', fld2,
      'size', case when jsonb_typeof(lb->'size') in ('number', 'string') and public.umg2_jstr(lb->'size') in ('10','11','12','14','16','18') then public.umg2_jstr(lb->'size')::int else 12 end,
      'color', case when coalesce(public.umg2_jstr(lb->'color'), '') ~ '^#[0-9a-fA-F]{6}$' then lb->>'color' else '#111827' end,
      'halo', case when coalesce(public.umg2_jstr(lb->'halo'), '') ~ '^#[0-9a-fA-F]{6}$' then lb->>'halo' else '#ffffff' end));
    if public.umg2_truthy(lb->'on') and fld = '' then perform public.umg2_fail('VALIDATION', 'Pilih atribut untuk label.'); end if;
    lw := lb->'where';
    if jsonb_typeof(lw) = 'object' then
      wf := case when coalesce(public.umg2_jstr(lw->'f'), '') = any(keys) then lw->>'f' else '' end;
      if wf <> '' then
        out := jsonb_set(out, '{label,where}', jsonb_build_object('f', wf,
          'op', case when lw->>'op' in ('eq','ne','gt','ge','lt','le','contains','starts','in','empty','notempty') then lw->>'op' else 'eq' end,
          'v', left(coalesce(public.umg2_jstr(lw->'v'), ''), 120)));
      end if;
    end if;
  end if;
  return out;
end $$;

-- ---------------------------------------------------------------------
-- 3. PROYEK
-- ---------------------------------------------------------------------
create or replace function public.umg2_project_save(p_org uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); v_name text; v_desc text; v_wa jsonb; v_status text; r umg2_projects; b jsonb;
begin
  perform public.umg2_require_write(v_org, array['project.write']);
  v_name := trim(coalesce(public.umg2_jstr(p->'name'), ''));
  if length(v_name) > 120 then perform public.umg2_fail('VALIDATION', 'Nama proyek maksimal 120 karakter.'); end if;
  if v_name = '' then perform public.umg2_fail('VALIDATION', 'Nama proyek wajib diisi.'); end if;
  v_desc := trim(coalesce(public.umg2_jstr(p->'description'), ''));
  if length(v_desc) > 2000 then perform public.umg2_fail('VALIDATION', 'Deskripsi maksimal 2000 karakter.'); end if;
  b := p->'work_area';
  if public.umg2_truthy(b) then
    if jsonb_typeof(b) <> 'array' or jsonb_array_length(b) <> 4
       or exists (select 1 from jsonb_array_elements(b) e where public.umg2_jstr(e) is null or public.umg2_jstr(e) !~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$')
       or (b->>0)::numeric >= (b->>2)::numeric or (b->>1)::numeric >= (b->>3)::numeric
       or (b->>0)::numeric < -180 or (b->>2)::numeric > 180 or (b->>1)::numeric < -90 or (b->>3)::numeric > 90 then
      perform public.umg2_fail('VALIDATION', 'Area kerja harus [minLon, minLat, maxLon, maxLat] yang valid.');
    end if;
    v_wa := jsonb_build_array((b->>0)::numeric, (b->>1)::numeric, (b->>2)::numeric, (b->>3)::numeric);
  end if;
  v_status := case when p->>'status' in ('active', 'archived') then p->>'status' else 'active' end;
  if public.umg2_truthy(p->'id') then
    update umg2_projects set name = v_name, description = v_desc, work_area = v_wa, status = v_status, updated_at = clock_timestamp()
    where id = p->>'id' and org_id = v_org and not deleted returning * into r;
    if not found then perform public.umg2_fail('NOT_FOUND', 'Data tidak ditemukan.'); end if;
  else
    insert into umg2_projects(id, org_id, name, description, work_area, status, created_by, created_at, updated_at)
    values (gen_random_uuid()::text, v_org, v_name, v_desc, v_wa, v_status, auth.uid(), clock_timestamp(), clock_timestamp()) returning * into r;
  end if;
  return public.umg2_pub_project(r);
end $$;

create or replace function public.umg2_project_delete(p_org uuid, p_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); n int;
begin
  perform public.umg2_require_write(v_org, array['project.write']);
  if not exists (select 1 from umg2_projects where id = p_id and org_id = v_org and not deleted) then
    perform public.umg2_fail('NOT_FOUND', 'Data tidak ditemukan.');
  end if;
  select count(*) into n from umg2_features where project_id = p_id and not deleted;
  if n > 0 then perform public.umg2_fail('CONFLICT', 'Proyek masih memiliki ' || n || ' fitur. Arsipkan proyek alih-alih menghapus.'); end if;
  update umg2_projects set deleted = true, updated_at = clock_timestamp() where id = p_id;
  update umg2_layers set deleted = true, updated_at = clock_timestamp() where project_id = p_id and not deleted;
  return '{"deleted": true}'::jsonb;
end $$;

-- ---------------------------------------------------------------------
-- 4. LAYER
-- ---------------------------------------------------------------------
create or replace function public.umg2_layer_save(p_org uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); v_proj umg2_projects; l umg2_layers; v_name text; v_schema jsonb; v_style jsonb;
  v_geom text; fd jsonb; ox record; seen text[]; missing int; v text; vals text[]; touched text[] := '{}'; fr record; a jsonb; out jsonb;
begin
  perform public.umg2_require_write(v_org, array['layer.write']);
  select * into v_proj from umg2_projects where id = p->>'project_id' and org_id = v_org and not deleted;
  if not found then perform public.umg2_fail('NOT_FOUND', 'Data tidak ditemukan.'); end if;
  v_name := trim(coalesce(public.umg2_jstr(p->'name'), ''));
  if length(v_name) > 120 then perform public.umg2_fail('VALIDATION', 'Nama layer maksimal 120 karakter.'); end if;
  if v_name = '' then perform public.umg2_fail('VALIDATION', 'Nama layer wajib diisi.'); end if;
  if public.umg2_truthy(p->'id') then
    select * into l from umg2_layers where id = p->>'id' and org_id = v_org and not deleted;
    if not found then perform public.umg2_fail('NOT_FOUND', 'Data tidak ditemukan.'); end if;
  end if;
  v_geom := coalesce(nullif(p->>'geom_type', ''), l.geom_type, '');
  v_schema := public.umg2_validate_schema(v_org, coalesce(p->'schema', '[]'), v_proj.id, coalesce(p->>'id', ''), v_geom);
  v_style := public.umg2_validate_style(p->'style', v_schema);

  if l.id is not null then
    -- checkSchemaChange: kunci induk yang dipakai relasi layer lain harus tetap ID unik
    for ox in select x.name, f2 from umg2_layers x, jsonb_array_elements(x.schema) f2
              where x.org_id = v_org and not x.deleted and x.id <> l.id and f2->>'type' = 'relation' and f2->>'target' = l.id
                and coalesce(f2->>'target_key', '') <> '' loop
      if not exists (select 1 from jsonb_array_elements(v_schema) s where s->>'key' = ox.f2->>'target_key' and s->'unique' = 'true'::jsonb) then
        perform public.umg2_fail('CONFLICT', 'Atribut "' || (ox.f2->>'target_key') || '" dipakai sebagai kunci induk oleh relasi di layer "' || ox.name || '" dan harus tetap ID unik.');
      end if;
    end loop;
    for fd in select * from jsonb_array_elements(v_schema) x where x->'unique' = 'true'::jsonb loop
      seen := '{}'; missing := 0;
      for v in select public.umg2_jstr(attrs->(fd->>'key')) from umg2_features where layer_id = l.id and not deleted order by created_at, id loop
        if v is null or v = '' then if not (fd ? 'auto_id') then missing := missing + 1; end if; continue; end if;
        if lower(v) = any(seen) then perform public.umg2_fail('CONFLICT', 'Tidak dapat menjadikan "' || (fd->>'label') || '" ID unik: nilai "' || v || '" muncul lebih dari sekali.'); end if;
        seen := seen || lower(v);
      end loop;
      if missing > 0 then perform public.umg2_fail('CONFLICT', 'Tidak dapat menjadikan "' || (fd->>'label') || '" ID unik: ' || missing || ' data masih kosong. Isi dulu atau aktifkan ID otomatis.'); end if;
    end loop;
    -- ID otomatis untuk data lama yang masih kosong
    for fd in select * from jsonb_array_elements(v_schema) x where x->'unique' = 'true'::jsonb and x ? 'auto_id' loop
      select coalesce(array_agg(public.umg2_jstr(attrs->(fd->>'key'))), '{}') into vals from umg2_features where layer_id = l.id and not deleted;
      for fr in select id, attrs from umg2_features where layer_id = l.id and not deleted order by created_at, id loop
        continue when not public.umg2_empty(fr.attrs->(fd->>'key'));
        v := public.umg2_next_auto_id(fd->>'auto_id', vals); vals := vals || v;
        update umg2_features set attrs = jsonb_set(attrs, array[fd->>'key'], to_jsonb(v)), version = version + 1, updated_at = clock_timestamp() where id = fr.id;
        if not fr.id = any(touched) then touched := touched || fr.id; end if;
      end loop;
    end loop;
    if coalesce(p->>'geom_type', '') <> '' and p->>'geom_type' <> l.geom_type
       and exists (select 1 from umg2_features where layer_id = l.id and not deleted) then
      perform public.umg2_fail('CONFLICT', 'Tipe geometri tidak dapat diubah karena layer sudah berisi data.');
    end if;
    update umg2_layers set name = v_name,
      geom_type = case when p->>'geom_type' in ('Point', 'LineString', 'Polygon', 'None') then p->>'geom_type' else l.geom_type end,
      schema = v_schema, style = v_style, version = version + 1, updated_at = clock_timestamp()
    where id = l.id returning * into l;
    out := public.umg2_pub_layer(l);
    if cardinality(touched) > 0 then
      out := out || jsonb_build_object('_features', (select jsonb_agg(public.umg2_pub_feature(f)) from umg2_features f where f.id = any(touched)));
    end if;
    return out;
  end if;

  if coalesce(p->>'geom_type', '') not in ('Point', 'LineString', 'Polygon', 'None') then
    perform public.umg2_fail('VALIDATION', 'Tipe geometri harus Point, LineString, Polygon, atau None (tabel tanpa geometri).');
  end if;
  insert into umg2_layers(id, org_id, project_id, name, geom_type, srid, schema, style, version, created_at, updated_at)
  values (gen_random_uuid()::text, v_org, v_proj.id, v_name, p->>'geom_type', '4326', v_schema, v_style, 1, clock_timestamp(), clock_timestamp())
  returning * into l;
  return public.umg2_pub_layer(l);
end $$;

create or replace function public.umg2_layer_delete(p_org uuid, p_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); n int; v_ref text;
begin
  perform public.umg2_require_write(v_org, array['layer.write']);
  if not exists (select 1 from umg2_layers where id = p_id and org_id = v_org and not deleted) then
    perform public.umg2_fail('NOT_FOUND', 'Data tidak ditemukan.');
  end if;
  select count(*) into n from umg2_features where layer_id = p_id and not deleted;
  if n > 0 then perform public.umg2_fail('CONFLICT', 'Layer masih berisi ' || n || ' fitur.'); end if;
  select x.name into v_ref from umg2_layers x where x.org_id = v_org and not x.deleted and x.id <> p_id
    and exists (select 1 from jsonb_array_elements(x.schema) f where f->>'type' = 'relation' and f->>'target' = p_id) limit 1;
  if v_ref is not null then perform public.umg2_fail('CONFLICT', 'Layer dirujuk oleh atribut relasi pada layer "' || v_ref || '". Hapus relasinya dulu.'); end if;
  update umg2_layers set deleted = true, updated_at = clock_timestamp() where id = p_id;
  return '{"deleted": true}'::jsonb;
end $$;

-- ---------------------------------------------------------------------
-- 5. SINKRONISASI (idempoten, deteksi konflik per operasi) — applyOp
-- Foto: aplikasi mengunggah foto ke Storage lebih dulu, lalu mengirim
--   ref "storage:<org>/umg/photos/<id fitur>/<file>". Server memeriksa
--   file itu benar ada & milik fitur ini.
-- ---------------------------------------------------------------------
create or replace function public.umg2_apply_op(v_org uuid, v_role text, op jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_op text := coalesce(op->>'op_id', ''); d jsonb := coalesce(op->'data', '{}'); v_id text := coalesce(d->>'id', '');
  ex umg2_features; l umg2_layers; pr umg2_projects; gv jsonb; av jsonb; v_geom jsonb; v_status text; refs jsonb;
  old_photos jsonb; v_photos jsonb := '[]'; ph jsonb; phs text; removed jsonb; v_gps jsonb; cid text; r umg2_features;
  v_lim int; v_count int; v_any boolean := public.umg2_role_allows(v_role, 'feature.write.any'); v_now timestamptz := clock_timestamp();
  v_prefix text; i int := 0; v_base numeric;
begin
  if v_id !~ '^[A-Za-z0-9-]{8,64}$' then perform public.umg2_fail('VALIDATION', 'ID fitur tidak valid.'); end if;
  select * into ex from umg2_features where id = v_id;
  if found and ex.org_id <> v_org then perform public.umg2_fail('NOT_FOUND', 'Fitur tidak ditemukan.'); end if;
  if ex.id is not null and not (v_any or (ex.created_by = auth.uid() and ex.status in ('draft', 'revision', 'submitted'))) then
    if ex.status = 'approved' then perform public.umg2_fail('LOCKED', 'Fitur sudah disetujui dan terkunci.'); end if;
    perform public.umg2_fail('FORBIDDEN', 'Anda tidak berhak mengubah fitur ini.');
  end if;
  -- Number(base_version) ala JS: null → 0, tidak ada / bukan angka → selalu konflik
  v_base := case jsonb_typeof(op->'base_version') when 'number' then (op->>'base_version')::numeric
              when 'null' then 0
              when 'string' then case when trim(op->>'base_version') = '' then 0
                                      when trim(op->>'base_version') ~ '^[+-]?\d+(\.\d+)?$' then trim(op->>'base_version')::numeric end end;
  if ex.id is not null and not public.umg2_truthy(op->'force') and (v_base is null or v_base <> ex.version) then
    cid := gen_random_uuid()::text;
    insert into umg2_conflicts(id, org_id, feature_id, user_id, base_version, server_version, status, created_at)
    values (cid, v_org, v_id, auth.uid(), coalesce(v_base, 0)::int, ex.version, 'open', v_now);
    perform public.umg2_event(v_org, 'sync.conflict', 'feature', v_id, jsonb_build_object('base', op->'base_version', 'server', ex.version));
    return jsonb_build_object('op_id', v_op, 'status', 'conflict', 'conflict_id', cid, 'server', public.umg2_pub_feature(ex));
  end if;

  if op->>'type' = 'delete' then
    if ex.id is null then perform public.umg2_fail('NOT_FOUND', 'Fitur tidak ditemukan.'); end if;
    refs := public.umg2_referencing(v_org, ex.layer_id, ex.id, ex.attrs);
    if jsonb_array_length(refs) > 0 then
      perform public.umg2_fail('REFERENCED', 'Data ini masih direlasikan oleh ' || jsonb_array_length(refs) || ' data lain (' || (refs->0->>'layer') || '). Hapus atau ubah data terkait terlebih dahulu.');
    end if;
    update umg2_features set deleted = true, version = version + 1, updated_by = auth.uid(), updated_at = v_now where id = v_id returning * into r;
    removed := '[]';

  elsif op->>'type' = 'upsert' then
    select * into l from umg2_layers where id = coalesce(ex.layer_id, d->>'layer_id') and org_id = v_org and not deleted;
    if not found then perform public.umg2_fail('VALIDATION', 'Layer tidak ditemukan atau sudah dihapus.'); end if;
    select * into pr from umg2_projects where id = l.project_id and org_id = v_org and not deleted;
    if not found then perform public.umg2_fail('VALIDATION', 'Proyek tidak ditemukan.'); end if;
    if pr.status = 'archived' then perform public.umg2_fail('LOCKED', 'Proyek sudah diarsipkan.'); end if;
    if l.geom_type = 'None' then
      if public.umg2_truthy(d->'geometry') then perform public.umg2_fail('INVALID_GEOMETRY', 'Layer tabel tidak boleh memiliki geometri.'); end if;
      gv := jsonb_build_object('ok', true, 'bbox', null, 'metrics', '{}'::jsonb);
    else
      if length(coalesce(d->'geometry', 'null')::text) > 1500000 then perform public.umg2_fail('PAYLOAD_TOO_LARGE', 'Geometri terlalu besar.'); end if;
      gv := public.umg2_geo_validate(case when jsonb_typeof(d->'geometry') = 'object' then d->'geometry' end, l.geom_type, pr.work_area, 20000);
      if not (gv->>'ok')::boolean then
        perform public.umg2_fail('INVALID_GEOMETRY', (select string_agg(e, ' ') from jsonb_array_elements_text(gv->'errors') e));
      end if;
    end if;
    av := public.umg2_validate_attrs(v_org, l.schema, d->'attrs', ex.attrs, ex.id is null, l.id, v_id);
    if not (av->>'ok')::boolean then
      perform public.umg2_fail('INVALID_ATTRIBUTES', (select string_agg(e, ' ') from jsonb_array_elements_text(av->'errors') e));
    end if;
    if ex.id is not null and exists (select 1 from jsonb_array_elements(l.schema) fd
         where fd->'unique' = 'true'::jsonb and coalesce(public.umg2_jstr(ex.attrs->(fd->>'key')), 'undefined') is distinct from coalesce(public.umg2_jstr(av->'attrs'->(fd->>'key')), 'undefined')) then
      i := jsonb_array_length(public.umg2_referencing(v_org, l.id, v_id, ex.attrs)) - jsonb_array_length(public.umg2_referencing(v_org, l.id, v_id, av->'attrs'));
      if i > 0 then perform public.umg2_fail('REFERENCED', 'ID unik data ini dipakai oleh ' || i || ' data anak. Ubah dulu data anaknya atau biarkan ID tetap.'); end if;
    end if;
    if length((av->'attrs')::text) > 100000 then perform public.umg2_fail('PAYLOAD_TOO_LARGE', 'Atribut terlalu besar.'); end if;
    v_status := coalesce(public.umg2_jstr(d->'status'), 'draft');
    if not (v_status = any(case when public.umg2_role_allows(v_role, 'feature.review')
                                then array['draft','submitted','approved','revision','rejected'] else array['draft','submitted'] end)) then
      perform public.umg2_fail('FORBIDDEN', 'Status "' || v_status || '" tidak diizinkan untuk role Anda.');
    end if;
    if ex.id is null then
      v_lim := coalesce((public.umg2_license_status(v_org)->>'max_features')::int, 0);
      select count(*) into v_count from umg2_features where org_id = v_org and not deleted;
      if v_count >= v_lim then perform public.umg2_fail('LICENSE_LIMIT', 'Batas jumlah fitur lisensi tercapai (' || v_lim || ').'); end if;
    end if;
    -- foto
    old_photos := coalesce(ex.photos, '[]');
    v_prefix := 'storage:' || v_org::text || '/umg/photos/' || v_id || '/';
    for ph in select * from jsonb_array_elements(case when jsonb_typeof(d->'photos') = 'array' then d->'photos' else '[]' end) limit 7 loop
      continue when jsonb_typeof(ph) <> 'string';
      phs := ph #>> '{}';
      if phs like 'data:%' then perform public.umg2_fail('BAD_FILE', 'Foto belum terunggah ke penyimpanan. Coba sinkron lagi.'); end if;
      if old_photos @> jsonb_build_array(phs) then v_photos := v_photos || jsonb_build_array(phs);
      elsif left(phs, length(v_prefix)) = v_prefix and phs !~ '\.\.'
            and exists (select 1 from storage.objects o where o.bucket_id = 'files' and o.name = substr(phs, 9)) then
        v_photos := v_photos || jsonb_build_array(phs);
      end if;
    end loop;
    if jsonb_array_length(v_photos) > 6 then perform public.umg2_fail('VALIDATION', 'Maksimal 6 foto per fitur.'); end if;
    select coalesce(jsonb_agg(o), '[]') into removed from jsonb_array_elements(old_photos) o where not v_photos @> jsonb_build_array(o);
    v_gps := case when jsonb_typeof(d->'gps') = 'object' then jsonb_build_object(
      'accuracy', case when jsonb_typeof(d->'gps'->'accuracy') = 'number' then d->'gps'->'accuracy' end,
      'altitude', case when jsonb_typeof(d->'gps'->'altitude') = 'number' then d->'gps'->'altitude' end,
      'source', left(trim(coalesce(public.umg2_jstr(d->'gps'->'source'), '')), 20),
      'timestamp', left(trim(coalesce(public.umg2_jstr(d->'gps'->'timestamp'), '')), 40),
      'samples', case when jsonb_typeof(d->'gps'->'samples') = 'number' then d->'gps'->'samples' else '0'::jsonb end) end;
    v_geom := case when l.geom_type = 'None' then null else public.umg2_round_geom(d->'geometry') end;
    if exists (select 1 from jsonb_array_elements(l.schema) fd where fd->>'calc' is not null) then
      av := jsonb_set(av, '{attrs}', public.umg2_apply_calc(l.schema, av->'attrs', v_geom, v_org, v_id));
    end if;
    if ex.id is not null then
      update umg2_features set geom_type = l.geom_type,
        geom = case when v_geom is null then null else ST_SetSRID(ST_GeomFromGeoJSON(v_geom::text), 4326) end,
        bbox = gv->'bbox', attrs = av->'attrs', photos = v_photos, gps = v_gps, metrics = coalesce(gv->'metrics', '{}'),
        status = v_status, updated_by = auth.uid(), updated_at = v_now, deleted = false, version = version + 1
      where id = v_id returning * into r;
    else
      insert into umg2_features(id, org_id, project_id, layer_id, geom_type, geom, bbox, attrs, photos, gps, metrics, status, version,
                                created_by, updated_by, created_at, updated_at, review_note)
      values (v_id, v_org, l.project_id, l.id, l.geom_type,
              case when v_geom is null then null else ST_SetSRID(ST_GeomFromGeoJSON(v_geom::text), 4326) end,
              gv->'bbox', av->'attrs', v_photos, v_gps, coalesce(gv->'metrics', '{}'), v_status, 1,
              auth.uid(), auth.uid(), v_now, v_now, '')
      returning * into r;
    end if;
  else
    perform public.umg2_fail('VALIDATION', 'Tipe operasi tidak dikenal.');
  end if;

  insert into umg2_sync_ops(op_id, org_id, user_id, entity_id, result, created_at)
  values (v_op, v_org, auth.uid(), v_id, jsonb_build_object('id', v_id, 'version', r.version), v_now);
  return jsonb_build_object('op_id', v_op, 'status', 'applied', 'feature', public.umg2_pub_feature(r), 'removed_photos', removed);
end $$;

create or replace function public.umg2_sync_push(p_org uuid, p_ops jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public.umg2_write_org(p_org); v_role text; op jsonb; v_op text; res jsonb := '[]'; one jsonb; done umg2_sync_ops;
  cur umg2_features; v_msg text; v_hint text; v_state text; v_lic_ok boolean;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) = 0 then return '{"results": []}'::jsonb; end if;
  if jsonb_array_length(p_ops) > 25 then perform public.umg2_fail('VALIDATION', 'Maksimal 25 operasi per batch.'); end if;
  v_role := public.umg2_role(v_org);
  for op in select * from jsonb_array_elements(p_ops) loop
    v_op := coalesce(op->>'op_id', '');
    begin
      if v_op !~ '^[A-Za-z0-9-]{8,64}$' then perform public.umg2_fail('VALIDATION', 'op_id tidak valid.'); end if;
      select * into done from umg2_sync_ops where op_id = v_op;
      if found then
        if done.org_id <> v_org or done.user_id is distinct from auth.uid() then perform public.umg2_fail('FORBIDDEN', 'op_id milik pengguna lain.'); end if;
        select * into cur from umg2_features where id = done.result->>'id' and org_id = v_org;
        one := jsonb_build_object('op_id', v_op, 'status', 'duplicate', 'feature', case when cur.id is null then null else public.umg2_pub_feature(cur) end);
      else
        perform public.umg2_require_write(v_org, array['feature.write.any', 'feature.write.own']);
        one := public.umg2_apply_op(v_org, v_role, op);
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_state = returned_sqlstate;
      if coalesce(v_hint, '') ~ '^[A-Z_]{3,30}$' then
        one := jsonb_build_object('op_id', v_op, 'status', 'error', 'code', v_hint, 'message', v_msg, 'permanent', v_hint <> 'BUSY');
      elsif v_state in ('40001', '40P01', '55P03') then
        one := jsonb_build_object('op_id', v_op, 'status', 'error', 'code', 'BUSY', 'message', 'Server sedang sibuk, coba lagi.', 'permanent', false);
      else
        one := jsonb_build_object('op_id', v_op, 'status', 'error', 'code', 'INTERNAL',
                                  'message', 'Kesalahan server saat memproses operasi: ' || left(v_msg, 200), 'permanent', true);
      end if;
    end;
    res := res || jsonb_build_array(one);
  end loop;
  return jsonb_build_object('results', res);
end $$;

-- ---------------------------------------------------------------------
-- 6. REVIEW (setujui / revisi / tolak)
-- ---------------------------------------------------------------------
create or replace function public.umg2_feature_review(p_org uuid, p_id text, p_decision text, p_note text default '', p_base_version int default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_org uuid := public.umg2_write_org(p_org); f umg2_features; v_to text; v_note text := trim(coalesce(p_note, ''));
begin
  perform public.umg2_require_write(v_org, array['feature.review']);
  select * into f from umg2_features where id = p_id and org_id = v_org and not deleted;
  if not found then perform public.umg2_fail('NOT_FOUND', 'Data tidak ditemukan.'); end if;
  v_to := case p_decision when 'approve' then 'approved' when 'revision' then 'revision' when 'reject' then 'rejected' end;
  if v_to is null then perform public.umg2_fail('VALIDATION', 'Keputusan harus approve, revision, atau reject.'); end if;
  if f.status not in ('submitted', 'approved', 'revision') then perform public.umg2_fail('CONFLICT', 'Fitur berstatus "' || f.status || '" belum diajukan.'); end if;
  if p_base_version is not null and p_base_version <> f.version then perform public.umg2_fail('CONFLICT', 'Fitur telah berubah sejak Anda membukanya. Muat ulang.'); end if;
  if length(v_note) > 1000 then perform public.umg2_fail('VALIDATION', 'Catatan maksimal 1000 karakter.'); end if;
  if v_to <> 'approved' and v_note = '' then perform public.umg2_fail('VALIDATION', 'Catatan wajib diisi untuk revisi/penolakan.'); end if;
  update umg2_features set status = v_to, review_by = auth.uid(), review_note = v_note, version = version + 1,
         updated_by = auth.uid(), updated_at = clock_timestamp()
  where id = f.id returning * into f;
  return public.umg2_pub_feature(f);
end $$;

-- ---------------------------------------------------------------------
-- 7. RIWAYAT: tampilkan juga catatan khusus (umg2_event)
-- ---------------------------------------------------------------------
create or replace function public.umg2_audit_list(p_org uuid default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.umg2_pick_org(p_org);
begin
  if v_org is null or not public.umg2_can(v_org, 'audit.read') then
    perform public.umg2_fail('FORBIDDEN', 'Anda tidak punya izin melihat riwayat.');
  end if;
  return (
    select coalesce(jsonb_agg(r order by (r->>'ts') desc), '[]'::jsonb) from (
      select case when a.table_name in ('umg_legacy', 'umg2_event') then
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
      where a.org_id = v_org and (a.table_name in ('umg_legacy', 'umg2_event') or e.tbl is not null)
      order by a.created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x);
end $$;

-- ---------------------------------------------------------------------
-- 8. STORAGE: folder foto UMG  files/<org_id>/umg/photos/<id fitur>/…
--    Surveyor UMG boleh mengunggah walau role Platform Inti-nya "viewer".
-- ---------------------------------------------------------------------
drop policy if exists umg2_photos_insert on storage.objects;
create policy umg2_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and split_part(name, '/', 2) = 'umg' and split_part(name, '/', 3) = 'photos'
              and (public.umg2_can(public.storage_org(name), 'feature.write.any') or public.umg2_can(public.storage_org(name), 'feature.write.own')));

drop policy if exists umg2_photos_update on storage.objects;
create policy umg2_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and split_part(name, '/', 2) = 'umg' and split_part(name, '/', 3) = 'photos'
         and (public.umg2_can(public.storage_org(name), 'feature.write.any')
              or (owner_id = auth.uid()::text and public.umg2_can(public.storage_org(name), 'feature.write.own'))));

drop policy if exists umg2_photos_delete on storage.objects;
create policy umg2_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and split_part(name, '/', 2) = 'umg' and split_part(name, '/', 3) = 'photos'
         and (public.umg2_can(public.storage_org(name), 'feature.write.any') or owner_id = auth.uid()::text));

-- ---------------------------------------------------------------------
-- 9. HAK AKSES
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  -- fungsi bantu internal: tidak bisa dipanggil langsung dari aplikasi
  foreach fn in array array[
    'umg2_require_write(uuid,text[])', 'umg2_write_org(uuid)', 'umg2_event(uuid,text,text,text,jsonb)',
    'umg2_calc_value(jsonb,jsonb,uuid,text)', 'umg2_apply_calc(jsonb,jsonb,jsonb,uuid,text)',
    'umg2_validate_attrs(uuid,jsonb,jsonb,jsonb,boolean,text,text)', 'umg2_referencing(uuid,text,text,jsonb)',
    'umg2_validate_schema(uuid,jsonb,text,text,text)', 'umg2_apply_op(uuid,text,jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
  end loop;
  -- aksi untuk aplikasi (hanya pengguna yang login)
  foreach fn in array array[
    'umg2_project_save(uuid,jsonb)', 'umg2_project_delete(uuid,text)', 'umg2_layer_save(uuid,jsonb)', 'umg2_layer_delete(uuid,text)',
    'umg2_sync_push(uuid,jsonb)', 'umg2_feature_review(uuid,text,text,text,integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- =====================================================================
-- CEK CEPAT (opsional):  select public.umg2_geo_validate('{"type":"Point","coordinates":[108.2,-7.3]}', 'Point', null);
-- =====================================================================
