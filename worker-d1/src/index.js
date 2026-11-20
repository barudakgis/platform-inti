// =====================================================================
// API RINGAN — Cloudflare Workers + D1
// Untuk aplikasi publik yang datanya sederhana: RSVP undangan, ucapan,
// buku tamu, form kontak company profile, silsilah, dsb.
//
//   GET    /health
//   GET    /api/:app/:collection            daftar data (publik bila ada di PUBLIC_READ)
//   GET    /api/:app/:collection/:id        satu data
//   POST   /api/:app/:collection            tambah (publik bila ada di PUBLIC_CREATE)
//   PUT    /api/:app/:collection/:id        ubah  (admin)
//   DELETE /api/:app/:collection/:id        hapus (admin)
//
// Admin = header "Authorization: Bearer <ADMIN_TOKEN>"
// =====================================================================

const NAME_RE = /^[a-z0-9_-]{1,40}$/;
const MAX_BODY = 50_000;          // 50 KB per data (sama dengan batas sel Sheets)
const PUBLIC_LIMIT_PER_HOUR = 30; // batas tambah data publik per IP per jam

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await handle(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return json({ error: status === 500 ? 'Kesalahan server' : err.message }, status, cors);
    }
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, time: new Date().toISOString() });

  const m = url.pathname.match(/^\/api\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!m) throw httpError(404, 'Alamat tidak ditemukan');
  const [, app, collection, id] = m;
  if (!NAME_RE.test(app) || !NAME_RE.test(collection)) throw httpError(400, 'Nama app/collection tidak valid');

  const key = `${app}/${collection}`;
  const isAdmin = await checkAdmin(request, env);
  const publicRead = listEnv(env.PUBLIC_READ).includes(key);
  const publicCreate = listEnv(env.PUBLIC_CREATE).includes(key);

  switch (request.method) {
    case 'GET': {
      if (!isAdmin && !publicRead) throw httpError(401, 'Butuh akses admin');
      if (id) {
        const row = await env.DB.prepare('SELECT * FROM items WHERE app=?1 AND collection=?2 AND id=?3')
          .bind(app, collection, id).first();
        if (!row) throw httpError(404, 'Data tidak ditemukan');
        return json(toItem(row));
      }
      const limit = clamp(Number(url.searchParams.get('limit')) || 100, 1, 500);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      const { results } = await env.DB
        .prepare('SELECT * FROM items WHERE app=?1 AND collection=?2 ORDER BY created_at DESC LIMIT ?3 OFFSET ?4')
        .bind(app, collection, limit, offset).all();
      return json({ items: results.map(toItem), limit, offset });
    }
    case 'POST': {
      if (!isAdmin) {
        if (!publicCreate) throw httpError(401, 'Butuh akses admin');
        await rateLimit(request, env, key);
      }
      const data = await readBody(request);
      const newId = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO items (id, app, collection, data) VALUES (?1, ?2, ?3, ?4)')
        .bind(newId, app, collection, JSON.stringify(data)).run();
      return json({ id: newId, data }, 201);
    }
    case 'PUT': {
      if (!isAdmin) throw httpError(401, 'Butuh akses admin');
      if (!id) throw httpError(400, 'id wajib');
      const data = await readBody(request);
      const r = await env.DB
        .prepare("UPDATE items SET data=?1, updated_at=datetime('now') WHERE app=?2 AND collection=?3 AND id=?4")
        .bind(JSON.stringify(data), app, collection, id).run();
      if (!r.meta.changes) throw httpError(404, 'Data tidak ditemukan');
      return json({ id, data });
    }
    case 'DELETE': {
      if (!isAdmin) throw httpError(401, 'Butuh akses admin');
      if (!id) throw httpError(400, 'id wajib');
      await env.DB.prepare('DELETE FROM items WHERE app=?1 AND collection=?2 AND id=?3')
        .bind(app, collection, id).run();
      return json({ ok: true });
    }
    default:
      throw httpError(405, 'Metode tidak didukung');
  }
}

// ---------------------------------------------------------------- util
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const listEnv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function toItem(row) {
  return { id: row.id, data: JSON.parse(row.data), created_at: row.created_at, updated_at: row.updated_at };
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw httpError(413, 'Data terlalu besar (maks 50 KB)');
  let data;
  try { data = JSON.parse(text); } catch { throw httpError(400, 'Body harus JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'Body harus objek JSON');
  return data;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = listEnv(env.ALLOWED_ORIGINS);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Perbandingan token yang tidak bocor lewat waktu eksekusi
async function checkAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!env.ADMIN_TOKEN || !auth.startsWith('Bearer ')) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(auth.slice(7))),
    crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_TOKEN)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function rateLimit(request, env, key) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Math.floor(Date.now() / 1000);
  const rk = `${key}:${ip}`;
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key=?1').bind(rk).first();
  if (!row || row.reset_at <= now) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)')
      .bind(rk, now + 3600).run();
    return;
  }
  if (row.count >= PUBLIC_LIMIT_PER_HOUR) throw httpError(429, 'Terlalu banyak permintaan, coba lagi nanti');
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key=?1').bind(rk).run();
}
