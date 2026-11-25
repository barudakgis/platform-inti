/* SPMS ↔ Supabase (Platform Inti) — pengganti "dapur" GAS (google.script.run).
 * Tampilan SPMS TIDAK diubah: setiap panggilan api(aksi, data) diteruskan ke sini.
 *
 * Cara kerja (Tahap 2a baca + 2b tulis):
 *  - Login memakai email & password Platform Inti (Supabase Auth).
 *  - Data dibaca dari tabel spms_* lewat REST Supabase. RLS di database memastikan
 *    tiap orang hanya menerima data yang boleh ia lihat (unit / milik sendiri / organisasi).
 *  - Perhitungan (dashboard, neraca, laba-rugi, biaya, stok, ekspor) memakai KODE SERVER SPMS YANG SAMA
 *    (SpmsEngine, dimuat di index.html) — hasilnya identik dengan versi Google Sheets.
 *  - MENYIMPAN (2b): aturan bisnis SPMS asli dijalankan di sini, semua perubahan satu aksi direkam lalu dikirim
 *    sekaligus ke spms_apply() (satu transaksi). Database memeriksa izin utama aksi + RLS per baris.
 *    Berkas foto/video/PDF diunggah ke Storage bucket "spms". Sinkron Mode Lapangan anti-dobel (op_id).
 *  - Pengguna, pengaturan, lisensi & AI di Tahap 2c.
 */
'use strict';
var SpmsSupa = (function () {
  var STAGE = '2b', BUILD = '2b-1';
  var TIMEOUT = 45000, PAGE = 1000, TTL = 45000;
  var WRITE = { save: 1, remove: 1, bulkSave: 1, saveSurvey: 1, parcelTransition: 1, replaceTree: 1, uploadMedia: 1,
    journalPost: 1, journalReverse: 1, quickTxn: 1 };
  var SYNC_OK = { save: 1, saveSurvey: 1, uploadMedia: 1, remove: 1 };
  var LATER = { changePassword: 1, updateProfile: 1, settingsSave: 1, userSave: 1, userReset: 1, licenseActivate: 1,
    aiTest: 1, aiChat: 1, aiGisQuery: 1, aiVision: 1, forecast: 1, aiReport: 1 };
  var sb = null, WHO = null, WHO_AT = 0, STORE = {}, LOADED = {}, NEEDS = {};
  try { NEEDS = JSON.parse(localStorage.getItem('spms_needs') || '{}') || {}; } catch (e) { NEEDS = {}; }

  // ---------------------------------------------------------------- konfigurasi
  function cfg() {
    var c = window.SPMS_SUPABASE || {};
    var url = String(c.url || '').trim().replace(/\s+/g, '').replace(/\/(rest|auth|storage|realtime|functions)\/v1.*$/i, '').replace(/\/+$/, '');
    return { url: url, key: String(c.key || '').replace(/\s+/g, '') };
  }
  function cfgProblem() {
    var c = cfg();
    if (!c.url || c.url.indexOf('GANTI') >= 0) return 'Alamat Supabase belum diisi di spms/config.js.';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.url)) return 'Alamat Supabase di spms/config.js harus berbentuk https://xxxx.supabase.co';
    if (!c.key || c.key.indexOf('GANTI') >= 0) return 'Kunci publik (publishable key) belum diisi di spms/config.js.';
    if (/^sb_secret_/.test(c.key) || /service_role/.test(c.key)) return 'spms/config.js berisi SECRET key — DILARANG. Ganti dengan publishable key (sb_publishable_…).';
    return '';
  }
  function projectRef() { return (/^https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(cfg().url) || [])[1] || ''; }
  function client() {
    if (sb) return sb;
    var p = cfgProblem(); if (p) throw appErr('SETUP', p);
    if (!window.supabase || !window.supabase.createClient) throw netErr('Pustaka Supabase belum termuat (cek koneksi lalu muat ulang).');
    var c = cfg();
    sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'spms-auth' } });
    return sb;
  }
  function eng() { if (!window.SpmsEngine) throw appErr('SETUP', 'Mesin SPMS belum termuat. Muat ulang halaman.'); return window.SpmsEngine; }

  // ---------------------------------------------------------------- galat
  function appErr(code, message) { var e = new Error(message); e.appCode = code; return e; }
  function netErr(message) { var e = new Error(message || 'Tidak dapat terhubung ke server.'); e.network = true; return e; }
  function isNet(e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    var m = String((e && e.message) || e || '').toLowerCase();
    return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted|err_internet/.test(m);
  }
  /** Galat Supabase → pesan bahasa Indonesia; masalah jaringan dilempar ulang (antrean offline tetap aman). */
  function toFail(e) {
    if (e && e.appCode) return { code: e.appCode, message: e.message };
    if (e && e.network) throw e;
    if (isNet(e)) throw netErr(navigator.onLine === false ? 'Perangkat sedang offline.' : 'Tidak dapat terhubung ke Supabase.');
    var msg = String((e && e.message) || e || 'Permintaan gagal.'), hint = (e && e.hint) || '';
    if (/^[A-Z_]{3,30}$/.test(hint)) return { code: hint, message: msg };
    if (/Invalid login credentials/i.test(msg)) return { code: 'BAD_CREDENTIALS', message: 'Email atau password salah.' };
    if (/Email not confirmed/i.test(msg)) return { code: 'BAD_CREDENTIALS', message: 'Email belum dikonfirmasi. Buka email konfirmasi dari Supabase dulu.' };
    if (/JWT|not authenticated|refresh token/i.test(msg) || (e && (e.code === 'PGRST301' || e.status === 401))) return { code: 'UNAUTHENTICATED', message: 'Sesi berakhir. Silakan login kembali.' };
    if ((e && e.code === 'PGRST202') || /Could not find the function/i.test(msg)) return { code: 'SETUP', message: 'Fungsi database Tahap 2a belum dipasang. Jalankan file SQL 20261126000001_spms_tahap2a_baca.sql di Supabase → SQL Editor.' };
    if ((e && e.code === '42P01') || /relation .*spms_.* does not exist/i.test(msg)) return { code: 'SETUP', message: 'Tabel SPMS belum ada di proyek Supabase ini. Jalankan SQL Tahap 1 (1_spms_modul.sql & 2_spms_impor.sql).' };
    if (/row-level security|permission denied/i.test(msg)) return { code: 'FORBIDDEN', message: 'Anda tidak punya izin untuk tindakan ini (cek role SPMS / lisensi).' };
    if (/Too Many Requests|rate limit/i.test(msg)) return { code: 'RATE_LIMIT', message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' };
    return { code: 'INTERNAL', message: msg.substr(0, 300) };
  }
  function withTimeout(p) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(netErr('Server tidak menjawab (timeout).')); }, TIMEOUT); })]);
  }
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

  // ---------------------------------------------------------------- organisasi & identitas
  function piOrg() { try { return localStorage.getItem('spms_pi_org') || null; } catch (e) { return null; } }
  function setPiOrg(id) { try { if (id) localStorage.setItem('spms_pi_org', id); else localStorage.removeItem('spms_pi_org'); } catch (e) { /* abaikan */ } }
  function resetData() { STORE = {}; LOADED = {}; WHO = null; WHO_AT = 0; }
  async function whoami(force) {
    if (!force && WHO && Date.now() - WHO_AT < 60000) return WHO;
    var w = await rpc('spms_whoami', { p_org: piOrg() });
    if (WHO && WHO.org && w.org && WHO.org.id !== w.org.id) { STORE = {}; LOADED = {}; }
    WHO = w; WHO_AT = Date.now(); setPiOrg(w.org && w.org.id);
    return w;
  }
  function ctxFrom(w, token) {
    var scope = w.scope;
    if (scope === 'org' && !w.unit) scope = 'all';   // unit belum diatur = semua unit (RLS tetap membatasi ke organisasi ini)
    var u = w.user || {};
    var user = { id: u.id, org_id: w.unit || '', username: u.email || '', name: u.name || u.email || '', email: u.email || '', phone: u.phone || '',
      role: w.role, farmer_id: w.farmer || '', photo: u.avatar_url || '', status: 'Aktif', must_change: 0, last_login: u.last_login || '' };
    return { user: user, role: w.role, scope: scope, perms: w.perms || {}, orgId: w.unit || '', farmerId: w.farmer || '', token: token };
  }

  // ---------------------------------------------------------------- lisensi (dari Platform Inti)
  var PLAN = { trial: 'DEMO', basic: 'BASIC', pro: 'PRO', enterprise: 'ENTERPRISE' };
  function license() {
    var E = eng(), w = WHO || {}, L = w.license || {}, plan = PLAN[L.plan] || 'DEMO';
    var lim = Object.assign({}, E.PLANS[plan]); if (L.max_users) lim.users = L.max_users;
    var today = new Date().toISOString().slice(0, 10), exp = L.valid_until || '';
    var expired = !w.licensed, days = exp ? Math.ceil((new Date(exp) - new Date(today)) / 86400000) : null;
    var label = (L.plan ? E.PLANS[plan].label : 'Belum berlangganan') + ' · Platform Inti';
    return { plan: plan, label: label, client: (w.org && w.org.name) || '', exp: exp, expired: expired, days_left: days, limits: lim,
      install_id: 'PI-' + String((w.org && w.org.id) || '').slice(0, 8).toUpperCase(), readonly: expired || STAGE === '2a', source: 'platform-inti' };
  }

  // ---------------------------------------------------------------- data: Supabase → bentuk baris GAS
  function snake(n) { return n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(); }
  function toGas(ent, r) {
    var S = eng().SCHEMA[ent], o = { id: r.id, org_id: ent === 'Organisasi' ? '' : (r.unit_id || '') };
    S.fields.forEach(function (f) {
      var k = f[0], t = f[2], v = r[k];
      if (v === null || v === undefined) v = '';
      else if (t === 'bool') v = v ? 1 : 0;
      else if (t === 'geom' || t === 'json') v = typeof v === 'string' ? v : JSON.stringify(v);
      else if (t === 'num' || t === 'money') v = Number(v);
      o[k] = v;
    });
    o.created_by = r.legacy_created_by || r.created_by || '';
    o.created_at = r.created_at || ''; o.updated_at = r.updated_at || ''; o.deleted = r.deleted ? 1 : 0;
    return o;
  }
  function merge(name, rows) {
    var cur = STORE[name] || [], idx = {};
    cur.forEach(function (r, i) { idx[r.id] = i; });
    rows.forEach(function (r) { if (idx[r.id] !== undefined) cur[idx[r.id]] = r; else { idx[r.id] = cur.length; cur.push(r); } });
    STORE[name] = cur;
  }
  var SPECIAL = {
    Settings: async function () {
      var r = await withTimeout(client().from('spms_settings').select('scope,key,value,updated_at').eq('org_id', WHO.org.id));
      if (r.error) throw r.error;
      STORE.Settings = (r.data || []).map(function (s) { return { id: s.scope + '|' + s.key, scope: s.scope, key: s.key, value: JSON.stringify(s.value), updated_at: s.updated_at }; });
    },
    Users: async function () {
      try { STORE.Users = await rpc('spms_users_list', { p_org: WHO.org.id }); }
      catch (e) { var f = toFail(e); if (f.code !== 'FORBIDDEN') throw e; STORE.Users = [ctxFrom(WHO, '').user]; }
    },
    Audit: async function () {
      var r = await withTimeout(client().from('spms_audit').select('*').eq('org_id', WHO.org.id).order('ts', { ascending: false }).limit(2000));
      if (r.error) throw r.error;
      STORE.Audit = (r.data || []).reverse().map(function (a) { return { id: a.id, ts: a.ts, user_id: a.legacy_user_id || a.user_id || '', username: a.username || '',
        org_id: a.unit_id || '', action: a.action || '', entity: a.entity || '', entity_id: a.entity_id || '', detail: a.detail || '' }; });
    },
    AIRuns: async function () { STORE.AIRuns = []; }, SyncOps: async function () { STORE.SyncOps = []; },
    Sessions: async function () { STORE.Sessions = []; }, _Chunks: async function () { STORE._Chunks = []; }
  };
  /** Muat satu "sheet". Kali kedua hanya mengambil baris yang berubah sejak terakhir (delta). */
  async function load(name, force) {
    var L = LOADED[name];
    if (L && !force && Date.now() - L.at < TTL) return;
    if (SPECIAL[name]) { await SPECIAL[name](); LOADED[name] = { at: Date.now() }; return; }
    var E = eng(); if (!E.SCHEMA[name]) { STORE[name] = STORE[name] || []; LOADED[name] = { at: Date.now() }; return; }
    var since = L && L.max, rows = [], off = 0, max = since || '';
    for (;;) {
      var q = client().from('spms_' + snake(name)).select('*').eq('org_id', WHO.org.id);
      if (since) q = q.gte('updated_at', since);
      var r = await withTimeout(q.order('updated_at', { ascending: true }).order('id', { ascending: true }).range(off, off + PAGE - 1));
      if (r.error) throw r.error;
      (r.data || []).forEach(function (x) { rows.push(toGas(name, x)); if (x.updated_at > max) max = x.updated_at; });
      if (!r.data || r.data.length < PAGE) break;
      off += PAGE;
    }
    if (since) merge(name, rows); else STORE[name] = rows;
    LOADED[name] = { at: Date.now(), max: max };
  }

  // ---------------------------------------------------------------- mesin: Db dalam memori
  function NeedSheet(name) { var e = new Error('NEED:' + name); e.needSheet = name; return e; }
  function readOnly() { return appErr('READ_ONLY', 'Aksi ini hanya membaca data.'); }
  var MISS = {}, REC = null, UNDO = [];
  var BASECOLS = { id: 1, org_id: 1, created_by: 1, created_at: 1, updated_at: 1, deleted: 1 };
  function colOk(name, k) { var S = eng().SCHEMA[name]; return !!BASECOLS[k] || !!(S && S.fields.some(function (f) { return f[0] === k; })); }
  function recIns(name, o) {
    if (!REC) throw readOnly();
    if (!eng().SCHEMA[name]) throw appErr('LATER', 'Menyimpan ' + name + ' aktif setelah Tahap 2c.');
    if (!o.id) o.id = eng().uid_();
    var rows = STORE[name] || (STORE[name] = []); rows.push(o);
    UNDO.push(function () { var i = rows.indexOf(o); if (i >= 0) rows.splice(i, 1); });
    var row = {}; Object.keys(o).forEach(function (k) { if (colOk(name, k)) row[k] = o[k]; });
    REC.push({ t: 'ins', e: name, row: row });
    return o;
  }
  var MemDb = {
    all: function (name) { if (!STORE[name]) { MISS[name] = 1; throw NeedSheet(name); } return STORE[name]; },
    get: function (name, id) { var r = MemDb.all(name); for (var i = 0; i < r.length; i++) if (String(r[i].id) === String(id)) return r[i]; return null; },
    append: function (name, obj) {
      if (name === 'Audit') { if (REC) REC.push({ t: 'audit', row: obj }); return obj; }
      if ({ Sessions: 1, AIRuns: 1, SyncOps: 1 }[name]) return obj;
      throw readOnly();
    },
    insert: function (name, obj) { MemDb.all(name); return recIns(name, obj); },
    insertMany: function (name, objs) { MemDb.all(name); objs.forEach(function (o) { recIns(name, o); }); return objs; },
    update: function (name, id, patch) {
      if (!REC) throw readOnly();
      if (!eng().SCHEMA[name]) throw appErr('LATER', 'Menyimpan ' + name + ' aktif setelah Tahap 2c.');
      var rows = MemDb.all(name), i = -1;
      for (var k = 0; k < rows.length; k++) if (String(rows[k].id) === String(id)) { i = k; break; }
      if (i < 0) throw new Error('Data tidak ditemukan: ' + name + ' ' + id);
      var prev = rows[i], merged = Object.assign({}, prev), clean = {};
      Object.keys(patch).forEach(function (k2) { if (k2 !== 'id' && colOk(name, k2)) { merged[k2] = patch[k2]; clean[k2] = patch[k2]; } });
      rows[i] = merged;
      UNDO.push(function () { var j = rows.indexOf(merged); if (j >= 0) rows[j] = prev; });
      REC.push({ t: 'upd', e: name, id: String(id), patch: clean });
      return merged;
    },
    removeHard: function () { throw appErr('UNSUPPORTED', 'Hapus permanen tidak dipakai di versi Supabase.'); },
    removeWhere: function () { throw appErr('UNSUPPORTED', 'Hapus permanen tidak dipakai di versi Supabase.'); },
    bump: function () {}, shardIds: function () { return ['supabase']; }, mainId: function () { return 'supabase'; }, cellCount: function () { return 0; },
    sheet: function () { throw appErr('UNSUPPORTED', 'Tidak tersedia di versi Supabase.'); }, ss: function () { throw appErr('UNSUPPORTED', 'Tidak tersedia di versi Supabase.'); },
    headers: function () { return []; }
  };
  function undoAll() { while (UNDO.length) { try { UNDO.pop()(); } catch (e) { /* abaikan */ } } }
  /** Jalankan handler server SPMS asli; bila butuh sheet yang belum dimuat → muat lalu ulangi.
   *  opt.write: rekam perubahan (dikembalikan di out.__ops), opt.fn: fungsi kustom (E, ctx, payload). */
  async function runEngine(action, ctx, payload, opt) {
    opt = opt || {};
    var E = eng(), fn = opt.fn || E.H[action];
    if (!fn) throw appErr('UNKNOWN', 'Aksi tidak dikenal: ' + action);
    E.setDb(MemDb); E.setLicense(license);
    var learned = NEEDS[action] || [];
    await Promise.all(learned.map(function (n) { return load(n, opt.write && LOADED[n] && Date.now() - LOADED[n].at > 4000); }));
    var used = {};
    for (var i = 0; i < 25; i++) {
      MISS = {}; REC = opt.write ? [] : null; UNDO = [];
      var out, err = null;
      try { out = opt.fn ? fn(E, ctx, JSON.parse(JSON.stringify(payload || {}))) : fn(ctx, JSON.parse(JSON.stringify(payload || {})), { action: action }); } catch (e) { err = e; }
      var miss = Object.keys(MISS);
      if (err && err.needSheet) miss.push(err.needSheet);
      if (miss.length) {   // ada data yang belum dimuat (termasuk yang "tertelan" try/catch di kode server) → batalkan, muat & ulangi
        undoAll();
        miss.forEach(function (n) { used[n] = 1; });
        await Promise.all(miss.map(function (n) { return load(n); }));
        continue;
      }
      var ops = REC; REC = null;
      if (err) { undoAll(); throw err; }
      var names = Object.keys(used).concat(learned).filter(function (v, k, a) { return a.indexOf(v) === k; });
      if (names.join() !== learned.join()) { NEEDS[action] = names; try { localStorage.setItem('spms_needs', JSON.stringify(NEEDS)); } catch (e) { /* abaikan */ } }
      var res = JSON.parse(JSON.stringify(out === undefined ? null : out));
      if (opt.write) return { out: res, ops: ops || [], undo: UNDO.splice(0) };
      return res;
    }
    undoAll();
    throw appErr('INTERNAL', 'Data yang dibutuhkan terlalu banyak untuk aksi ' + action + '.');
  }
  function smallResult(r) {
    var x = r && r.row ? { id: r.row.id } : r && r.survey_id ? { survey_id: r.survey_id } : r && r.id ? { id: r.id } : true;
    if (x && typeof x === 'object' && r && r.warnings && r.warnings.length) x.warnings = r.warnings;
    return x;
  }
  /** Simpan: jalankan aturan SPMS (rekam perubahan) → kirim ke spms_apply (satu transaksi). */
  async function runWrite(action, payload, opId, fn) {
    var w = await whoami(), ctx = ctxFrom(w, 'sb');
    if (payload && payload.ent && eng().SCHEMA[payload.ent]) await load(payload.ent, LOADED[payload.ent] && Date.now() - LOADED[payload.ent].at > 4000);
    var r = await runEngine(action, ctx, payload, { write: true, fn: fn });
    if (!r.ops.some(function (o) { return o.t !== 'audit'; })) return r.out;   // tidak ada perubahan data (mis. duplikat)
    var touched = {}; r.ops.forEach(function (o) { if (o.e) touched[o.e] = 1; });
    var res;
    try {
      res = await rpc('spms_apply', { p_org: w.org.id, p_action: action, p_ent: (payload && payload.ent) || null, p_ops: r.ops, p_op_id: opId || null, p_result: smallResult(r.out) });
    } catch (e) {
      UNDO = r.undo; undoAll();
      Object.keys(touched).forEach(function (n) { delete LOADED[n]; });   // muat ulang dari server pada aksi berikutnya
      throw e;
    }
    if (res && res.dup) {   // sudah pernah tersimpan (sinkron diulang) → pakai data server
      UNDO = r.undo; undoAll();
      Object.keys(touched).forEach(function (n) { if (LOADED[n]) LOADED[n].at = 0; });
      var d = res.result; if (d && typeof d === 'object') d.dup = true;
      return d && typeof d === 'object' && d.id ? { row: { id: d.id }, dup: true } : d;
    }
    Object.keys(touched).forEach(function (n) { if (LOADED[n]) LOADED[n].at = 0; });   // ambil versi server (updated_at) saat dibuka lagi
    return r.out;
  }

  // ---------------------------------------------------------------- aksi khusus
  var H = {};
  H.publicInfo = async function () {
    var E = eng(), brand = null;
    try { brand = JSON.parse(localStorage.getItem('spms_brand') || 'null'); } catch (e) { brand = null; }
    return { name: E.APP.NAME, version: E.APP.VERSION, brand: brand || { title: E.APP.NAME } };
  };
  H.login = async function (p) {
    var email = String(p.username || '').trim().toLowerCase(), pass = String(p.password || '');
    if (!email || !pass) throw appErr('VALIDATION', 'Email dan password wajib diisi.');
    if (email.indexOf('@') < 0) throw appErr('VALIDATION', 'Masuk memakai EMAIL akun Platform Inti (bukan username SPMS lama).');
    resetData();
    var r = await withTimeout(client().auth.signInWithPassword({ email: email, password: pass }));
    if (r.error) throw r.error;
    try { await whoami(true); }
    catch (e) { var f = toFail(e); if (f.code === 'NO_ORG') await client().auth.signOut({ scope: 'local' }).catch(function () {}); throw e; }
    var boot = await H.bootstrap({});
    return { token: 'sb:' + r.data.session.user.id, boot: boot };
  };
  H.logout = async function () {
    resetData();
    await client().auth.signOut({ scope: 'local' }).catch(function () { /* tetap keluar di perangkat ini */ });
    return true;
  };
  H.bootstrap = async function () {
    var w = await whoami(true);
    await Promise.all(['Settings', 'Organisasi', 'Komoditas', 'Varietas'].map(function (n) { return load(n, true); }));
    var b = await runEngine('bootstrap', ctxFrom(w, 'sb'), {});
    b.app.version = b.app.version + ' · Supabase';
    b.app.db = { backend: 'supabase', project: projectRef(), org: w.org, orgs: w.orgs, stage: STAGE, build: BUILD };
    try { localStorage.setItem('spms_brand', JSON.stringify(b.settings.brand || {})); } catch (e) { /* abaikan */ }
    return b;
  };
  H.licenseInfo = async function () {
    var w = await whoami();
    await Promise.all(['Users', 'Bidang', 'Pohon'].map(function (n) { return load(n); }));
    var s = license(), cnt = function (n) { return (STORE[n] || []).filter(function (r) { return r.deleted != 1 && r.status !== 'Belum daftar'; }).length; };
    s.usage = { users: cnt('Users'), parcels: cnt('Bidang'), trees: cnt('Pohon') };
    s.secret_default = false;
    s.note = 'Lisensi SPMS dikelola di Platform Inti (organisasi ' + ((w.org && w.org.name) || '-') + ').';
    return s;
  };
  H.capacity = async function () {
    var w = await whoami(), c = await rpc('spms_capacity', { p_org: w.org.id }), LIMIT = 500 * 1024 * 1024;
    var pct = Math.round(c.db_bytes / LIMIT * 1000) / 10;
    return { spreadsheets: [{ id: 'supabase', name: 'Supabase · ' + w.org.name + ' (' + (Math.round(c.db_bytes / 1048576 * 10) / 10) + ' MB dari 500 MB paket Free)', cells: c.rows, pct: pct,
      sheets: c.tables.map(function (t) { return { name: t.name, rows: t.rows, cells: t.rows }; }) }],
      warnings: pct > 80 ? ['Database sudah ' + pct + '% dari 500 MB (paket Free). Pertimbangkan Supabase Pro.'] : [],
      limitCells: 0, limitChars: 0, note: 'Data tersimpan di Supabase (PostgreSQL). Batas sel & karakter Google Sheets tidak berlaku lagi. Ukuran database dihitung untuk seluruh proyek Supabase (semua aplikasi).' };
  };
  var SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="#f1f5f9"/>' +
    '<rect x="190" y="90" width="100" height="76" rx="10" fill="none" stroke="#94a3b8" stroke-width="6"/><circle cx="240" cy="128" r="18" fill="none" stroke="#94a3b8" stroke-width="6"/>' +
    '<text x="240" y="215" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#475569">Berkas masih di Google Drive</text>' +
    '<text x="240" y="245" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#64748b">dipindah ke Supabase pada tahap berikutnya</text></svg>';
  function blobToB64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = function () { rej(fr.error); }; fr.readAsDataURL(blob); });
  }
  H.getMedia = async function (p) {
    var w = await whoami(), ctx = ctxFrom(w, 'sb');
    var check = await runEngine('list', ctx, { ent: 'Media' });       // izin & cakupan sama dengan versi GAS
    var m = check.filter(function (x) { return x.id === p.id; })[0];
    if (!m) throw appErr('NOT_FOUND', 'Media tidak ditemukan.');
    var ref = String(m.file_id || '');
    if (ref.indexOf('storage:') === 0) {
      var r = await withTimeout(client().storage.from('spms').download(ref.substr(8)));
      if (r.error) { if (isNet(r.error)) throw netErr('Berkas belum bisa diunduh (offline).'); throw appErr('NOT_FOUND', 'Berkas tidak ditemukan di penyimpanan.'); }
      return { data: await blobToB64(r.data), mime: m.mime || r.data.type, name: m.name || ('media-' + m.id) };
    }
    return { data: btoa(unescape(encodeURIComponent(SVG))), mime: 'image/svg+xml', name: 'di-google-drive.svg', legacy: true };
  };

  var MIME_OK = /^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime)|application\/pdf)$/;
  var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'application/pdf': 'pdf' };
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  /** Versi Supabase dari h_uploadMedia: berkas ke Storage, baris Media + riwayat pohon lewat spms_apply. */
  function mediaFn(ref, checksum, size) {
    return function (E, ctx, p) {
      E.need_(ctx, 'media', 'C');
      var parentEnt = p.entity;
      if (!E.SCHEMA[parentEnt]) throw new Error('Objek media tidak valid.');
      var parent = MemDb.get(parentEnt, p.entity_id);
      if (!parent || !E.canTouch_(ctx, parentEnt, parent)) throw new Error('Objek induk tidak ditemukan / di luar akses.');
      var orgId = parent.org_id || ctx.orgId;
      var dup = MemDb.all('Media').filter(function (m) { return m.checksum === checksum && m.entity_id === p.entity_id && m.deleted != 1; })[0];
      if (dup) return { row: dup, duplicate: true };
      var thumb = String(p.thumb || ''); if (thumb.length > E.APP.CELL_LIMIT) thumb = '';
      var ver = MemDb.all('Media').filter(function (m) { return m.entity_id === p.entity_id && m.category === p.category && m.deleted != 1; }).length + 1;
      var row = { id: E.uid_(), org_id: orgId, entity: parentEnt, entity_id: p.entity_id, category: p.category || 'Lainnya', description: String(p.description || '').slice(0, 300),
        file_id: ref, mime: p.mime, size: size, thumb: thumb, lat: p.lat || '', lng: p.lng || '', captured_at: p.captured_at || E.nowIso_(), checksum: checksum,
        version: ver, created_by: ctx.user.id, created_at: E.nowIso_(), updated_at: E.nowIso_() };
      MemDb.insert('Media', row);
      if (parentEnt === 'Pohon') MemDb.insert('EventPohon', { id: E.uid_(), org_id: orgId, tree_id: parent.id, type: 'Observasi', date: E.fmtDate_(new Date()), description: 'Dokumentasi foto: ' + row.category, created_by: ctx.user.id, created_at: E.nowIso_() });
      E.audit_(ctx, 'media_upload', 'Media', row.id, parentEnt + ' ' + p.entity_id);
      return { row: row };
    };
  }
  H.uploadMedia = async function (p, opId) {
    var w = await whoami();
    if (!MIME_OK.test(p.mime || '')) throw appErr('BAD_FILE', 'Tipe file tidak diizinkan (hanya JPG/PNG/WEBP, MP4/WEBM/MOV, PDF).');
    if (typeof p.data !== 'string' || !p.data) throw appErr('BAD_FILE', 'Berkas kosong.');
    var bin; try { bin = atob(p.data.replace(/^data:[^,]*,/, '')); } catch (e) { throw appErr('BAD_FILE', 'Berkas rusak (base64 tidak valid).'); }
    if (bin.length > 25 * 1024 * 1024) throw appErr('FILE_TOO_LARGE', 'Ukuran file maksimal 25 MB.');
    var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var checksum = hex(await crypto.subtle.digest('SHA-256', bytes));
    var light = Object.assign({}, p); delete light.data;    // data besar tidak ikut diproses mesin
    // uji dulu (izin, induk, duplikat) tanpa mengunggah
    var dry = await runEngine('uploadMedia', ctxFrom(w, 'sb'), light, { write: true, fn: mediaFn('storage:pending', checksum, bytes.length) });
    UNDO = dry.undo; undoAll();
    if (dry.out && dry.out.duplicate) return dry.out;
    var path = w.org.id + '/media/' + String(p.entity).replace(/[^\w-]/g, '') + '/' + String(p.entity_id).replace(/[^\w.-]/g, '') + '/' + checksum.slice(0, 32) + '.' + EXT[p.mime];
    var up = await withTimeout(client().storage.from('spms').upload(path, new Blob([bytes], { type: p.mime }), { upsert: true, contentType: p.mime, cacheControl: '31536000' }));
    if (up.error) {
      var st = Number(up.error.statusCode || up.error.status || 0);
      if (isNet(up.error) || st >= 500 || st === 429) throw netErr('Unggah berkas tertunda (jaringan/server). Akan dicoba lagi.');
      if (st === 403 || /row-level security|Unauthorized|permission/i.test(up.error.message || '')) throw appErr('FORBIDDEN', 'Tidak diizinkan mengunggah berkas (cek role SPMS / lisensi).');
      if (st === 413 || /too large|exceeded/i.test(up.error.message || '')) throw appErr('FILE_TOO_LARGE', 'Berkas terlalu besar untuk penyimpanan.');
      throw appErr('UPLOAD_FAILED', 'Unggah berkas gagal: ' + String(up.error.message || up.error).substr(0, 120));
    }
    try { return await runWrite('uploadMedia', light, opId, mediaFn('storage:' + path, checksum, bytes.length)); }
    catch (e) { if (!e.network && !isNet(e)) client().storage.from('spms').remove([path]).catch(function () {}); throw e; }
  };
  /** Sinkron Mode Lapangan (antrean offline). Anti-dobel lewat op_id di spms_sync_ops. */
  H.syncPush = async function (p) {
    var ops = (p.ops || []).slice(0, 200), results = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (!op.op_id) { results.push({ op_id: '', ok: false, error: 'op_id kosong' }); continue; }
      if (!SYNC_OK[op.action]) { results.push({ op_id: op.op_id, ok: false, error: 'Aksi tidak diizinkan' }); continue; }
      try {
        var r = op.action === 'uploadMedia' ? await H.uploadMedia(op.payload || {}, op.op_id) : await runWrite(op.action, op.payload || {}, op.op_id);
        var res = r && r.dup ? r : smallResult(r);
        results.push({ op_id: op.op_id, ok: true, dup: !!(r && r.dup), result: res });
      } catch (e) {
        var f = toFail(e);   // jaringan → dilempar: antrean tetap di perangkat, yang sudah masuk tidak dobel saat diulang
        results.push({ op_id: op.op_id, ok: false, error: f.message, conflict: true });
      }
    }
    return results;
  };

  // ---------------------------------------------------------------- pintu utama: { action, token, payload } → { ok, data } | { ok:false, error, auth }
  async function call(req) {
    var t0 = Date.now(), action = req && req.action, payload = (req && req.payload) || {};
    try {
      var data;
      if (H[action] && (action === 'login' || action === 'publicInfo')) data = await H[action](payload);
      else {
        await needSession();
        if (action === 'syncPush') data = await H.syncPush(payload);
        else if (action === 'uploadMedia') data = await H.uploadMedia(payload, null);
        else if (WRITE[action]) data = await runWrite(action, payload, null);
        else if (LATER[action]) throw appErr('LATER', 'Fitur ini (' + action + ') aktif setelah Tahap 2c.');
        else if (H[action]) data = await H[action](payload);
        else data = await runEngine(action, ctxFrom(await whoami(), req.token), payload);
      }
      return { ok: true, data: data, ms: Date.now() - t0 };
    } catch (e) {
      var f = toFail(e);   // jaringan → dilempar ulang (dianggap offline oleh tampilan)
      return { ok: false, error: f.code === 'UNAUTHENTICATED' ? 'AUTH: ' + f.message : f.message, auth: f.code === 'UNAUTHENTICATED', code: f.code };
    }
  }

  return { call: call, stage: STAGE, build: BUILD, projectRef: projectRef, cfgProblem: cfgProblem, _store: function () { return STORE; } };
})();
window.SpmsSupa = SpmsSupa;

/* Pengganti google.script.run untuk tampilan SPMS (tanpa mengubah kode tampilan). */
window.google = window.google || {};
window.google.script = { run: (function mk(ok, fail) {
  return {
    withSuccessHandler: function (f) { return mk(f, fail); },
    withFailureHandler: function (f) { return mk(ok, f); },
    api: function (req) {
      SpmsSupa.call(req).then(function (r) { if (ok) ok(r); }, function (e) { if (fail) fail(e); });
    }
  };
})() };
