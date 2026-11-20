// State global: sesi login, profil, organisasi aktif, role.
import { sb, isNetworkError } from './supabase.js';
import { kv } from './offline.js';
import { APP } from '../config.js';

export const state = {
  session: null,
  profile: null,
  orgs: [],        // [{ id, name, slug, settings, role }]
  org: null,       // organisasi aktif
  role: null,      // role user di organisasi aktif
  offlineMode: false,
};

export const can = {
  edit: () => ['owner', 'admin', 'editor'].includes(state.role),
  admin: () => ['owner', 'admin'].includes(state.role),
  owner: () => state.role === 'owner',
};

export async function loadContext() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (!state.session) return;

  const uid = state.session.user.id;
  try {
    const [p, m] = await Promise.all([
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.from('memberships').select('role, organizations(id, name, slug, settings)').eq('user_id', uid),
    ]);
    if (p.error) throw p.error;
    if (m.error) throw m.error;
    state.profile = p.data;
    state.orgs = (m.data || [])
      .filter((r) => r.organizations)
      .map((r) => ({ ...r.organizations, role: r.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    state.offlineMode = false;
    await kv.set(`context:${uid}`, { profile: state.profile, orgs: state.orgs });
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    // Offline: pakai konteks terakhir yang tersimpan
    const cached = await kv.get(`context:${uid}`);
    if (!cached) throw err;
    state.profile = cached.profile;
    state.orgs = cached.orgs;
    state.offlineMode = true;
  }

  const lastOrg = localStorage.getItem('activeOrg');
  selectOrg(state.orgs.find((o) => o.id === lastOrg)?.id || state.orgs[0]?.id);
}

export function selectOrg(orgId) {
  state.org = state.orgs.find((o) => o.id === orgId) || null;
  state.role = state.org?.role || null;
  if (state.org) localStorage.setItem('activeOrg', state.org.id);
  applyBranding();
}

export function orgSetting(key, fallback = '') {
  return state.org?.settings?.[key] ?? fallback;
}

export function applyBranding() {
  const title = orgSetting('app_title', APP.defaultTitle) || APP.defaultTitle;
  const color = orgSetting('theme_color', APP.defaultTheme) || APP.defaultTheme;
  document.title = title;
  document.documentElement.style.setProperty('--primary', color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  const dark = localStorage.getItem('darkMode');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = (dark === null ? prefersDark : dark === '1') ? 'dark' : 'light';
}
