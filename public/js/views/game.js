import { t, minutesLabel, num, money, relative, duration } from '../i18n.js';
import { html, $, toast, errorText, cover } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { topbar } from '../app.js';

export async function render(ctx) {
  const { el, params, go } = ctx;
  const id = Number(params.id);
  const gq = store.groupId ? `?group=${store.groupId}` : '';
  const [d, eps, plays] = await Promise.all([
    api(`/games/${id}${gq}`),
    api(`/games/${id}/episodes`).catch(() => []),
    store.groupId ? api(`/groups/${store.groupId}/plays?game=${id}`).then((r) => r.plays).catch(() => []) : [],
  ]);
  const g = d.game;
  const mine = d.mine;
  const players = g.min_players === g.max_players ? g.min_players : `${g.min_players}–${g.max_players}`;
  const mins = g.min_minutes === g.max_minutes ? minutesLabel(g.min_minutes) : `${minutesLabel(g.min_minutes)}–${minutesLabel(g.max_minutes)}`;
  const cpp = mine?.price_paid ? Number(mine.price_paid) / Math.max(1, d.plays) : null;

  el.innerHTML = html`${topbar({ title: '', back: '/collection' })}
    <section class="row" style="align-items:flex-start">${cover(g.name, 'lg')}
      <div class="grow"><h1>${g.name}</h1><p class="muted small">${g.year || ''}${g.cooperative ? html` · 🤝 ${t('game.coop')}` : ''}</p>
      <div class="row wrap" style="gap:6px">${(g.mechanics || []).map((m) => html`<span class="tag">${t('mech.' + m)}</span>`)}</div></div></section>

    <div class="grid3 mt">
      <div class="stat"><b>${players}</b><span>${t('filters.players')}</span></div>
      <div class="stat"><b style="font-size:1.1rem">${mins}</b><span>${t('filters.time')}</span></div>
      <div class="stat mint"><b>${num(d.plays)}</b><span>${t('game.group_plays')}</span></div>
    </div>
    ${d.record ? html`<div class="card mt row"><span style="font-size:1.6rem">🏆</span><div class="grow"><b>${t('game.record', { name: d.record.name, score: Number(d.record.score) })}</b></div></div>` : ''}

    <section class="card mt">
      <h3>${t('game.my_copy')}</h3>
      <form id="mine" class="grid2">
        <label class="field"><span>${t('collection.status')}</span><select name="status"><option value="">—</option>${['owned', 'wishlist', 'want_to_play', 'unplayed'].map((s) => html`<option value="${s}" ${mine?.status === s ? 'selected' : ''}>${t('status.' + s)}</option>`)}</select></label>
        <label class="field"><span>${t('game.price', { cur: store.user.currency })}</span><input name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${mine?.price_paid ?? ''}"></label>
      </form>
      ${cpp != null ? html`<p class="small">${t('game.cost_per_play', { value: money(cpp, mine.currency || store.user.currency) })}</p>` : ''}
    </section>

    <a class="btn block big" href="/live?game=${g.id}">${t('game.play_now')}</a>

    <section class="card mt">
      <div class="row between"><h3 class="mb0">📖 ${t('rules.title')}</h3><a class="link small" href="/rules?game=${g.id}">${t('rules.upload_short')}</a></div>
      ${d.rulebooks.length ? html`<div class="list mt">${d.rulebooks.map((r) => html`<a href="/rules/${r.id}"><span>📄</span><div class="grow">${r.title}<div class="tiny muted">${t('rules.pages', { count: r.pages })}</div></div><span class="tag coral">${t('rules.ask')}</span></a>`)}</div>`
        : html`<p class="small muted mt">${t('game.no_manual')}</p>`}
    </section>

    <section class="card">
      <h3>🎧 ${t('game.listen')}</h3>
      ${eps.length ? html`<div class="list">${eps.slice(0, 8).map((e) => html`<a href="/episode/${e.id}"><img class="pod-img" src="${e.image_url || '/icons/icon-192.png'}" alt="" loading="lazy">
          <div class="grow"><div class="small" style="font-weight:700">${e.title}</div><div class="tiny muted">${e.podcast}${e.published_at ? ' · ' + relative(e.published_at) : ''}${e.duration_s ? ' · ' + duration(e.duration_s) : ''}</div></div></a>`)}</div>`
        : html`<p class="small muted">${t('game.no_episodes')}</p><a class="link small" href="/podcasts?q=${encodeURIComponent(g.name)}">${t('game.search_podcasts')}</a>`}
    </section>

    ${plays.length ? html`<section class="card"><h3>${t('history.title')}</h3><ul class="list">${plays.slice(0, 10).map((p) => {
      const w = (p.players || []).filter((x) => x.winner).map((x) => x.name).join(', ');
      return html`<li><div class="grow"><div class="small">${p.cooperative ? (p.coop_won ? t('live.coop_won') : t('live.coop_lost')) : t('game.won_by', { name: w || '—' })}</div><div class="tiny muted">${relative(p.ended_at)}</div></div></li>`;
    })}</ul></section>` : ''}`.__raw;

  const form = $('#mine', el);
  const save = async () => {
    const status = form.status.value;
    try {
      if (!status && mine) await api(`/collection/${mine.id}`, { method: 'DELETE' });
      else if (status) await api('/collection', { method: 'POST', body: { game_id: id, status, price_paid: form.price.value, currency: store.user.currency } });
      toast(t('common.saved'));
      render(ctx);
    } catch (e) { toast(errorText(e)); }
  };
  form.status.addEventListener('change', save);
  form.price.addEventListener('change', () => { if (!form.status.value) form.status.value = 'owned'; save(); });
}
