// SPMS · Edge Function "spms-ai" — penghubung AI (Gemini / OpenAI-compatible) untuk SPMS versi Supabase.
// Pasang lewat Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor → nama: spms-ai → tempel berkas ini → Deploy.
//
// Keamanan:
//  - Dipanggil aplikasi dengan JWT pengguna (Verify JWT = ON, bawaan).
//  - spms_ai_check() dijalankan SEBAGAI pengguna: cek anggota aktif, izin AI, lisensi, kuota bulanan, model.
//  - API key organisasi dibaca dengan kunci server (secret / service_role) — TIDAK pernah dikirim ke browser.
//  - Setiap panggilan dicatat di spms_ai_runs (untuk kuota & laporan pemakaian).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const env = (k) => Deno.env.get(k) || '';
function firstKey(jsonName, legacyName) {
  try { const o = JSON.parse(env(jsonName) || '{}'); if (o.default) return o.default; const v = Object.values(o)[0]; if (v) return v; } catch (_e) { /* abaikan */ }
  return env(legacyName);
}
const KINDS = ['test', 'chat', 'gis', 'vision', 'report'];

async function callProvider(c, key, input) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 55000);
  try {
    if (c.provider === 'openai') {
      const content = input.image ? [{ type: 'text', text: input.text }, { type: 'image_url', image_url: { url: 'data:' + input.image.mime + ';base64,' + input.image.data } }] : input.text;
      const body = { model: c.model, temperature: 0.2, messages: [{ role: 'system', content: input.system }, { role: 'user', content }] };
      if (input.json) body.response_format = { type: 'json_object' };
      const r = await fetch((c.base_url || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      return { text: j.choices[0].message.content || '', tin: (j.usage || {}).prompt_tokens || 0, tout: (j.usage || {}).completion_tokens || 0 };
    }
    const parts = [{ text: input.text }];
    if (input.image) parts.push({ inlineData: { mimeType: input.image.mime, data: input.image.data } });
    const gb = { systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2 } };
    if (input.json) gb.generationConfig.responseMimeType = 'application/json';
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(c.model) + ':generateContent', {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(gb) });
    const g = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((g.error && g.error.message) || 'HTTP ' + r.status);
    const cand = (g.candidates || [])[0];
    return { text: cand && cand.content && cand.content.parts ? cand.content.parts.map((x) => x.text || '').join('') : '',
      tin: (g.usageMetadata || {}).promptTokenCount || 0, tout: (g.usageMetadata || {}).candidatesTokenCount || 0 };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Penyedia AI tidak menjawab dalam 55 detik.');
    throw e;
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Gunakan POST.' }, 405);
  const url = env('SUPABASE_URL'), pub = firstKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), secret = firstKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !pub || !secret) return json({ error: 'Konfigurasi Edge Function belum lengkap (kunci proyek tidak terbaca).', code: 'SETUP' }, 500);
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: 'Sesi berakhir. Silakan login kembali.', code: 'UNAUTHENTICATED' }, 401);
  let b;
  try { b = await req.json(); } catch (_e) { return json({ error: 'Body bukan JSON.', code: 'VALIDATION' }, 400); }
  const kind = String(b.kind || ''), input = b.input || {};
  if (!KINDS.includes(kind)) return json({ error: 'Jenis AI tidak dikenal.', code: 'VALIDATION' }, 400);
  if (typeof input.text !== 'string' || typeof (input.system || '') !== 'string') return json({ error: 'Input AI tidak valid.', code: 'VALIDATION' }, 400);
  if (input.text.length > 60000 || String(input.system || '').length > 60000) return json({ error: 'Teks untuk AI terlalu panjang.', code: 'VALIDATION' }, 413);
  if (input.image) {
    if (!/^image\/(jpeg|png|webp)$/.test(String(input.image.mime || '')) || typeof input.image.data !== 'string') return json({ error: 'Kirim foto JPG/PNG/WEBP.', code: 'VALIDATION' }, 400);
    if (input.image.data.length > 7 * 1024 * 1024) return json({ error: 'Foto terlalu besar untuk dianalisis (maks ±5 MB).', code: 'VALIDATION' }, 413);
    if (kind !== 'vision') return json({ error: 'Foto hanya untuk analisis foto.', code: 'VALIDATION' }, 400);
  }

  // 1) izin, lisensi, kuota — dijalankan SEBAGAI pengguna
  const asUser = createClient(url, pub, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const chk = await asUser.rpc('spms_ai_check', { p_org: b.org_id, p_kind: kind });
  if (chk.error) return json({ error: chk.error.message, code: chk.error.hint || 'FORBIDDEN' }, 403);
  const c = chk.data;

  // 2) API key organisasi — kunci server (tidak pernah ke browser)
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const kr = await admin.rpc('spms_ai_key_get', { p_org: b.org_id });
  if (kr.error || !kr.data) return json({ error: 'API key AI belum diisi admin (Pengaturan → AI).', code: 'AI_OFF' }, 400);

  // 3) panggil penyedia AI + catat pemakaian
  let out = { text: '', tin: 0, tout: 0 }, status = 'ok';
  try {
    out = await callProvider(c, kr.data, { system: String(input.system || ''), text: input.text, image: input.image || null, json: !!input.json });
  } catch (e) {
    status = 'error: ' + String((e && e.message) || e).slice(0, 80);
  }
  await admin.rpc('spms_ai_log', { p_org: b.org_id, p_user: c.user_id, p_unit: c.unit, p_provider: c.provider, p_model: c.model, p_kind: kind,
    p_tin: out.tin, p_tout: out.tout, p_status: status });
  if (status !== 'ok') return json({ error: status.replace(/^error: /, ''), code: 'AI_ERROR', provider: c.provider, model: c.model }, 502);
  return json({ text: out.text, tin: out.tin, tout: out.tout, provider: c.provider, model: c.model, used: c.used + 1, limit: c.limit });
});
