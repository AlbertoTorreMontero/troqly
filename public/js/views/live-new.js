import { t } from '../i18n.js';
import { html, $, on, toast, errorText } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { topbar } from '../app.js';
import { requireGroup, gameRow } from './_shared.js';

export async function render(ctx) {
  const { el, go, query } = ctx;
  if (!requireGroup(el, go)) return;
  const groupGames = await api(`/collection?group=${store.groupId}`);
  const uniq = [...new Map(groupGames.filter((g) => g.status !== 'wishlist').map((g) => [g.game_id, g])).values()];
  let chosen = query.get('game') ? Number(query.get('game')) : null;

  el.innerHTML = html`${topbar({ title: t('live.new_title'), back: '/' })}
    <p class="muted">${t('live.new_sub')}</p>
    <input type="search" id="q" placeholder="${t('collection.search_placeholder')}" aria-label="${t('collection.search_placeholder')}" autocomplete="off">
    <div class="list mt" id="games"></div>
    <section class="card mt" id="opts">
      <label class="row small" style="margin-bottom:8px"><input type="checkbox" id="host_plays" checked> ${t('live.host_plays')}</label>
      <label class="row small"><input type="checkbox" id="low_wins"> ${t('live.low_wins')}</label>
    </section>
    <button class="btn block big" id="create" disabled>${t('live.create')}</button>`.__raw;

  const list = $('#games', el);
  const paint = (rows) => {
    list.innerHTML = rows.length ? rows.map((g) => {
      const gid = g.game_id || g.id;
      return html`<li role="button" tabindex="0" data-g="${gid}" style="cursor:pointer;${chosen === gid ? 'background:color-mix(in srgb,var(--coral) 14%,transparent);border-radius:14px;padding-left:8px' : ''}">${gameRow(g)}${chosen === gid ? html`<span class="tag coral">✓</span>` : ''}</li>`.__raw;
    }).join('') : html`<p class="muted small">${t('live.no_games')}</p>`.__raw;
    $('#create', el).disabled = !chosen;
  };
  let current = uniq;
  if (chosen && !uniq.some((g) => g.game_id === chosen)) {
    try { const d = await api(`/games/${chosen}`); current = [{ ...d.game, game_id: d.game.id }, ...uniq]; } catch { /* */ }
  }
  paint(current);
  let timer;
  $('#q', el).addEventListener('input', (e) => {
    clearTimeout(timer);
    const v = e.target.value.trim();
    timer = setTimeout(async () => {
      if (!v) return paint(current = uniq);
      const mineMatch = uniq.filter((g) => g.name.toLowerCase().includes(v.toLowerCase()));
      const all = await api(`/games?q=${encodeURIComponent(v)}`);
      const ids = new Set(mineMatch.map((g) => g.game_id));
      paint(current = [...mineMatch, ...all.filter((g) => !ids.has(g.id)).map((g) => ({ ...g, game_id: g.id }))]);
    }, 200);
  });
  on(list, 'click', '[data-g]', (_e, li) => { chosen = Number(li.dataset.g); paint(current); });
  $('#create', el).addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('/live', { method: 'POST', body: { group_id: store.groupId, game_id: chosen, host_plays: $('#host_plays', el).checked, low_wins: $('#low_wins', el).checked } });
      go(`/live/${r.code}`);
    } catch (err) { toast(errorText(err)); e.target.disabled = false; }
  });
}
