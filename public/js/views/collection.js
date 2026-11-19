import { t, minutesLabel } from '../i18n.js';
import { html, $, $$, modal, toast, errorText, on } from '../ui.js';
import { api } from '../api.js';
import { store, group } from '../store.js';
import { topbar } from '../app.js';
import { gameRow } from './_shared.js';

const STATUSES = ['owned', 'wishlist', 'want_to_play', 'unplayed'];

export async function render(ctx) {
  const { el, query } = ctx;
  const f = {
    scope: query.get('scope') || 'mine',
    status: query.get('status') || 'all',
    players: '', time: '', mech: '',
  };
  const mechanics = await api('/mechanics');
  let items = [];

  el.innerHTML = html`${topbar({ title: t('collection.title'), actions: html`<button class="btn sm" id="add">+ ${t('collection.add')}</button>` })}
    ${store.groupId ? html`<div class="chips" role="tablist">
      <button class="chip" data-scope="mine">${t('collection.mine')}</button>
      <button class="chip" data-scope="group">${t('collection.group', { name: group()?.name || '' })}</button></div>` : ''}
    <div class="chips mt" id="st">
      <button class="chip" data-st="all">${t('collection.all')}</button>
      ${STATUSES.map((s) => html`<button class="chip" data-st="${s}">${s === 'unplayed' ? '📦 ' + t('collection.pile_of_shame') : t('status.' + s)}</button>`)}
    </div>
    <div class="grid3 mt">
      <select id="fp" aria-label="${t('filters.players')}"><option value="">👥 ${t('filters.players')}</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => html`<option value="${n}">${n}${n === 8 ? '+' : ''}</option>`)}</select>
      <select id="ft" aria-label="${t('filters.time')}"><option value="">⏱ ${t('filters.time')}</option>
        ${[30, 60, 90, 120].map((m) => html`<option value="${m}">≤ ${minutesLabel(m)}</option>`)}<option value="999">${t('filters.long')}</option></select>
      <select id="fm" aria-label="${t('filters.mechanic')}"><option value="">⚙️ ${t('filters.mechanic')}</option>${mechanics.map((m) => html`<option value="${m.key}">${t('mech.' + m.key)}</option>`)}</select>
    </div>
    <p class="tiny muted mt" id="count"></p>
    <div class="list" id="list"></div>`.__raw;

  const paint = () => {
    $$('[data-scope]', el).forEach((b) => b.classList.toggle('on', b.dataset.scope === f.scope));
    $$('[data-st]', el).forEach((b) => b.classList.toggle('on', b.dataset.st === f.status));
    let rows = items.filter((g) => {
      if (f.status === 'unplayed' && !(g.status === 'unplayed' || (g.status === 'owned' && g.plays === 0))) return false;
      if (f.status !== 'all' && f.status !== 'unplayed' && g.status !== f.status) return false;
      if (f.players) { const n = Number(f.players); if (g.min_players > n || (n < 8 && g.max_players < n)) return false; }
      if (f.time) { const m = Number(f.time); if (m === 999 ? g.max_minutes < 120 : g.min_minutes > m) return false; }
      if (f.mech && !g.mechanics.includes(f.mech)) return false;
      return true;
    });
    if (f.scope === 'group') {
      const seen = new Map();
      rows.forEach((g) => { const s = seen.get(g.game_id); if (s) s.owners.push(g.owner); else seen.set(g.game_id, { ...g, owners: [g.owner] }); });
      rows = [...seen.values()];
    }
    $('#count', el).textContent = t('collection.count', { count: rows.length });
    $('#list', el).innerHTML = rows.length
      ? rows.map((g) => html`<a href="/game/${g.game_id}">${gameRow(g, html`<div class="row wrap mt" style="gap:4px">
          <span class="tag ${g.status === 'owned' ? 'mint' : g.status === 'unplayed' ? 'coral' : g.status === 'wishlist' ? 'amber' : ''}">${t('status.' + g.status)}</span>
          <span class="tag">${t('collection.plays', { count: g.plays })}</span>
          ${f.scope === 'group' ? html`<span class="tag">${g.owners.join(', ')}</span>` : ''}</div>`)}</a>`.__raw).join('')
      : html`<div class="empty"><div class="big">${f.status === 'unplayed' ? '🎉' : '🧩'}</div><p>${f.status === 'unplayed' ? t('collection.no_shame') : t('collection.empty')}</p></div>`.__raw;
  };
  const load = async () => {
    items = await api(f.scope === 'group' && store.groupId ? `/collection?group=${store.groupId}` : '/collection');
    paint();
  };

  on(el, 'click', '[data-scope]', (_e, b) => { f.scope = b.dataset.scope; load(); });
  on(el, 'click', '[data-st]', (_e, b) => { f.status = b.dataset.st; paint(); });
  $('#fp', el).addEventListener('change', (e) => { f.players = e.target.value; paint(); });
  $('#ft', el).addEventListener('change', (e) => { f.time = e.target.value; paint(); });
  $('#fm', el).addEventListener('change', (e) => { f.mech = e.target.value; paint(); });
  $('#add', el).addEventListener('click', () => addGameModal(load));
  await load();
}

export function addGameModal(onDone) {
  const m = modal(html`<h2>${t('collection.add_title')}</h2>
    <input type="search" id="q" placeholder="${t('collection.search_placeholder')}" aria-label="${t('collection.search_placeholder')}" autocomplete="off">
    <div class="list mt" id="res"></div>
    <p class="small muted mt">${t('collection.not_found')} <a class="link" href="/game/new" data-close>${t('collection.add_manual')}</a></p>`);
  const res = $('#res', m.el);
  let timer;
  const search = async () => {
    const list = await api(`/games?q=${encodeURIComponent($('#q', m.el).value.trim())}`);
    res.innerHTML = list.map((g) => html`<li>${gameRow(g)}<select data-add="${g.id}" aria-label="${t('collection.status')}" style="width:auto;min-height:40px">
        <option value="">+ ${t('collection.add')}</option>${STATUSES.map((s) => html`<option value="${s}">${t('status.' + s)}</option>`)}</select></li>`.__raw).join('');
  };
  $('#q', m.el).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  on(res, 'change', '[data-add]', async (_e, s) => {
    if (!s.value) return;
    try {
      await api('/collection', { method: 'POST', body: { game_id: Number(s.dataset.add), status: s.value } });
      toast(t('collection.added'));
      s.closest('li').style.opacity = 0.5;
      onDone?.();
    } catch (e) { toast(errorText(e)); }
  });
  search();
  setTimeout(() => $('#q', m.el).focus(), 50);
}
