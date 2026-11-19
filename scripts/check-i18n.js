// Comprueba que todos los textos están en los archivos de idioma y que todos los idiomas tienen las mismas claves.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const locDir = path.join(root, 'public', 'locales');
const index = JSON.parse(fs.readFileSync(path.join(locDir, 'index.json'), 'utf8'));
const locs = Object.fromEntries(index.map((l) => [l.code, JSON.parse(fs.readFileSync(path.join(locDir, `${l.code}.json`), 'utf8'))]));
const get = (o, k) => k.split('.').reduce((a, b) => (a == null ? undefined : a[b]), o);
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => {
  const key = p ? `${p}.${k}` : k;
  if (v && typeof v === 'object' && !('other' in v)) return flat(v, key);
  return [key];
});
let errors = 0;
const fail = (m) => { errors++; console.error('✗', m); };

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(path.join(root, 'public', 'js'));
const used = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('([a-z_0-9]+\.[a-z_0-9.]+)'/g)) { if (!/[._]$/.test(m[1])) used.add(m[1]); }

const seed = require(path.join(root, 'server', 'seed-games.js'));
const mechs = new Set(seed.flatMap((g) => g[9].split(',')));
mechs.forEach((m) => used.add(`mech.${m}`));
['owned', 'wishlist', 'want_to_play', 'unplayed'].forEach((s) => used.add(`status.${s}`));
['ap', 'kingmaker', 'sandbagger', 'record', 'first_unbox', 'streak_3', 'streak_5', 'streak_10'].forEach((a) => ['name', 'desc', 'line'].forEach((x) => used.add(`ach.${a}.${x}`)));
['processing', 'error', 'error_ai', 'error_quota'].forEach((s) => used.add(`rules.status_${s}`));
const serverSrc = fs.readdirSync(path.join(root, 'server')).map((f) => fs.readFileSync(path.join(root, 'server', f), 'utf8')).join('\n');
for (const m of serverSrc.matchAll(/error: '([a-z_]+)'/g)) used.add(`errors.${m[1]}`);
for (const m of serverSrc.matchAll(/AiError\('([a-z_]+)'/g)) used.add(`errors.${m[1]}`);
['quota', 'model_not_found', 'bad_key_or_request', 'ai_error', 'offline', 'server'].forEach((c) => used.add(`errors.${c}`));

for (const [code, d] of Object.entries(locs)) {
  for (const k of used) {
    const v = get(d, k);
    if (v === undefined) fail(`[${code}] falta la clave ${k}`);
    else if (typeof v !== 'string' && !(v && typeof v.other === 'string')) fail(`[${code}] ${k} no es texto`);
  }
}
const base = new Set(flat(locs.en));
for (const [code, d] of Object.entries(locs)) {
  const keys = new Set(flat(d));
  for (const k of base) if (!keys.has(k)) fail(`[${code}] falta ${k} (existe en en)`);
  for (const k of keys) if (!base.has(k)) fail(`[${code}] sobra ${k} (no existe en en)`);
}
// Textos sueltos dentro de las plantillas (heurística)
for (const f of files) {
  if (f.endsWith('ui.js')) continue;
  const src = fs.readFileSync(f, 'utf8').replace(/\$\{[^}]*\}/g, '');
  for (const m of src.matchAll(/>([^<>{}`$]*[A-Za-zÁÉÍÓÚáéíóúñ]{3,}[^<>{}`$]*)</g)) {
    const txt = m[1].trim();
    if (txt && !/^(TROQLY ?·?|d\d+|[−+=✓✕＋·]+)$/.test(txt) && !/=>|\(|\)|;|&&|\|\|/.test(txt)) fail(`texto fijo en ${path.relative(root, f)}: "${txt}"`);
  }
}
console.log(errors ? `\n${errors} problemas` : `✓ i18n OK: ${used.size} claves usadas, ${Object.keys(locs).length} idiomas, sin textos fijos`);
process.exit(errors ? 1 : 0);
