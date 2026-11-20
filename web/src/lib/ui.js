// Komponen UI kecil tanpa framework: toast, dialog form, konfirmasi.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, type = 'info', ms = 3500) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('hide'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * Dialog form sederhana.
 * fields: [{ name, label, type='text'|'email'|'password'|'select'|'textarea'|'color'|'number',
 *            value, options:[{value,label}], required, placeholder, hint }]
 * Mengembalikan objek nilai, atau null bila dibatalkan.
 */
export function formDialog({ title, fields, submitText = 'Simpan', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    const inputs = fields.map((f) => {
      const id = `f_${f.name}`;
      const req = f.required ? 'required' : '';
      const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
      let control;
      if (f.type === 'select') {
        control = `<select id="${id}" name="${esc(f.name)}" ${req}>${f.options
          .map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`)
          .join('')}</select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea id="${id}" name="${esc(f.name)}" rows="3" ${req} ${ph}>${esc(f.value)}</textarea>`;
      } else {
        control = `<input id="${id}" name="${esc(f.name)}" type="${f.type || 'text'}" value="${esc(f.value)}" ${req} ${ph}>`;
      }
      return `<label for="${id}">${esc(f.label)}</label>${control}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}`;
    });
    dlg.innerHTML = `
      <form method="dialog" class="form">
        <h3>${esc(title)}</h3>
        ${inputs.join('')}
        <div class="row end">
          <button type="button" class="btn ghost" data-cancel>Batal</button>
          <button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submitText)}</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('[data-cancel]').onclick = () => close(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    form.onsubmit = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      close(values);
    };
    dlg.showModal();
    dlg.querySelector('input,select,textarea')?.focus();
  });
}

export async function confirmDialog(message, okText = 'Ya, lanjutkan') {
  const r = await formDialog({ title: message, fields: [], submitText: okText, danger: true });
  return r !== null;
}

// Tampilkan gambar besar (zoom logo / foto profil)
export function imageDialog(src, alt = '') {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg img-dlg';
  dlg.innerHTML = `<img src="${esc(src)}" alt="${esc(alt)}"><button class="btn ghost" data-close>Tutup</button>`;
  document.body.appendChild(dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector('[data-close]').onclick = close;
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('cancel', close);
  dlg.showModal();
}

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtNum(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits });
}

// CSV aman untuk dibuka di Google Sheets / Excel (pemisah koma, UTF-8 BOM)
export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}
