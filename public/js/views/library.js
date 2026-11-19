import { t, relative, duration } from '../i18n.js';
import { html } from '../ui.js';
import { api } from '../api.js';
import { topbar } from '../app.js';
import { bindQueue } from './podcast.js';

const epItem = (e, extra = '') => html`<a href="/episode/${e.id}"><img class="pod-img" src="${e.image_url || '/icons/icon-192.png'}" alt="" loading="lazy">
  <div class="grow"><div class="small" style="font-weight:700">${e.title}</div><div class="tiny muted">${e.podcast}${e.published_at ? ' · ' + relative(e.published_at) : ''}${extra}</div></div></a>`;

export async function render({ el }) {
  const d = await api('/library');
  el.innerHTML = html`${topbar({ title: t('podcasts.library'), back: '/podcasts' })}
    ${d.inProgress.length ? html`<section class="card"><h3>▶️ ${t('podcasts.continue')}</h3><div class="list">${d.inProgress.map((e) => epItem(e, ' · ' + t('podcasts.resume_at', { time: duration(e.position_s) })))}</div></section>` : ''}
    <section class="card"><h3>🆕 ${t('podcasts.new_episodes')}</h3>
      ${d.fresh.length ? html`<div class="list">${d.fresh.map((e) => epItem(e))}</div>` : html`<p class="small muted">${d.follows.length ? t('podcasts.no_new') : t('podcasts.follow_some')}</p>`}</section>
    <section class="card"><h3>🕒 ${t('podcasts.later')}</h3>
      ${d.queue.length ? html`<div class="list">${d.queue.map((e) => epItem(e))}</div>` : html`<p class="small muted">${t('podcasts.queue_empty')}</p>`}</section>
    <section class="card"><h3>❤️ ${t('podcasts.following_title')}</h3>
      ${d.follows.length ? html`<div class="list">${d.follows.map((p) => html`<a href="/podcast/${p.id}"><img class="pod-img" src="${p.image_url || '/icons/icon-192.png'}" alt="" loading="lazy"><div class="grow"><b class="small">${p.title}</b></div></a>`)}</div>`
        : html`<a class="btn soft" href="/podcasts">${t('podcasts.explore')}</a>`}</section>`.__raw;
  bindQueue(el);
}
