import { t, minutesLabel } from '../i18n.js';
import { html, $, on } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { topbar } from '../app.js';
import { requireGroup, gameRow } from './_shared.js';

export async function render(ctx) {
  const { el, go } = ctx;
  if (!requireGroup(el, go)) return;
  let players = Number(localStorage.getItem('troqly_sg_p') || 4);
  let minutes = Number(localStorage.getItem('troqly_sg_m') || 60);
  el.innerHTML = html`${topbar({ title: t('suggest.title'), back: '/' })}
    <section class="card">
      <p class="small muted">${t('suggest.players_q')}</p>
      <div class="row" style="justify-content:center;gap:18px"><button class="btn icon soft" data-p="-1" aria-label="−">−</button><span class="code-big" id="pn" style="color:var(--text);font-size:3rem">${players}</span><button class="btn icon soft" data-p="1" aria-label="+">+</button></div>
      <p class="small muted mt">${t('suggest.time_q')}</p>
      <div class="chips">${[20, 30, 45, 60, 90, 120, 180].map((m) => html`<button class="chip ${m === minutes ? 'on' : ''}" data-m="${m}">${minutesLabel(m)}</button>`)}</div>
    </section>
    <div id="res"></div>`.__raw;

  const load = async () => {
    $('#pn', el).textContent = players;
    localStorage.setItem('troqly_sg_p', players);
    localStorage.setItem('troqly_sg_m', minutes);
    const list = await api(`/groups/${store.groupId}/suggest?players=${players}&minutes=${minutes}`);
    $('#res', el).innerHTML = list.length ? html`<h3 class="mt">${t('suggest.results', { count: list.length })}</h3><div class="list">${list.map((g, i) => html`<a href="/game/${g.id}">${gameRow(g, html`<div class="row wrap mt" style="gap:4px">
        ${i === 0 ? html`<span class="tag coral">⭐ ${t('suggest.top')}</span>` : ''}
        ${g.unplayed ? html`<span class="tag amber">📦 ${t('suggest.unplayed')}</span>` : html`<span class="tag">${t('collection.plays', { count: g.plays })}</span>`}
        <span class="tag">${t('suggest.owner', { name: g.owner })}</span></div>`)}</a>`)}</div>`.__raw
      : html`<div class="empty"><div class="big">🤷</div><p>${t('suggest.none')}</p><a class="btn soft" href="/collection">${t('collection.add')}</a></div>`.__raw;
  };
  on(el, 'click', '[data-p]', (_e, b) => { players = Math.max(1, Math.min(12, players + Number(b.dataset.p))); load(); });
  on(el, 'click', '[data-m]', (_e, b) => { minutes = Number(b.dataset.m); el.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b)); load(); });
  await load();
}
