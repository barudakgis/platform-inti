import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { sb, must, friendlyError } from '../lib/supabase.js';
import { state, can } from '../lib/store.js';
import { kv, enqueue, registerHandler, outboxEvents, listOutbox } from '../lib/offline.js';
import { esc, toast, formDialog, confirmDialog, download, toCsv, fmtNum } from '../lib/ui.js';
import { APP } from '../config.js';

// ------------------------------------------------------------------
// Handler antrean offline (didaftarkan sekali saat modul dimuat, agar
// antrean tetap terkirim walau user sedang di halaman lain).
// ------------------------------------------------------------------
registerHandler('gis.upsert', async (p) =>
  must(await sb.rpc('gis_upsert_feature', {
    p_id: p.id, p_layer: p.layer_id, p_geometry: p.geometry, p_properties: p.properties,
  })));
registerHandler('gis.delete', async (p) =>
  must(await sb.from('gis_features').delete().eq('id', p.id)));
registerHandler('gis.import', async (p) =>
  must(await sb.rpc('gis_import_geojson', { p_layer: p.layer_id, p_fc: p.fc })));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emptyFc = () => ({ type: 'FeatureCollection', features: [] });
const publicProps = (props = {}) =>
  Object.fromEntries(Object.entries(props).filter(([k]) => !k.startsWith('_')));

export default async function mapView(el) {
  el.innerHTML = `
    <div class="map-page">
      <div class="toolbar">
        <select id="layerSel" title="Pilih layer"></select>
        ${can.edit() ? '<button class="btn small" id="newLayer">＋ Layer</button>' : ''}
        <span class="sep"></span>
        ${can.edit() ? `
          <button class="btn small" data-draw="gps" title="Simpan posisi GPS saat ini">📍 GPS</button>
          <button class="btn small" data-draw="Point" title="Klik peta untuk menambah titik">• Titik</button>
          <button class="btn small" data-draw="LineString" title="Gambar garis">〰 Garis</button>
          <button class="btn small" data-draw="Polygon" title="Gambar poligon/blok">⬠ Poligon</button>
          <label class="btn small" title="Impor GeoJSON (EPSG:4326)">⬆ Impor<input type="file" id="importFile" accept=".geojson,.json" hidden></label>
        ` : ''}
        <button class="btn small" id="exportGeo">⬇ GeoJSON</button>
        <button class="btn small" id="exportCsv">⬇ CSV</button>
      </div>
      <div id="drawBar" class="drawbar" hidden>
        <span id="drawInfo"></span>
        <button class="btn small" id="drawGps">📍 Titik dari GPS</button>
        <button class="btn small" id="drawUndo">↶ Urung</button>
        <button class="btn small primary" id="drawDone">✔ Selesai</button>
        <button class="btn small ghost" id="drawCancel">✕ Batal</button>
      </div>
      <div id="stats" class="muted small"></div>
      <div id="map" class="map"></div>
    </div>`;

  // ---------------------------------------------------------- peta dasar
  const map = L.map(el.querySelector('#map'), { zoomControl: true }).setView(APP.mapCenter, APP.mapZoom);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imagery &copy; Esri',
  });
  L.control.layers({ 'Peta jalan': osm, 'Citra satelit': sat }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);

  let layers = [];
  let layerId = null;
  let fc = emptyFc();
  let geoLayer = null;
  let gpsMarker = null;

  const layerSel = el.querySelector('#layerSel');
  const statsEl = el.querySelector('#stats');
  const currentLayer = () => layers.find((l) => l.id === layerId);
  const color = () => currentLayer()?.style?.color || '#16a34a';

  // ---------------------------------------------------------- data
  async function loadLayers() {
    const key = `layers:${state.org.id}`;
    try {
      layers = must(await sb.from('gis_layers').select('*').eq('org_id', state.org.id).order('name'));
      await kv.set(key, layers);
    } catch (err) {
      layers = (await kv.get(key)) || [];
      if (!layers.length) toast(friendlyError(err), 'error');
    }
    const saved = localStorage.getItem(`layer:${state.org.id}`);
    layerId = layers.find((l) => l.id === saved)?.id || layers[0]?.id || null;
    layerSel.innerHTML = layers.length
      ? layers.map((l) => `<option value="${l.id}" ${l.id === layerId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')
      : '<option value="">— belum ada layer —</option>';
  }

  async function loadFeatures({ fit = false } = {}) {
    if (!layerId) { fc = emptyFc(); drawFeatures(); statsEl.textContent = 'Buat layer dulu untuk mulai memetakan.'; return; }
    const key = `fc:${layerId}`;
    try {
      fc = must(await sb.rpc('gis_features_geojson', { p_layer: layerId }));
      // pertahankan fitur yang masih antre (belum terkirim)
      const cached = await kv.get(key);
      // hanya fitur yang id-nya masih ada di antrean
      const queued = new Set();
      for (const it of await listOutbox()) {
        if (it.type === 'gis.upsert') queued.add(it.payload.id);
        if (it.type === 'gis.import') it.payload.fc.features.forEach((f) => queued.add(f.id));
      }
      const pending = (cached?.features || []).filter((f) => f.properties?._pending && queued.has(f.id));
      const ids = new Set(fc.features.map((f) => f.id));
      fc.features.push(...pending.filter((f) => !ids.has(f.id)));
      await kv.set(key, fc);
    } catch (err) {
      fc = (await kv.get(key)) || emptyFc();
      toast('Offline: menampilkan data tersimpan', 'warn');
    }
    drawFeatures();
    updateStats();
    if (fit && geoLayer && fc.features.length) map.fitBounds(geoLayer.getBounds(), { padding: [20, 20], maxZoom: 18 });
  }

  function updateStats() {
    const n = fc.features.length;
    const area = fc.features.reduce((s, f) => s + (Number(f.properties?._area_ha) || 0), 0);
    const pend = fc.features.filter((f) => f.properties?._pending).length;
    statsEl.textContent = `${n} fitur · total luas ${fmtNum(area)} ha${pend ? ` · ${pend} belum terkirim` : ''}`;
  }

  function drawFeatures() {
    geoLayer?.remove();
    geoLayer = L.geoJSON(fc, {
      style: (f) => ({ color: color(), weight: 2, fillOpacity: 0.25, dashArray: f.properties?._pending ? '5 5' : null }),
      pointToLayer: (f, latlng) => L.circleMarker(latlng, {
        radius: 7, color: '#fff', weight: 2, fillColor: color(), fillOpacity: f.properties?._pending ? 0.5 : 0.95,
      }),
      // popup hanya saat tidak sedang menggambar (klik diteruskan ke peta)
      onEachFeature: (f, lyr) => lyr.on('click', (e) => {
        if (draw) return;
        L.popup().setLatLng(e.latlng).setContent(popupHtml(f)).openOn(map);
      }),
    }).addTo(map);
  }

  function popupHtml(f) {
    const p = f.properties || {};
    const rows = Object.entries(publicProps(p))
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('');
    const extra = [
      p._area_ha != null ? `<tr><th>Luas</th><td>${fmtNum(p._area_ha, 4)} ha</td></tr>` : '',
      p._length_m != null ? `<tr><th>Panjang</th><td>${fmtNum(p._length_m, 1)} m</td></tr>` : '',
      p._pending ? '<tr><td colspan="2"><em>Menunggu sinkron</em></td></tr>' : '',
    ].join('');
    const actions = can.edit()
      ? `<div class="row"><button class="btn small" data-act="edit" data-id="${esc(f.id)}">Ubah</button>
         <button class="btn small danger" data-act="del" data-id="${esc(f.id)}">Hapus</button></div>` : '';
    return `<table class="props">${rows}${extra}</table>${actions}`;
  }

  // Simpan ke cache lokal + antrean (dikirim otomatis saat online)
  async function saveFeature(feature) {
    feature.properties = { ...publicProps(feature.properties), _id: feature.id, _pending: true };
    const i = fc.features.findIndex((f) => f.id === feature.id);
    if (i >= 0) fc.features[i] = feature; else fc.features.push(feature);
    await kv.set(`fc:${layerId}`, fc);
    drawFeatures();
    updateStats();
    await enqueue('gis.upsert', {
      id: feature.id, layer_id: layerId, geometry: feature.geometry, properties: publicProps(feature.properties),
    });
  }

  async function askProps(initial = {}) {
    const v = await formDialog({
      title: 'Atribut fitur',
      fields: [
        { name: 'nama', label: 'Nama / kode', value: initial.nama || '', required: true },
        { name: 'keterangan', label: 'Keterangan', type: 'textarea', value: initial.keterangan || '' },
      ],
    });
    return v ? { ...initial, ...v } : null;
  }

  async function createFeature(geometry, extra = {}) {
    const props = await askProps(extra);
    if (!props) return;
    await saveFeature({ type: 'Feature', id: crypto.randomUUID(), geometry, properties: props });
    toast(navigator.onLine ? 'Tersimpan' : 'Tersimpan di HP, akan dikirim saat online', 'ok');
  }

  // ---------------------------------------------------------- GPS
  function getGps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('GPS tidak didukung perangkat ini'));
      toast('Mencari posisi GPS…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          gpsMarker?.remove();
          gpsMarker = L.layerGroup([
            L.circle([latitude, longitude], { radius: accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.1 }),
            L.circleMarker([latitude, longitude], { radius: 6, color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 2 }),
          ]).addTo(map);
          map.setView([latitude, longitude], Math.max(map.getZoom(), 17));
          resolve({ lat: latitude, lng: longitude, accuracy: Math.round(accuracy * 10) / 10 });
        },
        (err) => reject(new Error(err.code === 1 ? 'Izin lokasi ditolak' : 'Gagal mendapatkan GPS: ' + err.message)),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  }

  // ---------------------------------------------------------- menggambar
  let draw = null; // { type, pts: LatLng[], temp: L.LayerGroup }
  const drawBar = el.querySelector('#drawBar');

  function startDraw(type) {
    if (!layerId) return toast('Buat / pilih layer dulu', 'warn');
    stopDraw();
    draw = { type, pts: [], temp: L.layerGroup().addTo(map) };
    drawBar.hidden = false;
    el.querySelector('#drawGps').hidden = type === 'Point';
    el.querySelector('#drawUndo').hidden = type === 'Point';
    el.querySelector('#drawDone').hidden = type === 'Point';
    map.getContainer().classList.add('drawing');
    map.closePopup();
    map.doubleClickZoom.disable();
    updateDrawInfo();
  }

  function stopDraw() {
    draw?.temp.remove();
    draw = null;
    drawBar.hidden = true;
    map.getContainer().classList.remove('drawing');
    map.doubleClickZoom.enable();
  }

  function updateDrawInfo() {
    if (!draw) return;
    const need = draw.type === 'Polygon' ? 3 : 2;
    el.querySelector('#drawInfo').textContent = draw.type === 'Point'
      ? 'Klik / ketuk peta untuk menaruh titik'
      : `${draw.pts.length} titik (min. ${need}). Klik peta atau pakai GPS.`;
    draw.temp.clearLayers();
    if (draw.pts.length) {
      const shape = draw.type === 'Polygon' && draw.pts.length >= 3
        ? L.polygon(draw.pts, { color: color(), dashArray: '4 4' })
        : L.polyline(draw.pts, { color: color(), dashArray: '4 4' });
      draw.temp.addLayer(shape);
      draw.pts.forEach((p) => draw.temp.addLayer(L.circleMarker(p, { radius: 4, color: color() })));
    }
  }

  function addVertex(latlng) {
    draw.pts.push(latlng);
    updateDrawInfo();
  }

  async function finishDraw() {
    const { type, pts } = draw;
    const need = type === 'Polygon' ? 3 : 2;
    if (pts.length < need) return toast(`Minimal ${need} titik`, 'warn');
    const coords = pts.map((p) => [p.lng, p.lat]);
    const geometry = type === 'Polygon'
      ? { type: 'Polygon', coordinates: [[...coords, coords[0]]] }
      : { type: 'LineString', coordinates: coords };
    stopDraw();
    await createFeature(geometry);
  }

  map.on('click', async (e) => {
    if (!draw) return;
    if (draw.type === 'Point') {
      stopDraw();
      await createFeature({ type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] });
    } else addVertex(e.latlng);
  });

  // ---------------------------------------------------------- impor / ekspor
  function firstCoord(geom) {
    let c = geom?.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    return c;
  }

  async function importFile(file) {
    if (!layerId) return toast('Pilih layer tujuan dulu', 'warn');
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('File bukan GeoJSON yang valid', 'error'); }
    const features = (data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [])
      .filter((f) => f?.geometry?.coordinates);
    if (!features.length) return toast('Tidak ada fitur bergeometri di file ini', 'error');
    if (features.length > APP.maxImportFeatures) return toast(`Maksimal ${APP.maxImportFeatures} fitur per impor`, 'error');
    const c = firstCoord(features[0].geometry);
    if (!c || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
      return toast('Koordinat bukan derajat (EPSG:4326). Ekspor ulang dari QGIS dengan CRS EPSG:4326.', 'error', 8000);
    }
    if (!(await confirmDialog(`Impor ${features.length} fitur ke layer "${currentLayer()?.name}"?`, 'Impor'))) return;

    const clean = features.map((f) => ({
      type: 'Feature',
      id: UUID_RE.test(String(f.id)) ? f.id : crypto.randomUUID(),
      geometry: f.geometry,
      properties: publicProps(f.properties || {}),
    }));
    for (let i = 0; i < clean.length; i += 500) {
      await enqueue('gis.import', { layer_id: layerId, fc: { type: 'FeatureCollection', features: clean.slice(i, i + 500) } });
    }
    clean.forEach((f) => { f.properties._pending = true; f.properties._id = f.id; fc.features.push(f); });
    await kv.set(`fc:${layerId}`, fc);
    drawFeatures();
    updateStats();
    if (geoLayer.getBounds().isValid()) map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
    toast(`${clean.length} fitur masuk antrean impor`, 'ok');
  }

  function exportName(ext) {
    const name = (currentLayer()?.name || 'layer').replace(/[^\w-]+/g, '_');
    return `${name}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  // ---------------------------------------------------------- event UI
  layerSel.onchange = async () => {
    layerId = layerSel.value || null;
    localStorage.setItem(`layer:${state.org.id}`, layerId || '');
    await loadFeatures({ fit: true });
  };

  el.querySelector('#newLayer')?.addEventListener('click', async () => {
    const v = await formDialog({
      title: 'Layer baru',
      fields: [
        { name: 'name', label: 'Nama layer', required: true, placeholder: 'Blok Afdeling I' },
        { name: 'geom_type', label: 'Jenis', type: 'select', value: 'Mixed', options: [
          { value: 'Mixed', label: 'Campuran' }, { value: 'Point', label: 'Titik' },
          { value: 'LineString', label: 'Garis' }, { value: 'Polygon', label: 'Poligon' }] },
        { name: 'color', label: 'Warna', type: 'color', value: '#16a34a' },
      ],
    });
    if (!v) return;
    const { data, error } = await sb.from('gis_layers')
      .insert({ org_id: state.org.id, name: v.name, geom_type: v.geom_type, style: { color: v.color } })
      .select().single();
    if (error) return toast(friendlyError(error), 'error');
    localStorage.setItem(`layer:${state.org.id}`, data.id);
    await loadLayers();
    await loadFeatures();
  });

  el.querySelectorAll('[data-draw]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.draw === 'gps') {
      if (!layerId) return toast('Buat / pilih layer dulu', 'warn');
      try {
        const g = await getGps();
        await createFeature({ type: 'Point', coordinates: [g.lng, g.lat] }, { akurasi_m: g.accuracy });
      } catch (err) { toast(err.message, 'error'); }
    } else startDraw(b.dataset.draw);
  }));

  el.querySelector('#drawGps').onclick = async () => {
    try { const g = await getGps(); if (draw) addVertex(L.latLng(g.lat, g.lng)); toast(`Titik GPS ditambah (±${g.accuracy} m)`); }
    catch (err) { toast(err.message, 'error'); }
  };
  el.querySelector('#drawUndo').onclick = () => { draw?.pts.pop(); updateDrawInfo(); };
  el.querySelector('#drawDone').onclick = finishDraw;
  el.querySelector('#drawCancel').onclick = stopDraw;

  el.querySelector('#importFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importFile(file);
  });

  el.querySelector('#exportGeo').onclick = () => {
    const out = { type: 'FeatureCollection', features: fc.features.map((f) => ({ ...f, properties: publicProps(f.properties) })) };
    download(exportName('geojson'), JSON.stringify(out), 'application/geo+json');
  };
  el.querySelector('#exportCsv').onclick = () => {
    const rows = fc.features.map((f) => {
      const center = f.geometry.type === 'Point'
        ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
        : L.geoJSON(f).getBounds().getCenter();
      return {
        id: f.id, jenis: f.geometry.type, ...publicProps(f.properties),
        luas_ha: f.properties?._area_ha ?? '', panjang_m: f.properties?._length_m ?? '',
        lat: center.lat, lng: center.lng,
      };
    });
    download(exportName('csv'), toCsv(rows), 'text/csv;charset=utf-8');
  };

  // Tombol di dalam popup (Ubah / Hapus)
  el.querySelector('#map').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const f = fc.features.find((x) => x.id === btn.dataset.id);
    if (!f) return;
    map.closePopup();
    if (btn.dataset.act === 'edit') {
      const props = await askProps(publicProps(f.properties));
      if (props) await saveFeature({ ...f, properties: props });
    } else if (btn.dataset.act === 'del') {
      if (!(await confirmDialog('Hapus fitur ini?', 'Hapus'))) return;
      fc.features = fc.features.filter((x) => x.id !== f.id);
      await kv.set(`fc:${layerId}`, fc);
      drawFeatures();
      updateStats();
      await enqueue('gis.delete', { id: f.id });
    }
  });

  // Setelah antrean terkirim, ambil ulang data (luas dihitung server)
  const onFlushed = () => loadFeatures();
  outboxEvents.addEventListener('flushed', onFlushed);

  await loadLayers();
  await loadFeatures({ fit: true });

  // fungsi pembersih saat pindah halaman
  return () => {
    outboxEvents.removeEventListener('flushed', onFlushed);
    map.remove();
  };
}
