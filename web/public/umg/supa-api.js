/* UMG ↔ Supabase (Platform Inti) — pengganti "dapur" GAS 05_Api.gs.
 * Tampilan UMG tidak diubah: Api.call(aksi, data) diteruskan ke sini dan hasilnya dibentuk
 * persis seperti jawaban GAS ({ ok, data } / { ok:false, error:{ code, message } }).
 *
 * TAHAP 2a (baca data): health, branding.get, db.info, auth.login, auth.logout, boot,
 *   features.list, media.get, users.list, audit.list, license.status.
 * TAHAP 2b (tulis data): sync.push (+ unggah foto ke Storage), features.review,
 *   projects.save/delete, layers.save/delete.
 * Aksi Tahap 2c (pengguna/pengaturan/profil/lisensi) masih dijawab "belum dipindah".
 */
'use strict';
var SupaApi = (function () {
  var STAGE = '2b';
  var NEXT = {
    'settings.save': '2c', 'profile.save': '2c', 'profile.password': '2c', 'users.save': '2c', 'license.activate': '2c'
  };
  var TIMEOUT = 45000;
  var sb = null;

  // ---------------------------------------------------------------- konfigurasi
  function cfg() {
    var c = window.UMG_SUPABASE || {};
    var url = String(c.url || '').trim().replace(/\s+/g, '').replace(/\/(rest|auth|storage|realtime|functions)\/v1.*$/i, '').replace(/\/+$/, '');
    var key = String(c.key || '').replace(/\s+/g, '');
    return { url: url, key: key };
  }
  function cfgProblem() {
    var c = cfg();
    if (!c.url || c.url.indexOf('GANTI') >= 0) return 'Alamat Supabase belum diisi di umg/config.js.';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url)) return 'Alamat Supabase di umg/config.js harus berbentuk https://xxxx.supabase.co';
    if (!c.key || c.key.indexOf('GANTI') >= 0) return 'Kunci publik (publishable key) belum diisi di umg/config.js.';
    if (/^sb_secret_/.test(c.key)) return 'umg/config.js berisi SECRET key — DILARANG. Ganti dengan publishable key (sb_publishable_…).';
    return '';
  }
  function projectRef() { return (/^https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(cfg().url) || [])[1] || ''; }
  function client() {
    if (sb) return sb;
    var p = cfgProblem(); if (p) throw appErr('SETUP', p);
    if (!window.supabase || !window.supabase.createClient) throw netErr('Pustaka Supabase belum termuat (cek koneksi lalu muat ulang).');
    var c = cfg();
    sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }

  // ---------------------------------------------------------------- galat
  function appErr(code, message) { var e = new Error(message); e.appCode = code; return e; }
  function netErr(message) { var e = new Error(message || 'Tidak dapat terhubung ke server.'); e.network = true; return e; }
  function isNet(e) {
    if (!navigator.onLine) return true;
    var m = String((e && e.message) || e || '').toLowerCase();
    return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted|err_internet/.test(m);
  }
  /** Ubah galat Supabase menjadi { code, message } ala GAS, atau lempar ulang bila masalah jaringan. */
  function toFail(e) {
    if (e && e.appCode) return { code: e.appCode, message: e.message };
    if (e && e.network) throw e;
    if (isNet(e)) throw netErr(navigator.onLine ? 'Tidak dapat terhubung ke Supabase.' : 'Perangkat sedang offline.');
    var msg = String((e && e.message) || e || 'Permintaan gagal.'), code = (e && e.hint) || '';
    if (/^[A-Z_]{3,30}$/.test(code)) return { code: code, message: msg };
    if (/Invalid login credentials/i.test(msg)) return { code: 'BAD_CREDENTIALS', message: 'Email atau password salah.' };
    if (/Email not confirmed/i.test(msg)) return { code: 'BAD_CREDENTIALS', message: 'Email belum dikonfirmasi. Buka email konfirmasi dari Supabase dulu.' };
    if (/permission denied for function|JWT|not authenticated/i.test(msg) || (e && (e.code === 'PGRST301' || e.status === 401))) {
      return { code: 'UNAUTHENTICATED', message: 'Sesi berakhir. Silakan login kembali.' };
    }
    if ((e && e.code === 'PGRST202') || /Could not find the function/i.test(msg)) {
      return { code: 'SETUP', message: 'Fungsi database Tahap ' + STAGE + ' belum dipasang. Jalankan file SQL Tahap 2a & 2b (folder supabase/migrations) di Supabase → SQL Editor.' };
    }
    if (/row-level security|permission denied/i.test(msg)) return { code: 'FORBIDDEN', message: 'Anda tidak punya izin untuk tindakan ini (cek role / lisensi).' };
    if (/Too Many Requests|rate limit/i.test(msg)) return { code: 'RATE_LIMIT', message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' };
    return { code: 'INTERNAL', message: msg.substr(0, 300) };
  }
  function withTimeout(p) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(netErr('Server tidak menjawab (timeout).')); }, TIMEOUT); })]);
  }

  // ---------------------------------------------------------------- bantu
  function orgId() { try { return localStorage.getItem('umg_org') || null; } catch (e) { return null; } }
  function setOrg(id) { try { if (id) localStorage.setItem('umg_org', id); else localStorage.removeItem('umg_org'); } catch (e) { /* abaikan */ } }
  async function rpc(name, args) {
    var r = await withTimeout(client().rpc(name, args || {}));
    if (r.error) throw r.error;
    return r.data;
  }
  async function needSession() {
    var r = await withTimeout(client().auth.getSession());
    var s = r && r.data && r.data.session;
    if (!s) throw appErr('UNAUTHENTICATED', 'Sesi berakhir. Silakan login kembali.');
    return s;
  }
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsDataURL(blob); });
  }
  async function urlToDataUrl(url) {
    var r = await withTimeout(fetch(url, { mode: 'cors', credentials: 'omit' }));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return blobToDataUrl(await r.blob());
  }
  /** Gambar pengganti untuk foto yang masih tersimpan di Google Drive (dipindah di Tahap 2b). */
  function drivePlaceholder() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="#f1f5f9"/>' +
      '<rect x="190" y="90" width="100" height="76" rx="10" fill="none" stroke="#94a3b8" stroke-width="6"/><circle cx="240" cy="128" r="18" fill="none" stroke="#94a3b8" stroke-width="6"/>' +
      '<text x="240" y="215" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#475569">Foto masih di Google Drive</text>' +
      '<text x="240" y="245" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#64748b">dipindah ke Supabase pada Tahap 2b</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  /** Selama tahap 2a: paksa baca-saja + beri keterangan, tanpa menyembunyikan status lisensi asli. */
  function stageLicense(lic) {
    lic = Object.assign({}, lic || {});
    if (STAGE === '2a') {
      lic.read_only = true;
      lic.message = 'Uji Tahap 2a: data hanya bisa DILIHAT. Simpan, edit & sinkron aktif setelah Tahap 2b.' + (lic.message ? ' · ' + lic.message : '');
    }
    return lic;
  }
  function fixBoot(b) {
    b.license = stageLicense(b.license);
    b.app = b.app || {}; b.app.db = Object.assign({ backend: 'supabase' }, b.app.db || {}, { project: projectRef() });
    if (b.org && b.org.id) setOrg(b.org.id);
    return b;
  }

  // ---------------------------------------------------------------- aksi
  var H = {};

  H['health'] = async function () { return rpc('umg2_health'); };

  H['db.info'] = async function () {
    var cur = (window.S && S.serverApp && S.serverApp.db) || {};
    return Object.assign({ backend: 'supabase' }, cur, { project: projectRef() });
  };

  H['branding.get'] = async function () {
    var b = await rpc('umg2_branding', { p_org: orgId() });
    var url = b.logo_url || ''; delete b.logo_url;
    b.logo = '';
    if (url) {   // data URL: aman untuk cetak PDF & tampil offline
      try { b.logo = await urlToDataUrl(url); }
      catch (e) { if (isNet(e) || e.network) throw netErr('Logo belum bisa diunduh (offline).'); b.logo = ''; }   // offline: logo tersimpan tetap dipakai
    }
    return b;
  };

  H['auth.login'] = async function (p) {
    var email = String(p.username || '').trim().toLowerCase(), pass = String(p.password || '');
    if (!email || !pass) throw appErr('VALIDATION', 'Email dan password wajib diisi.');
    if (email.indexOf('@') < 0) throw appErr('VALIDATION', 'Masuk memakai EMAIL akun Platform Inti (bukan username UMG lama).');
    var r = await withTimeout(client().auth.signInWithPassword({ email: email, password: pass }));
    if (r.error) throw r.error;
    var boot;
    try { boot = await rpc('umg2_boot', { p_org: orgId(), p_since: null }); }
    catch (e) { var f = toFail(e); if (f.code === 'NO_ORG' || f.code === 'FORBIDDEN') await client().auth.signOut({ scope: 'local' }).catch(function () { }); throw e; }
    var s = r.data.session;
    return { token: 'sb:' + s.user.id, expires_at: new Date((s.expires_at || 0) * 1000).toISOString(), boot: fixBoot(boot) };
  };

  H['auth.logout'] = async function () {
    await client().auth.signOut({ scope: 'local' }).catch(function () { /* tetap keluar di perangkat ini */ });
    return { logged_out: true };
  };

  H['boot'] = async function (p) {
    await needSession();
    return fixBoot(await rpc('umg2_boot', { p_org: orgId(), p_since: p.since || null }));
  };

  H['features.list'] = async function (p) {
    await needSession();
    return rpc('umg2_features_page', { p_org: orgId(), p_project: p.project_id || null, p_since: p.since || null, p_offset: Number(p.offset) || 0, p_limit: Number(p.limit) || 500 });
  };

  H['media.get'] = async function (p) {
    var ref = String(p.ref || '').trim();
    if (!ref || ref.length > 300) throw appErr('VALIDATION', 'Referensi foto kosong / tidak valid.');
    if (ref.indexOf('drive:') === 0) return { ref: ref, data: drivePlaceholder(), legacy: true };
    if (ref.indexOf('storage:') === 0) {
      await needSession();
      var r = await withTimeout(client().storage.from('files').download(ref.substr(8)));
      if (r.error) { if (isNet(r.error)) throw r.error; throw appErr('NOT_FOUND', 'Foto tidak ditemukan.'); }
      return { ref: ref, data: await blobToDataUrl(r.data) };
    }
    if (/^https:\/\//.test(ref)) return { ref: ref, data: await urlToDataUrl(ref) };
    throw appErr('NOT_FOUND', 'Foto tidak ditemukan.');
  };

  H['users.list'] = async function () { await needSession(); return rpc('umg2_users_list', { p_org: orgId() }); };

  H['audit.list'] = async function (p) { await needSession(); return rpc('umg2_audit_list', { p_org: orgId(), p_limit: Math.min(Number(p.limit) || 200, 1000) }); };

  H['license.status'] = async function () { await needSession(); return stageLicense(await rpc('umg2_license_status', { p_org: orgId() })); };

  // ---------------------------------------------------------------- TAHAP 2b: tulis
  var IMG_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
  var IMG_MAGIC = { jpeg: '/9j/', png: 'iVBOR', webp: 'UklGR' };
  var MAX_PHOTO_CHARS = 900000;   // sama dengan APP.MAX_PHOTO_CHARS di GAS (~650 KB)

  function needOrg() { var o = orgId(); if (!o) throw appErr('NO_ORG', 'Organisasi belum terpilih. Muat ulang aplikasi lalu login kembali.'); return o; }

  /** Foto baru (data URL) → unggah ke Storage files/<org>/umg/photos/<id fitur>/<op>_<n>.jpg, ganti dengan ref "storage:…".
   *  Nama file tetap (op_id + urutan) → bila sinkron diulang, file yang sama ditimpa, bukan dobel. */
  async function preparePhotos(org, op) {
    if (!op || op.type !== 'upsert' || !op.data || !Array.isArray(op.data.photos)) return op;
    var fid = String(op.data.id || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(fid) || !/^[A-Za-z0-9-]{8,64}$/.test(String(op.op_id || ''))) return op;   // server yang menolak
    var out = [];
    for (var i = 0; i < op.data.photos.length && i < 7; i++) {
      var ph = op.data.photos[i];
      if (typeof ph !== 'string' || ph.indexOf('data:') !== 0) { out.push(ph); continue; }
      if (ph.length > MAX_PHOTO_CHARS) throw appErr('FILE_TOO_LARGE', 'Foto terlalu besar (maks ' + Math.round(MAX_PHOTO_CHARS / 1370) + ' KB).');
      var m = IMG_RE.exec(ph);
      if (!m) throw appErr('BAD_FILE', 'Foto harus JPEG/PNG/WebP.');
      if (m[2].indexOf(IMG_MAGIC[m[1]]) !== 0) throw appErr('BAD_FILE', 'Isi file tidak sesuai format ' + m[1] + '.');
      var bin = atob(m[2]), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      var path = org + '/umg/photos/' + fid + '/' + op.op_id + '_' + i + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
      var r = await withTimeout(client().storage.from('files').upload(path, new Blob([arr], { type: 'image/' + m[1] }), { upsert: true, contentType: 'image/' + m[1], cacheControl: '31536000' }));
      if (r.error) {
        var st = Number(r.error.statusCode || r.error.status || 0);
        if (isNet(r.error) || st >= 500 || st === 429) throw netErr('Unggah foto tertunda (jaringan/server). Akan dicoba lagi.');
        if (st === 403 || /row-level security|Unauthorized|permission/i.test(r.error.message || '')) throw appErr('FORBIDDEN', 'Tidak diizinkan mengunggah foto (cek role UMG / lisensi).');
        if (st === 413 || /too large|exceeded/i.test(r.error.message || '')) throw appErr('FILE_TOO_LARGE', 'Foto terlalu besar untuk penyimpanan.');
        throw appErr('UPLOAD_FAILED', 'Unggah foto gagal: ' + String(r.error.message || r.error).substr(0, 120));
      }
      out.push('storage:' + path);
    }
    var copy = Object.assign({}, op); copy.data = Object.assign({}, op.data, { photos: out });
    return copy;
  }

  H['sync.push'] = async function (p) {
    await needSession();
    var org = needOrg(), ops = Array.isArray(p.ops) ? p.ops : [], early = {}, send = [];
    if (!ops.length) return { results: [] };
    for (var i = 0; i < ops.length; i++) {
      try { send.push(await preparePhotos(org, ops[i])); }
      catch (e) {
        if (e.network || isNet(e)) throw (e.network ? e : netErr('Unggah foto tertunda (jaringan).'));
        early[ops[i].op_id] = { op_id: ops[i].op_id, status: 'error', code: e.appCode || 'BAD_FILE', message: e.message, permanent: true };
      }
    }
    var res = send.length ? await rpc('umg2_sync_push', { p_org: org, p_ops: send }) : { results: [] };
    var by = {}, rm = [];
    (res.results || []).forEach(function (r) {
      by[r.op_id] = r;
      (r.removed_photos || []).forEach(function (ref) { if (typeof ref === 'string' && ref.indexOf('storage:') === 0) rm.push(ref.substr(8)); });
      delete r.removed_photos;
    });
    if (rm.length) client().storage.from('files').remove(rm).catch(function () { /* sisa file dibersihkan admin */ });
    return { results: ops.map(function (o) {
      return early[o.op_id] || by[o.op_id] || { op_id: o.op_id, status: 'error', code: 'INTERNAL', message: 'Server tidak menjawab operasi ini.', permanent: false };
    }) };
  };

  H['features.review'] = async function (p) {
    await needSession();
    return rpc('umg2_feature_review', { p_org: needOrg(), p_id: String(p.id || ''), p_decision: String(p.decision || ''), p_note: String(p.note || ''),
      p_base_version: p.base_version === undefined || p.base_version === null ? null : Number(p.base_version) });
  };
  H['projects.save'] = async function (p) { await needSession(); return rpc('umg2_project_save', { p_org: needOrg(), p: p }); };
  H['projects.delete'] = async function (p) { await needSession(); return rpc('umg2_project_delete', { p_org: needOrg(), p_id: String(p.id || '') }); };
  H['layers.save'] = async function (p) { await needSession(); return rpc('umg2_layer_save', { p_org: needOrg(), p: p }); };
  H['layers.delete'] = async function (p) { await needSession(); return rpc('umg2_layer_delete', { p_org: needOrg(), p_id: String(p.id || '') }); };

  // ---------------------------------------------------------------- pintu masuk
  /** Dipanggil Api.call. Resolve → jawaban ala GAS; reject → masalah jaringan (data offline tetap aman). */
  async function call(action, payload) {
    var h = H[action];
    if (!h) {
      var st = NEXT[action];
      return { ok: false, error: { code: 'NOT_MIGRATED', message: st
        ? 'Fitur ini aktif setelah Tahap ' + st + ' selesai dipindah ke Supabase. Untuk sementara pakai UMG versi lama.'
        : 'Aksi tidak dikenal: ' + String(action).substr(0, 40) } };
    }
    try { return { ok: true, data: await h(payload || {}), server_time: new Date().toISOString() }; }
    catch (e) { return { ok: false, error: toFail(e) }; }   // toFail melempar ulang bila jaringan → Api.call menandai e.network
  }

  /** Penyesuaian kecil tampilan login (tanpa mengubah desain): kolom Username → Email. */
  function init() {
    var u = document.getElementById('lg-user');
    if (u) {
      u.type = 'email'; u.autocomplete = 'email'; u.setAttribute('inputmode', 'email'); u.placeholder = 'nama@contoh.com';
      var lb = u.parentNode; if (lb && lb.firstChild && lb.firstChild.nodeType === 3) lb.firstChild.nodeValue = 'Email';
    }
    var p = cfgProblem(), err = document.getElementById('lg-err');
    if (p && err) err.textContent = p;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { call: call, stage: STAGE, projectRef: projectRef, client: client };
})();
