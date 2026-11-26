/* PALM OS edisi Supabase — "layanan Google" tiruan agar kode server PALM OS (.gs) bisa berjalan di browser.
 * Hanya untuk MEMBACA & MENGHITUNG. Penyimpanan data dilakukan Supabase (Tahap 2b), bukan di sini. */
'use strict';
(function (G) {
  function stageErr(what) { var e = new Error(what + ' belum tersedia di edisi Supabase (Tahap 2a)'); e.code = 'STAGE'; return e; }

  /* ---------- SHA-1 / SHA-256 / HMAC sinkron (dipakai hash & tanda tangan QR) ---------- */
  function utf8(s) { return Array.prototype.slice.call(new TextEncoder().encode(String(s))); }
  function toU(b) { return (typeof b === 'string') ? utf8(b) : Array.prototype.map.call(b, function (x) { return x & 255; }); }
  function toS(b) { return b.map(function (x) { return x > 127 ? x - 256 : x; }); }
  function sha256(m) {
    var K = [1116352408, 1899447441, -1245643825, -373957723, 961987163, 1508970993, -1841331548, -1424204075, -670586216, 310598401, 607225278, 1426881987, 1925078388, -2132889090, -1680079193, -1046744716, -459576895, -272742522, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, -1740746414, -1473132947, -1341970488, -1084653625, -958395405, -710438585, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, -2117940946, -1838011259, -1564481375, -1474664885, -1035236496, -949202525, -778901479, -694614492, -200395387, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, -2067236844, -1933114872, -1866530822, -1538233109, -1090935817, -965641998];
    var H = [1779033703, -1150833019, 1013904242, -1521486534, 1359893119, -1694144372, 528734635, 1541459225];
    var l = m.length, w = [], i, j; m = m.slice(); m.push(128); while (m.length % 64 !== 56) m.push(0);
    var bl = l * 8; for (i = 7; i >= 0; i--) m.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
    for (i = 0; i < m.length; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (m[i + j * 4] << 24) | (m[i + j * 4 + 1] << 16) | (m[i + j * 4 + 2] << 8) | m[i + j * 4 + 3];
      for (j = 16; j < 64; j++) {
        var a = w[j - 15], b = w[j - 2];
        var s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var A = H[0], B = H[1], C = H[2], D = H[3], E = H[4], F = H[5], GG = H[6], HH = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7)), ch = (E & F) ^ (~E & GG);
        var t1 = (HH + S1 + ch + K[j] + w[j]) | 0, S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
        var t2 = (S0 + ((A & B) ^ (A & C) ^ (B & C))) | 0;
        HH = GG; GG = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
      }
      H[0] = (H[0] + A) | 0; H[1] = (H[1] + B) | 0; H[2] = (H[2] + C) | 0; H[3] = (H[3] + D) | 0; H[4] = (H[4] + E) | 0; H[5] = (H[5] + F) | 0; H[6] = (H[6] + GG) | 0; H[7] = (H[7] + HH) | 0;
    }
    var out = []; H.forEach(function (h) { out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255); }); return out;
  }
  function sha1(m) {
    var H = [1732584193, -271733879, -1732584194, 271733878, -1009589776], l = m.length, w = [], i, j;
    m = m.slice(); m.push(128); while (m.length % 64 !== 56) m.push(0);
    var bl = l * 8; for (i = 7; i >= 0; i--) m.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
    for (i = 0; i < m.length; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (m[i + j * 4] << 24) | (m[i + j * 4 + 1] << 16) | (m[i + j * 4 + 2] << 8) | m[i + j * 4 + 3];
      for (j = 16; j < 80; j++) { var x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]; w[j] = (x << 1) | (x >>> 31); }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4];
      for (j = 0; j < 80; j++) {
        var f, k; if (j < 20) { f = (b & c) | (~b & d); k = 1518500249; } else if (j < 40) { f = b ^ c ^ d; k = 1859775393; } else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = -1894007588; } else { f = b ^ c ^ d; k = -899497514; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0; e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0;
    }
    var out = []; H.forEach(function (h) { out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255); }); return out;
  }
  function hmac(fn, key, msg) {
    var k = toU(key); if (k.length > 64) k = fn(k); while (k.length < 64) k.push(0);
    var ip = k.map(function (x) { return x ^ 0x36; }), op = k.map(function (x) { return x ^ 0x5c; });
    return fn(op.concat(fn(ip.concat(toU(msg)))));
  }
  function b64(bytes) { var s = ''; toU(bytes).forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }
  function unb64(s) { var r = atob(String(s).replace(/\s/g, '')), o = []; for (var i = 0; i < r.length; i++) o.push(r.charCodeAt(i)); return o; }

  /* ---------- formatDate dengan zona waktu ---------- */
  var DTF = {};
  function parts(d, tz) {
    var f = DTF[tz] || (DTF[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' }));
    var o = {}; f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); if (o.hour === '24') o.hour = '00'; return o;
  }
  function formatDate(d, tz, fmt) {
    d = d instanceof Date ? d : new Date(d); var p = parts(d, tz);
    var off = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
    var sg = off >= 0 ? '+' : '-', ao = Math.abs(off), xxx = sg + String(Math.floor(ao / 60)).padStart(2, '0') + ':' + String(ao % 60).padStart(2, '0');
    var map = { yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, XXX: xxx, Z: xxx.replace(':', ''), EEE: p.weekday };
    return String(fmt).replace(/'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss|XXX|EEE|Z/g, function (t, q) { return q !== undefined ? q : map[t]; });
  }

  var props = {}, cache = {};
  G.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256', SHA_1: 'sha1' }, MacAlgorithm: { HMAC_SHA_1: 'sha1', HMAC_SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: function (alg, s) { return toS((alg === 'sha1' ? sha1 : sha256)(toU(s))); },
    computeHmacSignature: function (alg, val, key) { return toS(hmac(alg === 'sha1' ? sha1 : sha256, key, val)); },
    computeHmacSha256Signature: function (val, key) { return toS(hmac(sha256, key, val)); },
    base64Encode: b64, base64EncodeWebSafe: function (b) { return b64(b).replace(/\+/g, '-').replace(/\//g, '_'); },
    base64Decode: function (s) { return toS(unb64(s)); }, base64DecodeWebSafe: function (s) { return toS(unb64(String(s).replace(/-/g, '+').replace(/_/g, '/'))); },
    newBlob: function (b, mime, name) { var u = toU(b || []); return { getDataAsString: function () { return new TextDecoder().decode(new Uint8Array(u)); }, getBytes: function () { return toS(u); }, getContentType: function () { return mime; }, getName: function () { return name; } }; },
    getUuid: function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); },
    formatDate: formatDate, sleep: function () { }
  };
  G.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return props[k] === undefined ? null : props[k]; }, setProperty: function (k, v) { props[k] = String(v); }, deleteProperty: function (k) { delete props[k]; }, getProperties: function () { return Object.assign({}, props); } }; } };
  G.PropertiesService.getUserProperties = G.PropertiesService.getScriptProperties;
  /* Cache dimatikan: data selalu dari penyimpanan memori yang diisi dari Supabase */
  G.CacheService = { getScriptCache: function () { return { get: function () { return null; }, put: function () { }, putAll: function () { }, getAll: function () { return {}; }, remove: function () { }, removeAll: function () { } }; } };
  G.LockService = { getScriptLock: function () { return { waitLock: function () { }, tryLock: function () { return true; }, releaseLock: function () { } }; } };
  G.Logger = { log: function () { } };
  function fakeSheet(name) {
    return { getName: function () { return name; }, getLastRow: function () { return 1; }, getLastColumn: function () { return 1; }, getMaxRows: function () { return 1; }, getMaxColumns: function () { return 1; },
      getRange: function () { return { getValues: function () { return [['']]; }, setValues: function () { return this; }, setValue: function () { return this; }, setFontWeight: function () { return this; }, setBackground: function () { return this; }, setFontColor: function () { return this; } }; },
      appendRow: function () { }, deleteRow: function () { }, deleteRows: function () { }, deleteColumns: function () { }, insertColumnsAfter: function () { }, setFrozenRows: function () { } };
  }
  var SS = {
    getId: function () { return (G.__SUPA && G.__SUPA.org) || 'supabase'; }, getName: function () { return (G.__SUPA && G.__SUPA.orgName) || 'Supabase'; },
    getUrl: function () { return ''; }, getSheets: function () { return []; }, getSheetByName: function () { return null; },
    insertSheet: function (n) { return fakeSheet(n); }, getSpreadsheetTimeZone: function () { return 'Asia/Jakarta'; }
  };
  G.SpreadsheetApp = { getActiveSpreadsheet: function () { return SS; }, openById: function () { return SS; }, create: function () { throw stageErr('Arsip spreadsheet'); }, getUi: function () { throw stageErr('Menu spreadsheet'); } };
  G.ScriptApp = { getService: function () { return { getUrl: function () { return (G.__SUPA && G.__SUPA.appUrl) || ''; } }; }, getProjectTriggers: function () { return []; }, deleteTrigger: function () { }, newTrigger: function () { throw stageErr('Pemicu terjadwal'); } };
  G.MailApp = { sendEmail: function () { throw stageErr('Email'); }, getRemainingDailyQuota: function () { return 0; } };
  G.UrlFetchApp = { fetch: function () { throw stageErr('Koneksi ke layanan luar (AI/WhatsApp)'); } };
  G.DriveApp = { getFolderById: function () { throw stageErr('Google Drive'); }, createFolder: function () { throw stageErr('Google Drive'); }, getFileById: function () { throw stageErr('Google Drive'); } };
  G.HtmlService = { createHtmlOutput: function () { throw stageErr('Halaman server'); } };
  G.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: function () { throw stageErr('Halaman server'); } };
  G.Session = { getScriptTimeZone: function () { return 'Asia/Jakarta'; }, getActiveUser: function () { return { getEmail: function () { return ''; } }; } };
})(window);
