/* PALM OS ↔ Supabase (Platform Inti) — pengganti "dapur" Apps Script (google.script.run).
 * Tampilan PALM OS TIDAK diubah: setiap panggilan rpc(aksi, data) diteruskan ke sini.
 *
 * Cara kerja (Tahap 2a · membaca data):
 *  - Login memakai email & password Platform Inti (Supabase Auth).
 *  - Data dibaca dari tabel palm_* lewat REST Supabase. RLS di database memastikan tiap orang hanya
 *    menerima data yang boleh ia lihat (role × cakupan Region/Estate/Afdeling, organisasi sendiri).
 *  - Perhitungan (dashboard, laporan, peta, workflow, QR, operasi) memakai KODE SERVER PALM OS YANG SAMA
 *    (berkas .gs) yang berjalan di "mesin" (iframe engine.html) → hasilnya identik dengan versi Google Sheets.
 *  - Tahap 2b: aksi simpan/ubah/hapus/persetujuan/workflow dijalankan mesin yang sama; semua perubahannya
 *    dikirim SEKALIGUS ke palm_apply (satu transaksi, diperiksa izin, cakupan & konflik versi di database).
 *    Foto/lampiran diunggah ke Supabase Storage (bucket palmos).
 *  - Tahap 2c: pengaturan (lewat palm_apply), profil & password (Supabase Auth), pengguna & role (palm_member_save),
 *    AI Gemini / WhatsApp gateway / email lewat Edge Function palmos-proxy (kunci rahasia tidak pernah sampai ke browser),
 *    tautan persetujuan WhatsApp (?wfa=) membuka pengajuan langsung setelah login.
 *  - Tahap 3: PWA (pasang di HP, buka offline), MFA TOTP Supabase Auth (ditegakkan database: aal2),
 *    halaman verifikasi QR publik (verify.html), foto lama Google Drive dipindah ke Storage (PindahFoto.gs).
 */
'use strict';
/* tautan verifikasi dokumen dari QR → halaman publik ringan (tanpa login) */
(function () { try { var q = new URLSearchParams(location.search); if (q.get('verify')) location.replace('verify.html' + location.search); } catch (e) { } })();
var PalmSupa = (function () {
  var STAGE = '4', BUILD = '4-4';
  var PAGE = 1000, TTL = 45000, PAR = 4;
  var LATER = {}, MFA_PENDING = null;
  var NA = { trim: 1, archive: 1 };
  var WRITES = { save: 1, remove: 1, transition: 1, batch: 1, wfSave: 1, wfAct: 1, wfNotify: 1, wfAttach: 1, wfDelegate: 1, wfHolidaySeed: 1, settingsSave: 1 };
  var LOCK = Promise.resolve();
  function serial(fn) { var p = LOCK.then(fn, fn); LOCK = p.catch(function () { }); return p; }
  var sb = null, WHO = null, WHO_AT = 0, META = null, BY_SHEET = {}, STORE = {}, ENG = null, ENGP = null, NEEDS = {};
  try { NEEDS = JSON.parse(localStorage.getItem('palm_needs') || '{}') || {}; } catch (e) { NEEDS = {}; }

  /* ------------------------------------------------------------ konfigurasi */
  function cfg() {
    var c = window.PALMOS_SUPABASE || {};
    var url = String(c.url || '').trim().replace(/\s+/g, '').replace(/\/(rest|auth|storage|realtime|functions)\/v1.*$/i, '').replace(/\/+$/, '');
    return { url: url, key: String(c.key || '').replace(/\s+/g, '') };
  }
  function cfgProblem() {
    var c = cfg();
    if (!c.url || c.url.indexOf('GANTI') >= 0) return 'Alamat Supabase belum diisi di palmos/config.js.';
    if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(c.url)) return 'Alamat Supabase di palmos/config.js harus berbentuk https://xxxx.supabase.co';
    if (!c.key || c.key.indexOf('GANTI') >= 0) return 'Kunci publik (publishable key) belum diisi di palmos/config.js.';
    if (/^sb_secret_/.test(c.key) || jwtRole(c.key) === 'service_role') return 'palmos/config.js berisi SECRET key — DILARANG. Ganti dengan publishable key (sb_publishable_…).';
    return '';
  }
  function jwtRole(k) { try { var p = k.split('.'); return p.length === 3 ? (JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))).role || '') : ''; } catch (e) { return ''; } }
  function appErr(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function netErr(msg) { return appErr('NET', msg); }
  function client() {
    if (sb) return sb;
    var p = cfgProblem(); if (p) throw appErr('SETUP', p);
    if (!window.supabase || !window.supabase.createClient) throw netErr('Pustaka Supabase belum termuat (cek koneksi lalu muat ulang).');
    var c = cfg();
    sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'palmos-auth' } });
    return sb;
  }
  function dbErr(e, what) {
    var m = String((e && (e.message || e.error_description || e.msg)) || e || 'Gagal');
    if (/Failed to fetch|NetworkError|network|timeout|Load failed/i.test(m)) return netErr('Gagal terhubung ke Supabase — periksa koneksi internet');
    if (e && (e.code === 'PGRST202' || /Could not find the function/i.test(m))) return appErr('SETUP', 'Fungsi database Tahap 2a belum dipasang (' + (what || '') + '). Jalankan 4_palmos_tahap2a_baca.sql di SQL Editor proyek yang sama dengan isi config.js.');
    if (e && (e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(m))) return appErr('SETUP', 'Tabel PALM OS belum ada di proyek Supabase ini. Jalankan SQL Tahap 1 terlebih dahulu.');
    if (e && (e.code === 'PGRST301' || e.code === 'PGRST303' || /JWT expired|invalid JWT/i.test(m))) return appErr('NOSESSION', 'Sesi berakhir, silakan login kembali');
    if (/permission denied/i.test(m)) return appErr('PERM', 'Akses ditolak database (' + (what || '') + ').');
    return appErr((e && e.hint) || 'ERR', m);
  }
  async function rpcDb(fn, args) {
    var r = await client().rpc(fn, args || {});
    if (r.error) throw dbErr(r.error, fn);
    return r.data;
  }

  /* ------------------------------------------------------------ mesin (kode server PALM OS) */
  function engine() {
    if (ENG && ENG.__engineReady) return Promise.resolve(ENG);
    if (ENGP) return ENGP;
    ENGP = new Promise(function (res, rej) {
      var f = document.createElement('iframe');
      f.style.display = 'none'; f.setAttribute('aria-hidden', 'true'); f.src = 'engine.html?v=' + BUILD;
      var to = setTimeout(function () { ENGP = null; rej(netErr('Mesin PALM OS gagal dimuat (engine.html). Periksa koneksi lalu muat ulang.')); }, 30000);
      f.onload = function () {
        clearTimeout(to);
        var w = f.contentWindow;
        if (!w || !w.__engineReady) { ENGP = null; return rej(appErr('SETUP', 'Mesin PALM OS tidak lengkap (engine.js). Unggah ulang folder palmos/.')); }
        ENG = w; res(w);
      };
      document.body.appendChild(f);
    });
    return ENGP;
  }

  /* ------------------------------------------------------------ sesi */
  var OUT = false;
  async function session() {
    if (OUT) throw appErr('NOSESSION', 'Sesi berakhir, silakan login kembali');
    var r = await client().auth.getSession();
    if (r.error) throw dbErr(r.error, 'auth');
    if (!r.data || !r.data.session) throw appErr('NOSESSION', 'Sesi berakhir, silakan login kembali');
    return r.data.session;
  }
  async function who(force) {
    if (OUT) throw appErr('NOSESSION', 'Sesi berakhir, silakan login kembali');
    if (WHO && !force && Date.now() - WHO_AT < 300000) return WHO;
    await session();
    try { WHO = await rpcDb('palm_whoami', {}); } catch (e) {
      if (e.code === 'MFA') throw appErr('NOSESSION', e.message);
      if (/belum menjadi anggota|dinonaktifkan/i.test(e.message)) { await client().auth.signOut().catch(function () { }); throw appErr('AUTH', e.message); }
      throw e;
    }
    if (OUT) { WHO = null; throw appErr('NOSESSION', 'Sesi berakhir, silakan login kembali'); }
    try { var gu = await client().auth.getUser(); WHO.mfa_on = !!(gu.data && gu.data.user && (gu.data.user.factors || []).some(function (f) { return f.status === 'verified'; })); } catch (e) { WHO.mfa_on = false; }
    WHO_AT = Date.now();
    var eng = await engine();
    eng.__setSession(JSON.stringify({ user: userObj(WHO), lic: licObj(WHO), org: WHO.org_id, orgName: WHO.org_name, appUrl: location.href.split('?')[0].split('#')[0] }));
    return WHO;
  }
  function userObj(w) {
    var u = w.user || {};
    return { id: u.id, username: u.username, name: u.name || u.username, email: u.email || '', role: w.role, scope_type: w.scope_type || 'ALL', scope_codes: w.scope_codes || '',
      active: true, photo: u.photo || '', mfa_on: !!w.mfa_on, must_change: false, last_login: u.last_login || '' };
  }
  function licObj(w) {
    var l = w.license || {};
    if (!w.licensed) return { tier: 'NONE', title: 'Belum berlangganan / berakhir', customer: w.org_name, exp: l.valid_until || '-', groups: '*', max_estates: 0, max_users: 0, readonly: true, valid: false,
      reason: 'Lisensi PALM OS untuk "' + w.org_name + '" belum aktif atau sudah berakhir. Aktifkan di Platform Inti. Data tetap bisa dilihat.' };
    var pk = l.paket || {};
    return { tier: String(pk.plan || l.plan || 'pro').toUpperCase(), title: 'Platform Inti \u00B7 ' + (pk.title || l.plan || 'pro'), plan: pk.plan || l.plan, customer: w.org_name, exp: l.valid_until || 'Tanpa batas',
      groups: pk.groups || '*', max_estates: pk.max_estates == null ? -1 : pk.max_estates,
      max_users: pk.max_users == null ? (l.max_users || -1) : pk.max_users, valid: true, platform: true, stage: STAGE,
      readonly: false, reason: '' };
  }

  /* ------------------------------------------------------------ metadata & muat tabel */
  async function meta() {
    if (META) return META;
    META = await rpcDb('palm_meta', {});
    BY_SHEET = {};
    META.forEach(function (e) { e.rev = {}; Object.keys(e.rename || {}).forEach(function (k) { e.rev[e.rename[k]] = k; }); BY_SHEET[e.sheet] = e; });
    var eng = await engine();
    eng.__setKnown(META.map(function (e) { return e.sheet; }));
    return META;
  }
  function cell(v, t) {
    if (v === null || v === undefined) return '';
    if (t === 'jsonb') return typeof v === 'string' ? v : JSON.stringify(v);
    if (t === 'timestamp with time zone') { var d = new Date(v); return isNaN(d) ? String(v) : d.toISOString(); }
    if (t === 'numeric' || t === 'integer' || t === 'bigint') { var n = Number(v); return isNaN(n) ? v : n; }
    return v;
  }
  function toRow(e, r) {
    var o = {}, x = r.extra || {};
    e.cols.forEach(function (c) { if (c[0] === 'extra') return; o[e.rev[c[0]] || c[0]] = cell(r[c[0]], c[1]); });
    Object.keys(x).forEach(function (k) {
      if (k === '_raw') { Object.keys(x._raw || {}).forEach(function (c) { var rv = x._raw[c]; o[e.rev[c] || c] = (rv && typeof rv === 'object') ? JSON.stringify(rv) : rv; }); return; }
      if (!(k in o)) o[k] = (x[k] && typeof x[k] === 'object') ? JSON.stringify(x[k]) : x[k];
    });
    return o;
  }
  function headers(e, rows) {
    var h = e.cols.filter(function (c) { return c[0] !== 'extra'; }).map(function (c) { return e.rev[c[0]] || c[0]; });
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (h.indexOf(k) < 0) h.push(k); }); });
    return h;
  }
  function orderCol(e) {
    var n = e.cols.map(function (c) { return c[0]; });
    return n.indexOf('created_at') >= 0 ? 'created_at' : n.indexOf('ts') >= 0 ? 'ts' : null;
  }
  function selCols(e) {
    return e.cols.map(function (c) { return c[0]; }).filter(function (c) { return (e.sens || []).indexOf(c) < 0; }).concat(['imported_at'])
      .map(function (c) { return /^[a-z_][a-z0-9_]*$/.test(c) ? c : '"' + c + '"'; }).join(',');
  }
  function q(e, since) {
    var oc = orderCol(e), x = client().from(e.tbl).select(selCols(e), since ? undefined : { count: 'exact' }).eq('org_id', WHO.org_id);
    if (since) {
      var hasUpd = e.cols.some(function (c) { return c[0] === 'updated_at'; });
      x = hasUpd ? x.or('updated_at.gt."' + since + '",imported_at.gt."' + since + '"') : x.gt('imported_at', since);
    }
    if (oc) x = x.order(oc, { ascending: true, nullsFirst: true });
    return x.order('id', { ascending: true });
  }
  async function pages(e, since) {
    var first = await q(e, since).range(0, PAGE - 1);
    if (first.error) throw dbErr(first.error, e.tbl);
    var rows = first.data || [], total = first.count == null ? null : first.count;
    if (since) {
      var off = rows.length, more = rows.length === PAGE;
      while (more) { var r = await q(e, since).range(off, off + PAGE - 1); if (r.error) throw dbErr(r.error, e.tbl); rows = rows.concat(r.data || []); off += PAGE; more = (r.data || []).length === PAGE; }
      return rows;
    }
    var starts = []; for (var s = PAGE; total != null && s < total; s += PAGE) starts.push(s);
    var chunks = [];
    for (var i = 0; i < starts.length; i += PAR) {
      var got = await Promise.all(starts.slice(i, i + PAR).map(function (st) { return q(e, null).range(st, st + PAGE - 1); }));
      got.forEach(function (g) { if (g.error) throw dbErr(g.error, e.tbl); chunks.push(g.data || []); });
    }
    return rows.concat.apply(rows, chunks);
  }
  async function sensMerge(e, rows) {
    if (!(e.sens || []).length || !rows.length) return;
    var data = await rpcDb(e.tbl + '_sens', { p_org: WHO.org_id, p_ids: since_ids(rows) });
    var by = {}; (data || []).forEach(function (s) { by[s.id] = s; });
    rows.forEach(function (r) { var s = by[r.id]; e.sens.forEach(function (c) { r[c] = s ? s[c] : null; }); });
  }
  function since_ids(rows) { return rows.length > 2000 ? null : rows.map(function (r) { return r.id; }); }
  function maxTs(raw, prev) {
    var m = prev || '';
    raw.forEach(function (r) { [r.imported_at, r.updated_at].forEach(function (t) { if (t && t > m) m = t; }); });
    return m;
  }
  async function loadSpecial(sheet) {
    var rows, h;
    if (sheet === '_Users') {
      rows = (await rpcDb('palm_users_brief', { p_org: WHO.org_id })) || [];
      rows = rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = cell(r[k], /_at$|last_login/.test(k) ? 'timestamp with time zone' : ''); }); return o; });
      h = ['id', 'username', 'name', 'email', 'role', 'scope_type', 'scope_codes', 'active', 'photo', 'mfa_on', 'must_change', 'last_login', 'created_at', 'updated_at', 'auth_user'];
    } else {
      rows = (await rpcDb('palm_settings_read', { p_org: WHO.org_id })) || [];
      rows = rows.map(function (r) { return { id: r.id, value: r.value == null ? '' : r.value, updated_at: cell(r.updated_at, 'timestamp with time zone'), updated_by: r.updated_by || '' }; });
      h = ['id', 'value', 'updated_at', 'updated_by'];
    }
    return { h: h, rows: rows };
  }
  async function load(sheet) {
    var eng = await engine(), t;
    if (sheet === '_Users' || sheet === '_Settings') {
      t = await loadSpecial(sheet);
      eng.__setTable(sheet, JSON.stringify(t)); STORE[sheet] = { at: Date.now(), special: 1 }; return;
    }
    var e = BY_SHEET[sheet]; if (!e) return;
    var raw = await pages(e, null);
    await sensMerge(e, raw);
    var rows = raw.map(function (r) { return toRow(e, r); });
    eng.__setTable(sheet, JSON.stringify({ h: headers(e, rows), rows: rows }));
    STORE[sheet] = { at: Date.now(), ts: maxTs(raw), n: rows.length };
  }
  async function refresh(sheet) {
    var st = STORE[sheet]; if (!st) return;
    if (st.special) return load(sheet);
    var e = BY_SHEET[sheet], eng = await engine();
    var raw = await pages(e, st.ts || '1970-01-01T00:00:00Z');
    st.at = Date.now();
    if (!raw.length) return;
    await sensMerge(e, raw);
    var rows = raw.map(function (r) { return toRow(e, r); });
    eng.__mergeRows(sheet, JSON.stringify({ h: headers(e, rows), rows: rows }));
    st.ts = maxTs(raw, st.ts); st.n += rows.length;
  }
  async function loadMany(list, force) {
    var todo = list.filter(function (s) { return force || !STORE[s]; }), i;
    for (i = 0; i < todo.length; i += PAR) await Promise.all(todo.slice(i, i + PAR).map(function (s) { return STORE[s] && !force ? null : load(s); }));
  }
  async function refreshStale() {
    var stale = Object.keys(STORE).filter(function (s) { return Date.now() - STORE[s].at > TTL; });
    for (var i = 0; i < stale.length; i += PAR) await Promise.all(stale.slice(i, i + PAR).map(refresh));
  }
  function needKey(action, p) { return action + (p && p.mod ? ':' + p.mod : '') + (p && p.type ? ':' + p.type : ''); }
  function needKeys(action, p) {
    if (action === 'multi') return ((p && p.calls) || []).map(function (c) { return needKey(c[0], c[1]); });
    return [needKey(action, p)];
  }
  function remember(keys, sheets) {
    var ch = false;
    keys.forEach(function (k) { var a = NEEDS[k] || []; sheets.forEach(function (s) { if (a.indexOf(s) < 0) { a.push(s); ch = true; } }); NEEDS[k] = a; });
    if (ch) try { localStorage.setItem('palm_needs', JSON.stringify(NEEDS)); } catch (e) { }
  }

  async function runEngine(action, payload, device) {
    var eng = await engine(); await who(); await meta();
    var keys = needKeys(action, payload), pre = ['_Settings'];
    keys.forEach(function (k) { (NEEDS[k] || []).forEach(function (s) { if (pre.indexOf(s) < 0) pre.push(s); }); });
    var writing = WRITES[action] || (action === 'notifs' && payload && payload.markRead) || (action === 'multi' && ((payload && payload.calls) || []).some(function (c) { return WRITES[c[0]]; }));
    if (writing) await refreshAll(); else await refreshStale();
    await loadMany(pre);
    var pj = JSON.stringify(payload || {});
    for (var round = 0; round < 9; round++) {
      var out = JSON.parse(eng.__run(action, pj, device));
      var miss = out.missed.filter(function (s) { return !STORE[s]; });
      if (out.missed.length) remember(keys, out.missed);
      if (miss.length && round < 8) { eng.__undo(); await loadMany(miss); continue; }
      if (out.ext.length && round < 8) { eng.__undo(); await external(out.ext, eng); continue; }
      if (!out.ops.length) { eng.__commit(); sendLater(out.fire); return out.s; }
      var res = JSON.parse(out.s);
      if (!res.ok && action !== 'batch' && action !== 'multi') { eng.__undo(); return out.s; }
      try { await commit(eng, action, out); } catch (e) {
        eng.__undo();
        (out.ops || []).forEach(function (o) { if (STORE[o.sheet]) STORE[o.sheet].at = 0; });
        throw e;
      }
      eng.__commit(); sendLater(out.fire);
      if (out.uploads.length) return out.s.replace(/@@UPLOAD:([^@]+)@@/g, function (x, p) { return (LAST_UP[p] || x); });
      return out.s;
    }
    return JSON.parse(eng.__run(action, pj, device)).s;
  }
  var LAST_UP = {};
  async function commit(eng, action, out) {
    var ops = out.ops;
    if (out.uploads.length) {
      var map = {};
      for (var i = 0; i < out.uploads.length; i++) {
        var u = out.uploads[i], bin = dataToBlob(u.data);
        var up = await client().storage.from('palmos').upload(u.path, bin, { contentType: u.mime, upsert: false });
        if (up.error) { if (/fetch|network|timeout/i.test(up.error.message || '')) throw netErr('Gagal mengunggah foto — koneksi terputus'); throw appErr('UPLOAD', 'Gagal mengunggah file ke Supabase Storage: ' + (up.error.message || up.error)); }
        var sg = await client().storage.from('palmos').createSignedUrl(u.path, 60 * 60 * 24 * 365 * 5);
        if (sg.error) throw appErr('UPLOAD', 'File terunggah tetapi alamatnya gagal dibuat: ' + (sg.error.message || sg.error));
        map[u.path] = sg.data.signedUrl; LAST_UP[u.path] = sg.data.signedUrl;
      }
      var js = JSON.stringify(ops).replace(/@@UPLOAD:([^@]+)@@/g, function (x, p) { return map[p] ? JSON.stringify(map[p]).slice(1, -1) : x; });
      ops = JSON.parse(js);
      eng.__fixUploads(JSON.stringify(map));
    }
    var r = await client().rpc('palm_apply', { p_org: WHO.org_id, p_ops: ops, p_action: action });
    if (r.error) throw dbErr(r.error, 'palm_apply');
    var now = new Date().toISOString();
    ops.forEach(function (o) { var st = STORE[o.sheet]; if (st && !st.special) { /* baris sudah ada di mesin; tanda waktu tetap */ } });
    void now; return r.data;
  }
  function dataToBlob(d) {
    var m = /^data:([^;]+);base64,(.*)$/.exec(d), bin = atob(m[2]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  async function refreshAll() {
    var list = Object.keys(STORE);
    for (var i = 0; i < list.length; i += PAR) await Promise.all(list.slice(i, i + PAR).map(refresh));
  }

  /* ------------------------------------------------------------ layanan luar (Edge Function palmos-proxy) */
  async function proxy(calls) {
    var r = await client().functions.invoke('palmos-proxy', { body: { org: WHO.org_id, calls: calls } });
    if (r.error) {
      var m = String(r.error.message || r.error);
      throw appErr('PROXY', /not found|404|Failed to send/i.test(m) ? 'Edge Function palmos-proxy belum dipasang (lihat panduan Tahap 2c).' : 'Layanan luar gagal: ' + m);
    }
    return (r.data && r.data.results) || [];
  }
  async function external(ext, eng) {
    var map = {};
    try {
      var res = await proxy(ext.map(function (x) { return { type: 'http', req: x.req }; }));
      ext.forEach(function (x, i) { var r = res[i] || {}; map[x.key] = { status: r.status || 502, text: r.text || r.error || '' }; });
    } catch (e) { ext.forEach(function (x) { map[x.key] = { status: 503, text: e.message }; }); }
    eng.__setExt(JSON.stringify(map));
  }
  function sendLater(fire) {
    if (!fire || !fire.length) return;
    var calls = fire.map(function (f) { return f.kind === 'mail' ? { type: 'mail', mail: f.mail } : { type: 'http', req: f.req }; });
    proxy(calls).then(function (res) {
      var bad = res.filter(function (r) { return r && r.status >= 300; }).length;
      if (bad && window.toast) toast(bad + ' notifikasi (WA/email) gagal dikirim server.', 'warn');
    }, function (e) { if (window.toast) toast('Notifikasi WA/email belum terkirim: ' + e.message, 'warn'); });
  }

  /* ------------------------------------------------------------ profil, password, pengguna */
  function pwPolicy(pw) { if (!pw || pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw appErr('VALID', 'Password minimal 8 karakter, kombinasi huruf dan angka'); }
  function tempClient() { var c = cfg(); return window.supabase.createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'palmos-temp' } }); }
  async function profile(p) {
    await who();
    var photo = p.photo === undefined ? null : (p.photo || '');
    await rpcDb('palm_profile_save', { p_org: WHO.org_id, p_name: String(p.name || '').slice(0, 120), p_photo: photo });
    var note = '', em = String(p.email || '').trim().toLowerCase(), cur = String((WHO.user || {}).auth_email || '').toLowerCase();
    if (em && em !== cur) {
      var r = await client().auth.updateUser({ email: em });
      if (r.error) throw dbErr(r.error, 'email');
      note = 'Konfirmasi perubahan email dikirim ke ' + em + '.';
    }
    if (STORE._Users) STORE._Users.at = 0;
    await who(true);
    var u = userObj(WHO); u.roleTitle = WHO.role_title; if (note) u.note = note;
    return u;
  }
  async function changePw(p) {
    await who(); pwPolicy(p.pw);
    var email = (WHO.user || {}).auth_email;
    var chk = await tempClient().auth.signInWithPassword({ email: email, password: String(p.old || '') });
    if (chk.error) throw appErr('AUTH', 'Password lama salah');
    var r = await client().auth.updateUser({ password: String(p.pw) });
    if (r.error) throw dbErr(r.error, 'password');
    return { ok: true };
  }
  async function userSave(p) {
    await who();
    var email = String(p.email || '').trim().toLowerCase(), note = '';
    if (!email) throw appErr('VALID', 'Email wajib diisi: di edisi Supabase pengguna masuk memakai email Platform Inti.');
    if (!p.id && p.password) {
      pwPolicy(p.password);
      var su = await tempClient().auth.signUp({ email: email, password: String(p.password), options: { data: { full_name: p.name || '' } } });
      if (su.error && !/already|registered/i.test(su.error.message || '')) throw dbErr(su.error, 'daftar');
      note = (su.data && su.data.user && (su.data.user.identities || []).length) ? 'Akun dibuat. Bila konfirmasi email aktif, pengguna perlu membuka email konfirmasinya dulu.' : 'Email sudah terdaftar — password tidak diubah.';
    } else if (p.password) {
      var rs = await client().auth.resetPasswordForEmail(email, { redirectTo: location.href.split('?')[0].replace(/palmos\/.*$/, '') });
      if (rs.error) throw dbErr(rs.error, 'reset');
      note = 'Admin tidak dapat mengganti password orang lain di Supabase. Tautan reset password dikirim ke ' + email + '.';
    }
    var r = await rpcDb('palm_member_save', { p_org: WHO.org_id, p: { username: p.username, name: p.name, email: email, role: p.role, scope_type: p.scope_type, scope_codes: p.scope_codes, active: p.active !== false } });
    if (STORE._Users) STORE._Users.at = 0;
    return { username: String(p.username || '').toLowerCase(), name: p.name, email: email, role: p.role, active: p.active !== false, status: r.status, note: [r.pesan, note].filter(Boolean).join(' ') };
  }
  async function usersList() {
    var s = await serial(function () { return runEngine('users', {}, ''); }), o = JSON.parse(s);
    if (!o.ok) throw appErr(o.code, o.error);
    try {
      var inv = await rpcDb('palm_invites_list', { p_org: WHO.org_id }) || [], roles = {};
      (S_roles() || []).forEach(function (r) { roles[r.k] = r.t; });
      inv.forEach(function (i) { o.data.push({ id: 'invite:' + i.email, username: i.username, name: (i.name || i.email) + ' (undangan)', email: i.email, role: i.role, roleTitle: roles[i.role] || i.role,
        scope_type: i.scope_type, scope_codes: i.scope_codes, active: false, mfa_on: false, last_login: 'belum mendaftar' }); });
    } catch (e) { }
    return o.data;
  }
  function S_roles() { try { return typeof S !== 'undefined' && S.boot && S.boot.roles; } catch (e) { return null; } }

  /* ------------------------------------------------------------ tautan persetujuan WhatsApp (?wfa=) */
  var WFA = (function () { try { return new URLSearchParams(location.search).get('wfa') || ''; } catch (e) { return ''; } })();
  function wfaLater() {
    if (!WFA) return;
    var tries = 0, iv = setInterval(async function () {
      if (++tries > 1200) return clearInterval(iv);
      if (!(window.__posReady && typeof S !== 'undefined' && S.boot && S.boot.user && window.wxOpen)) return;
      clearInterval(iv); var t = WFA; WFA = '';
      try { history.replaceState(history.state, '', location.pathname); } catch (e) { }
      try {
        var r = await rpcDb('palm_wf_token_resolve', { p_token: t });
        if (r.used && window.toast) toast('Tautan ini sudah pernah dipakai; menampilkan pengajuan ' + (r.code || ''), 'warn');
        go('wfx', { tab: 'todo' }); setTimeout(function () { wxOpen(r.id); }, 400);
      } catch (e) { if (window.toast) toast(e.message, 'err'); }
    }, 500);
  }
  wfaLater();

  /* ------------------------------------------------------------ MFA (TOTP Supabase Auth) */
  async function mfaSetup() {
    await who();
    var fl = await client().auth.mfa.listFactors();
    var old = ((fl.data && fl.data.all) || []).filter(function (f) { return f.status !== 'verified'; });
    for (var i = 0; i < old.length; i++) await client().auth.mfa.unenroll({ factorId: old[i].id });
    var r = await client().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PALM OS ' + new Date().toISOString().slice(0, 16) });
    if (r.error) throw dbErr(r.error, 'mfa');
    MFA_PENDING = r.data.id;
    return { secret: r.data.totp.secret, uri: r.data.totp.uri, qr: r.data.totp.qr_code };
  }
  async function mfaEnable(p) {
    await who();
    if (p.off) {
      var chk = await tempClient().auth.signInWithPassword({ email: (WHO.user || {}).auth_email, password: String(p.password || '') });
      if (chk.error) throw appErr('AUTH', 'Password salah');
      var fl = await client().auth.mfa.listFactors(), vs = ((fl.data && fl.data.totp) || []).filter(function (f) { return f.status === 'verified'; });
      for (var i = 0; i < vs.length; i++) { var u = await client().auth.mfa.unenroll({ factorId: vs[i].id }); if (u.error) throw dbErr(u.error, 'mfa'); }
      await client().auth.refreshSession().catch(function () { });
      await who(true); return { ok: true, mfa_on: false };
    }
    var id = MFA_PENDING;
    if (!id) { var f2 = await client().auth.mfa.listFactors(); id = (((f2.data && f2.data.all) || []).filter(function (f) { return f.status !== 'verified'; })[0] || {}).id; }
    if (!id) throw appErr('VALID', 'Mulai lagi dari tombol "Aktifkan MFA"');
    var cv = await client().auth.mfa.challengeAndVerify({ factorId: id, code: String(p.otp || '').trim() });
    if (cv.error) throw appErr('AUTH', 'Kode MFA salah. Pastikan jam HP tepat, lalu coba kode terbaru.');
    MFA_PENDING = null; await who(true); return { ok: true, mfa_on: true };
  }

  /* ------------------------------------------------------------ PWA: pasang di HP & buka offline */
  (function pwa() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js?v=' + BUILD, { updateViaCache: 'none' }).catch(function () { }); });
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      if (document.getElementById('palmInstall')) return;
      var b = document.createElement('button'); b.id = 'palmInstall'; b.type = 'button'; b.textContent = '\u2B07 Pasang aplikasi';
      b.style.cssText = 'position:fixed;right:14px;bottom:78px;z-index:2500;border:0;border-radius:22px;padding:10px 16px;background:#0f6b4b;color:#fff;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer';
      b.onclick = function () { b.remove(); if (deferred) { deferred.prompt(); deferred = null; } };
      document.body.appendChild(b); setTimeout(function () { if (b.parentNode) b.remove(); }, 60000);
    });
  })();

  /* ------------------------------------------------------------ aksi khusus */
  function pubCache() { try { return JSON.parse(localStorage.getItem('palm_pub') || 'null'); } catch (e) { return null; } }
  async function publicInfo() {
    var eng = await engine(), c = pubCache() || {};
    return { title: c.title || 'PALM OS Enterprise', subtitle: c.subtitle || 'Integrated Plantation Management', logo: c.logo || '', theme: c.theme || null,
      app: eng.APP, license: { tier: 'PLATFORM', title: 'Platform Inti · Supabase' }, supabase: { stage: STAGE, build: BUILD } };
  }
  function savePub(boot) {
    try { var s = boot.settings || {}; localStorage.setItem('palm_pub', JSON.stringify({ title: s.app_title, subtitle: s.app_subtitle, logo: (s.logo || '').length < 400000 ? s.logo : '', theme: s.theme })); } catch (e) { }
  }
  async function login(p) {
    var email = String(p.username || '').trim().toLowerCase();
    if (!email || !p.password) throw appErr('VALID', 'Email dan password wajib diisi');
    if (email.indexOf('@') < 0) throw appErr('AUTH', 'Masuk memakai EMAIL akun Platform Inti (bukan username PALM OS lama).');
    var r = await client().auth.signInWithPassword({ email: email, password: String(p.password) });
    if (r.error) {
      var m = r.error.message || '';
      if (/invalid login|invalid credentials/i.test(m)) throw appErr('AUTH', 'Email atau password salah (pakai password Platform Inti).');
      if (/email not confirmed/i.test(m)) throw appErr('AUTH', 'Email belum dikonfirmasi. Buka tautan konfirmasi di kotak masuk email Anda.');
      throw dbErr(r.error, 'login');
    }
    var lv = await client().auth.mfa.getAuthenticatorAssuranceLevel();
    if (lv.data && lv.data.nextLevel === 'aal2' && lv.data.currentLevel !== 'aal2') {
      if (!p.otp) return { mfa_required: true };
      var fl = await client().auth.mfa.listFactors(), fac = ((fl.data && fl.data.totp) || []).filter(function (f) { return f.status === 'verified'; })[0];
      if (!fac) throw appErr('AUTH', 'Faktor MFA tidak ditemukan. Hubungi admin.');
      var cv = await client().auth.mfa.challengeAndVerify({ factorId: fac.id, code: String(p.otp).trim() });
      if (cv.error) throw appErr('AUTH', 'Kode MFA salah atau kedaluwarsa');
    }
    OUT = false; clearData(); await who(true);
    var boot = await bootMe(p.device);
    boot.token = 'supabase'; boot.expires_at = r.data.session && r.data.session.expires_at ? new Date(r.data.session.expires_at * 1000).toISOString() : '';
    return boot;
  }
  async function bootMe(device) {
    var s = await serial(function () { return runEngine('me', {}, device); }), o = JSON.parse(s);
    if (!o.ok) { var e = appErr(o.code, o.error); throw e; }
    o.data.supabase = { stage: STAGE, build: BUILD, org: WHO.org_name, email: (WHO.user || {}).auth_email };
    savePub(o.data); return o.data;
  }
  function clearData() {
    STORE = {}; WHO = null; WHO_AT = 0;
    if (ENG && ENG.__clearAll) ENG.__clearAll();
  }
  async function usage() {
    await who();
    var c = await rpcDb('palm_capacity', { p_org: WHO.org_id }), LIM = 500 * 1024 * 1024;
    var sheets = (c.tables || []).filter(function (t) { return t.rows > 0; }).map(function (t) { return { name: t.name + ' → ' + t.tbl, rows: t.rows, maxRows: t.rows, cols: 1, cells: t.rows }; })
      .sort(function (a, b) { return b.cells - a.cells; });
    var arch = [];
    return { total: c.db_bytes, limit: LIM, pct: Math.round(c.db_bytes / LIM * 1000) / 10, sheets: sheets, archives: arch, supabase: true, rows: c.rows };
  }

  /* ------------------------------------------------------------ pintu utama */
  async function handle(action, payload, device) {
    if (action === 'ping') { var en = await engine(); return { app: en.APP.NAME, version: en.APP.VERSION, time: new Date().toISOString(), supabase: STAGE }; }
    if (action === 'publicInfo') return publicInfo();
    if (action === 'login') return login(payload || {});
    if (action === 'logout') { OUT = true; clearData(); try { await client().auth.signOut(); } catch (e) { } return { ok: true }; }
    if (action === 'me') { await who(true); return bootMe(device); }
    if (action === 'mfaSetup') return mfaSetup();
    if (action === 'mfaEnable') return mfaEnable(payload || {});
    if (action === 'profile') return profile(payload || {});
    if (action === 'changePw') return changePw(payload || {});
    if (action === 'userSave') return userSave(payload || {});
    if (action === 'users') return usersList();
    if (NA[action]) throw appErr('STAGE', 'Tidak diperlukan di edisi Supabase: database tidak dibatasi 10 juta sel, jadi rapikan sel & arsip tahunan tidak perlu.');
    if (action === 'license' && payload && payload.key) throw appErr('STAGE', 'Lisensi edisi Supabase dikelola di Platform Inti (menu Lisensi organisasi), bukan dengan kunci POS1.');
    if (action === 'usage') return usage();
    var s = await serial(function () { return runEngine(action, payload, device); }), o = JSON.parse(s);
    if (o.ok) return o.data;
    throw appErr(o.code, o.error);
  }
  function rpcString(action, token, payload, device) {
    return handle(action, payload, device).then(function (data) { return JSON.stringify({ ok: true, data: data, supa: 1 }); },
      function (e) {
        var code = (e && e.code) || 'ERR';
        if (code === 'NOSESSION') clearData();
        return JSON.stringify({ ok: false, error: String((e && e.message) || e), code: code });
      });
  }
  async function reload() { var list = Object.keys(STORE); STORE = {}; if (ENG) list.forEach(function (s) { ENG.__dropTable(s); }); WHO = null; }

  return { rpc: rpcString, reload: reload, stage: STAGE, build: BUILD, _store: function () { return STORE; }, _who: function () { return WHO; } };
})();

/* Pengganti google.script.run: tampilan memanggil google.script.run.withSuccessHandler(..).withFailureHandler(..).rpc(...) */
(function () {
  function runner(ok, fail) {
    return {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); },
      rpc: function (action, token, payload, device) {
        PalmSupa.rpc(action, token, payload, device).then(function (s) { if (ok) ok(s); }, function (e) { if (fail) fail(e); });
      }
    };
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = runner(null, null);
})();
