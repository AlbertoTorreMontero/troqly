import { t } from '../i18n.js';
import { html, $, toast, errorText } from '../ui.js';
import { api } from '../api.js';
import { topbar } from '../app.js';

export async function render({ el, go }) {
  const mechanics = await api('/mechanics');
  el.innerHTML = html`${topbar({ title: t('game_new.title'), back: '/collection' })}
    <form id="f" class="card">
      <label class="field"><span>${t('game_new.name')}</span><input name="name" type="text" maxlength="80" required></label>
      <div class="grid2">
        <label class="field"><span>${t('game_new.min_players')}</span><input name="min_players" type="number" min="1" max="100" value="2" inputmode="numeric"></label>
        <label class="field"><span>${t('game_new.max_players')}</span><input name="max_players" type="number" min="1" max="100" value="4" inputmode="numeric"></label>
        <label class="field"><span>${t('game_new.min_minutes')}</span><input name="min_minutes" type="number" min="1" max="1440" value="30" inputmode="numeric"></label>
        <label class="field"><span>${t('game_new.max_minutes')}</span><input name="max_minutes" type="number" min="1" max="1440" value="60" inputmode="numeric"></label>
      </div>
      <label class="row small" style="margin-bottom:12px"><input type="checkbox" name="cooperative"> ${t('game.coop')}</label>
      <fieldset style="border:0;padding:0;margin:0 0 12px"><legend class="small muted" style="font-weight:600;margin-bottom:6px">${t('filters.mechanic')}</legend>
        <div class="row wrap">${mechanics.map((m) => html`<label class="chip"><input type="checkbox" name="mech" value="${m.key}" style="margin-right:4px">${t('mech.' + m.key)}</label>`)}</div></fieldset>
      <label class="field"><span>${t('collection.status')}</span><select name="status">${['owned', 'wishlist', 'want_to_play', 'unplayed'].map((s) => html`<option value="${s}">${t('status.' + s)}</option>`)}</select></label>
      <button class="btn block">${t('game_new.save')}</button>
    </form>`.__raw;
  $('#f', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const g = await api('/games', { method: 'POST', body: {
        name: f.name.value, min_players: f.min_players.value, max_players: f.max_players.value,
        min_minutes: f.min_minutes.value, max_minutes: f.max_minutes.value, cooperative: f.cooperative.checked,
        mechanics: [...f.querySelectorAll('[name=mech]:checked')].map((x) => x.value),
      } });
      await api('/collection', { method: 'POST', body: { game_id: g.id, status: f.status.value } });
      toast(t('collection.added'));
      go(`/game/${g.id}`, { replace: true });
    } catch (err) { toast(errorText(err)); }
  });
}
