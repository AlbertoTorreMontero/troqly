import * as I from './i18n.js';
import { t } from './i18n.js';
import { store, refreshMe } from './store.js';
import { api } from './api.js';
import { html, icon, $, spinner, toast } from './ui.js';
import { mountPlayer } from './player.js';

const view = () => document.getElementById('view');
const lazy = (name) => () => import(`./views/${name}.js`);

const ROUTES = [
  ['/', lazy('home'), { auth: false }],
  ['/welcome', lazy('welcome'), { auth: false, bare: true }],
  ['/login', lazy('auth'), { auth: false, bare: true }],
  ['/register', lazy('auth'), { auth: false, bare: true }],
  ['/join/:code', lazy('join'), { auth: false, bare: true }],
  ['/m/:code', lazy('player-table'), { auth: false, bare: true }],
  ['/live', lazy('live-new'), { tab: 'live' }],
  ['/live/:code', lazy('live-host'), { tab: 'live', bare: true }],
  ['/collection', lazy('collection'), { tab: 'collection' }],
  ['/game/new', lazy('game-new'), { tab: 'collection' }],
  ['/game/:id', lazy('game'), { tab: 'collection' }],
  ['/stats', lazy('stats'), { tab: 'home' }],
  ['/group', lazy('group'), { tab: 'home' }],
  ['/history', lazy('history'), { tab: 'home' }],
  ['/suggest', lazy('suggest'), { tab: 'home' }],
  ['/rules', lazy('rules'), { tab: 'rules' }],
  ['/rules/:id', lazy('rulebook'), { tab: 'rules' }],
  ['/podcasts', lazy('podcasts'), { tab: 'podcasts' }],
  ['/podcasts/library', lazy('library'), { tab: 'podcasts' }],
  ['/podcast/:id', lazy('podcast'), { tab: 'podcasts' }],
  ['/episode/:id', lazy('episode'), { tab: 'podcasts' }],
  ['/settings', lazy('settings'), { tab: 'home' }],
].map(([pattern, load, opts]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  return { re, keys, load, auth: true, ...opts };
});

let cleanup = null;

export function go(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else { history.pushState({ inApp: true }, '', path); }
  route();
}
window.troqlyGo = go;

function tabbar(active) {
  const tabs = [
    ['home', '/', 'home', t('nav.home')],
    ['collection', '/collection', 'shelf', t('nav.collection')],
    ['live', '/live', 'table', t('nav.live')],
    ['rules', '/rules', 'book', t('nav.rules')],
    ['podcasts', '/podcasts', 'mic', t('nav.podcasts')],
  ];
  return html`<nav aria-label="${t('nav.label')}">${tabs.map(([k, href, ic, label]) =>
    html`<a href="${href}" class="${active === k ? 'active' : ''}" ${active === k ? html`aria-current="page"` : ''}>${icon(ic)}<span>${label}</span>${k === 'podcasts' ? html`<span class="badge hidden" id="pod-badge"></span>` : ''}</a>`)}</nav>`.__raw;
}

async function route() {
  const path = location.pathname;
  let match = null, params = {};
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = r; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; }
  }
  if (!match) return go('/', { replace: true });
  if (path === '/' && !store.user) return go('/welcome', { replace: true });
  if (match.auth && !store.user) return go(`/welcome?next=${encodeURIComponent(path)}`, { replace: true });

  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* */ } }
  cleanup = null;
  const tb = document.getElementById('tabbar');
  const showTabs = !match.bare && !!store.user;
  tb.classList.toggle('hidden', !showTabs);
  document.body.classList.toggle('no-tabs', !showTabs);
  if (showTabs) tb.innerHTML = tabbar(match.tab);
  view().innerHTML = spinner().__raw;
  window.scrollTo(0, 0);
  try {
    const mod = await match.load();
    cleanup = await mod.render({ el: view(), params, query: new URLSearchParams(location.search), go });
  } catch (e) {
    console.error(e);
    view().innerHTML = html`<div class="empty"><div class="big">🎲</div><p>${t('errors.server')}</p><a class="btn soft" href="/">${t('common.back_home')}</a></div>`.__raw;
  }
  if (showTabs) updateBadge();
}

async function updateBadge() {
  try {
    const { fresh } = await api('/library/badge');
    const b = document.getElementById('pod-badge');
    if (b && fresh) { b.textContent = fresh > 9 ? '9+' : fresh; b.classList.remove('hidden'); }
  } catch { /* sin conexión */ }
}

export function applyTheme(theme) {
  const th = theme || localStorage.getItem('troqly_theme') || 'dark';
  document.documentElement.dataset.theme = th;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th === 'light' ? '#F6F1E7' : '#15131F');
  localStorage.setItem('troqly_theme', th);
}

export function topbar({ title, back, actions = '' }) {
  return html`<header class="topbar">
    ${back ? html`<button class="btn icon soft" data-back="${back}" aria-label="${t('common.back')}">${icon('back')}</button>` : html`<a href="/" class="logo"><img src="/icons/icon.svg" alt="" width="30" height="30">${title ? '' : 'TROQLY'}</a>`}
    <div class="title">${title || ''}</div>${actions}</header>`;
}

async function boot() {
  applyTheme();
  await I.loadLocales();
  try { await refreshMe(); } catch { /* sin conexión */ }
  await I.setLocale(store.user?.locale || I.detect());
  if (store.user?.theme) applyTheme(store.user.theme);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-back]');
    if (b) {
      e.preventDefault();
      if (history.state?.inApp) history.back();
      else go(b.dataset.back);
      return;
    }
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api')) return;
    e.preventDefault();
    go(url.pathname + url.search);
  });
  window.addEventListener('popstate', route);
  mountPlayer();
  await route();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('offline', () => toast(t('errors.offline')));
}

boot();
