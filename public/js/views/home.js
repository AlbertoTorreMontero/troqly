import { t, relative, num } from '../i18n.js';
import { html, $, icon, cover } from '../ui.js';
import { api } from '../api.js';
import { store, group } from '../store.js';
import { requireGroup, groupSwitcher, bindGroupSwitcher } from './_shared.js';

export async function render(ctx) {
  const { el, go } = ctx;
  if (!requireGroup(el, go)) return;
  const g = group();
  const data = await api(`/groups/${g.id}/home`);
  const hot = data.hot;
  el.innerHTML = html`
    <header class="topbar"><a href="/" class="logo"><img src="/icons/icon.svg" alt="TROQLY" width="30" height="30"></a>${groupSwitcher()}
      <a class="btn icon soft" href="/settings" aria-label="${t('nav.settings')}">${icon('gear')}</a></header>

    ${data.live ? html`<a class="card row" href="/live/${data.live.code}" style="text-decoration:none;border-color:var(--amber)">
        <span style="font-size:1.8rem">🎲</span><div class="grow"><b>${t('home.live_now')}</b><div class="small muted">${data.live.game} · ${data.live.code}</div></div>
        <span class="tag amber">${t('home.go')}</span></a>` : ''}

    <section class="card hero">
      ${hot
        ? html`<p class="tiny muted mb0">🔥 ${t('home.hot_label')}</p><h2>${t('home.hot_streak', { name: hot.name, count: hot.n })}</h2>`
        : html`<p class="tiny muted mb0">${t('home.hello', { name: store.user.display_name })}</p><h2>${t('brand.slogan')}</h2>`}
      <a class="btn block big mt" href="/live">${t('home.new_table')}</a>
    </section>

    <div class="grid2">
      <a class="card" href="/suggest" style="text-decoration:none"><div style="font-size:1.6rem">🤔</div><b>${t('suggest.title')}</b><div class="tiny muted">${t('home.suggest_sub')}</div></a>
      <a class="card" href="/stats" style="text-decoration:none"><div style="font-size:1.6rem">📊</div><b>${t('stats.title')}</b><div class="tiny muted">${t('home.stats_sub', { count: data.plays })}</div></a>
      <a class="card" href="/group" style="text-decoration:none"><div style="font-size:1.6rem">⚔️</div><b>${t('group.rivalries')}</b><div class="tiny muted">${t('home.group_sub', { count: g.members })}</div></a>
      <a class="card" href="/collection?status=unplayed" style="text-decoration:none"><div style="font-size:1.6rem">📦</div><b>${t('collection.pile_of_shame')}</b><div class="tiny muted">${t('home.shame_sub')}</div></a>
    </div>

    ${data.last ? html`<section class="card">
        <div class="row between"><h3 class="mb0">${t('home.last_play')}</h3><a class="link small" href="/history">${t('home.see_all')}</a></div>
        <a class="row mt" href="/game/${data.last.game_id}" style="text-decoration:none">${cover(data.last.game)}<div class="grow"><b>${data.last.game}</b><div class="tiny muted">${relative(data.last.ended_at)}</div></div></a>
        <ul class="list mt">${(data.last.players || []).slice(0, 4).map((p) => html`<li><span>${p.emoji || '🎲'}</span><span class="grow">${p.name}</span>${p.winner ? html`<span class="tag mint">${t('live.winner')}</span>` : ''}<b>${p.score == null ? '' : num(Number(p.score))}</b></li>`)}</ul>
      </section>` : html`<section class="card empty"><div class="big">🎲</div><p>${t('home.no_plays')}</p></section>`}

    ${data.shares.length ? html`<section class="card"><h3>${t('home.shared_episodes')}</h3><div class="list">
        ${data.shares.map((s) => html`<a href="/episode/${s.episode_id}"><img class="pod-img" src="${s.image_url || '/icons/icon-192.png'}" alt="" loading="lazy">
          <div class="grow"><div class="small" style="font-weight:700">${s.title}</div><div class="tiny muted">${s.podcast}</div>
          ${s.message ? html`<div class="small mt">“${s.message}” — ${s.by}</div>` : html`<div class="tiny muted">${t('home.shared_by', { name: s.by })}</div>`}</div></a>`)}</div></section>` : ''}
  `.__raw;
  bindGroupSwitcher(el, () => render(ctx));
}
