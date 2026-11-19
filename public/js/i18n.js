// Multiidioma: todos los textos viven en /locales/<idioma>.json.
// Para añadir un idioma basta con crear el archivo y añadirlo a /locales/index.json.
let dict = {};
let fallback = {};
let current = 'es';
let available = [{ code: 'es', name: 'Español' }, { code: 'en', name: 'English' }];

const CURRENCY_BY_REGION = { US: 'USD', GB: 'GBP', MX: 'MXN', AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN', BR: 'BRL', CH: 'CHF', CA: 'CAD', AU: 'AUD', JP: 'JPY' };

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url);
  return r.json();
}

export async function loadLocales() {
  try { available = await fetchJson('/locales/index.json'); } catch { /* lista por defecto */ }
}
export const locales = () => available;
export const lang = () => current;

export function detect() {
  const saved = localStorage.getItem('troqly_locale');
  if (saved && available.some((l) => l.code === saved)) return saved;
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const c = l.slice(0, 2).toLowerCase();
    if (available.some((a) => a.code === c)) return c;
  }
  return 'en';
}

export function region() {
  const l = (navigator.languages || [navigator.language || ''])[0] || '';
  return (l.split('-')[1] || '').toUpperCase();
}
export function defaultCurrency() {
  const r = region();
  return CURRENCY_BY_REGION[r] || 'EUR';
}
// Combina el idioma de la app con la región del móvil para fechas y números (p. ej. es-MX)
export function intlLocale() {
  const r = region();
  return r ? `${current}-${r}` : current;
}

export async function setLocale(code) {
  if (!available.some((l) => l.code === code)) code = 'en';
  if (!Object.keys(fallback).length) fallback = await fetchJson('/locales/en.json');
  dict = code === 'en' ? fallback : await fetchJson(`/locales/${code}.json`);
  current = code;
  localStorage.setItem('troqly_locale', code);
  document.documentElement.lang = code;
}

function lookup(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function t(key, vars = {}) {
  let v = lookup(dict, key);
  if (v === undefined) v = lookup(fallback, key);
  if (v && typeof v === 'object' && 'count' in vars) {
    const rule = new Intl.PluralRules(current).select(vars.count);
    v = v[rule] ?? v.other;
  }
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => {
    const x = vars[k];
    if (x === undefined) return `{${k}}`;
    return typeof x === 'number' ? num(x) : String(x);
  });
}

export const num = (n, opts) => new Intl.NumberFormat(intlLocale(), opts).format(n);
export const pct = (n) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(n || 0);
export const money = (n, cur) => new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: 2 }).format(n);
export const date = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat(intlLocale(), opts).format(new Date(d));
export function relative(d) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return rtf.format(0, 'minute');
}
export function duration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function minutesLabel(min) {
  if (min >= 60) {
    return new Intl.NumberFormat(intlLocale(), { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 }).format(min / 60);
  }
  return new Intl.NumberFormat(intlLocale(), { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(min);
}
export const langLabel = (code) => {
  try { return new Intl.DisplayNames([current], { type: 'language' }).of(code); } catch { return code; }
};
