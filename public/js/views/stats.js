import { t, pct, num, money, date, intlLocale } from '../i18n.js';
import { html, $$ } from '../ui.js';
import { api } from '../api.js';
import { store, group } from '../store.js';
import { topbar } from '../app.js';
import { ACH_ICONS } from './_shared.js';

function heatmap(map) {
  const days = [];
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 7 * 26 + 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // lunes
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    const n = map[k] || 0;
    days.push(html`<i class="${n >= 3 ? 'l3' : n === 2 ? 'l2' : n === 1 ? 'l1' : ''}" title="${date(k)}: ${n}"></i>`);
  }
  return days;
}

export async function render(ctx) {
  const { el, query } = ctx;
  const scope = query.get('scope') || (store.groupId ? 'group' : 'all');
  const s = await api(`/stats${scope === 'group' && store.groupId ? `?group=${store.groupId}` : ''}`);
  const maxPlays = Math.max(1, ...s.most_played.map((g) => g.plays));
  const maxMech = Math.max(1, ...s.by_mechanic.map((m) => m.plays));
  const monthFmt = new Intl.DateTimeFormat(intlLocale(), { month: 'short' });

  el.innerHTML = html`${topbar({ title: t('stats.title'), back: '/' })}
    ${store.groupId ? html`<div class="chips"><a class="chip ${scope === 'group' ? 'on' : ''}" href="/stats?scope=group">${group()?.name}</a><a class="chip ${scope === 'all' ? 'on' : ''}" href="/stats?scope=all">${t('stats.all_groups')}</a></div>` : ''}
    ${s.total === 0 ? html`<div class="empty"><div class="big">📊</div><p>${t('stats.empty')}</p><a class="btn" href="/live">${t('home.new_table')}</a></div>` : html`
    <div class="grid3 mt">
      <div class="stat mint"><b>${pct(s.win_pct)}</b><span>${t('stats.win_pct')}</span></div>
      <div class="stat"><b>${num(s.total)}</b><span>${t('stats.plays')}</span></div>
      <div class="stat amber"><b>${num(s.h_index)}</b><span>${t('stats.h_index')}</span></div>
      <div class="stat coral"><b>${num(s.streak.current)}</b><span>${t('stats.current_streak')}</span></div>
      <div class="stat"><b>${num(s.streak.best)}</b><span>${t('stats.best_streak')}</span></div>
      <div class="stat"><b>${num(s.hours)}</b><span>${t('stats.hours')}</span></div>
    </div>
    <p class="tiny muted mt">${t('stats.h_help', { h: s.h_index })} · ${t('stats.fives_dimes', { fives: s.fives, dimes: s.dimes })}</p>

    <section class="card mt"><h3>${t('stats.heatmap')}</h3>
      <div class="heatmap" role="img" aria-label="${t('stats.heatmap')}">${heatmap(s.heatmap)}</div>
      <div class="row between tiny muted mt"><span>${monthFmt.format(new Date(Date.now() - 180 * 864e5))}</span><span>${monthFmt.format(new Date())}</span></div></section>

    <section class="card"><h3>${t('stats.most_played')}</h3>
      ${s.most_played.map((g) => html`<a href="/game/${g.game_id}" style="text-decoration:none;display:block;margin-bottom:10px">
        <div class="row between small"><b class="ellipsis">${g.name}</b><span class="muted">${t('collection.plays', { count: g.plays })} · ${t('stats.wins_n', { count: g.wins })}</span></div>
        <div class="bar"><i style="width:${(g.plays / maxPlays) * 100}%"></i></div></a>`)}</section>

    <section class="card"><h3>${t('stats.by_mechanic')}</h3>
      ${s.by_mechanic.slice(0, 10).map((m) => html`<div style="margin-bottom:10px"><div class="row between small"><b>${t('mech.' + m.key)}</b><span class="muted">${t('collection.plays', { count: m.plays })} · ${pct(m.wins / m.plays)}</span></div>
        <div class="bar mint"><i style="width:${(m.plays / maxMech) * 100}%"></i></div></div>`)}</section>

    <section class="card"><h3>🏅 ${t('stats.achievements')}</h3>
      ${s.achievements.length ? html`<div class="stack">${s.achievements.map((a) => html`<div class="ach"><span class="ico">${ACH_ICONS[a.key] || '🏅'}</span><div class="grow"><b>${t('ach.' + a.key + '.name')}</b> <span class="tag amber">×${a.n}</span><div class="small muted">${t('ach.' + a.key + '.desc')}</div></div></div>`)}</div>`
        : html`<p class="small muted">${t('stats.no_achievements')}</p>`}
      <details class="mt"><summary class="small link">${t('stats.glossary')}</summary>
        <div class="stack mt">${['ap', 'kingmaker', 'sandbagger', 'record', 'first_unbox', 'streak_3'].map((k) => html`<div class="small"><b>${ACH_ICONS[k]} ${t('ach.' + k + '.name')}</b> — ${t('ach.' + k + '.desc')}</div>`)}
        <div class="small"><b>📦 ${t('collection.pile_of_shame')}</b> — ${t('collection.pile_help')}</div></div></details>
    </section>`}

    <section class="card"><h3>💸 ${t('stats.cost_per_play')}</h3>
      ${s.cost_per_play.length ? html`<ul class="list">${s.cost_per_play.map((c) => html`<li><div class="grow"><b class="small">${c.name}</b><div class="tiny muted">${money(c.price, c.currency || store.user.currency)} · ${t('collection.plays', { count: c.plays })}</div></div>
        <b class="${c.plays ? '' : 'muted'}" style="color:${c.per_play < 5 ? 'var(--mint)' : 'inherit'}">${money(c.per_play, c.currency || store.user.currency)}</b></li>`)}</ul>`
        : html`<p class="small muted">${t('stats.cost_help')}</p>`}
    </section>`.__raw;
  $$('a.chip', el);
}
