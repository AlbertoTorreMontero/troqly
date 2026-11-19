import { t, lang, langLabel, relative, duration } from '../i18n.js';
import { html, $, on, spinner } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { topbar } from '../app.js';

export async function render(ctx) {
  const { el, query } = ctx;
  let langF = query.get('lang') ?? localStorage.getItem('troqly_pod_lang') ?? lang();
  let term = query.get('q') || '';

  el.innerHTML = html`${topbar({ title: t('podcasts.title'), actions: html`<a class="btn sm soft" href="/podcasts/library">🎧 ${t('podcasts.library')}</a>` })}
    <form id="s" class="row"><input class="grow" type="search" name="q" value="${term}" placeholder="${t('podcasts.search')}" aria-label="${t('podcasts.search')}"><button class="btn soft">🔍</button></form>
    <div class="chips mt" id="langs"></div>
    <div id="recs"></div>
    <div id="list">${spinner()}</div>`.__raw;

  const loadRecs = async () => {
    if (!store.groupId || term) { $('#recs', el).innerHTML = ''; return; }
    const recs = await api(`/podcast-recs?group=${store.groupId}`).catch(() => []);
    $('#recs', el).innerHTML = recs.length ? html`<section class="card mt"><h3>✨ ${t('podcasts.for_your_group')}</h3><div class="list">${recs.slice(0, 5).map((e) => html`<a href="/episode/${e.id}">
      <img class="pod-img" src="${e.image_url || '/icons/icon-192.png'}" alt="" loading="lazy"><div class="grow"><div class="small" style="font-weight:700">${e.title}</div>
      <div class="tiny muted">${e.podcast} · ${(e.games || []).slice(0, 2).join(', ')}</div></div></a>`)}</div></section>`.__raw : '';
  };

  const load = async () => {
    $('#list', el).innerHTML = spinner().__raw;
    const qs = new URLSearchParams();
    if (langF) qs.set('lang', langF);
    if (term) qs.set('q', term);
    const r = await api(`/podcasts?${qs}`);
    const langs = r.languages.map((l) => l.language);
    if (langF && !langs.includes(langF)) langs.unshift(langF);
    $('#langs', el).innerHTML = html`<button class="chip ${!langF ? 'on' : ''}" data-l="">${t('podcasts.all_langs')}</button>${langs.map((l) => html`<button class="chip ${langF === l ? 'on' : ''}" data-l="${l}">${langLabel(l)}</button>`)}`.__raw;
    $('#list', el).innerHTML = r.podcasts.length ? html`<div class="list mt">${r.podcasts.map((p) => html`<a href="/podcast/${p.id}">
        <img class="pod-img" src="${p.image_url || '/icons/icon-192.png'}" alt="" loading="lazy">
        <div class="grow"><div style="font-weight:700" class="ellipsis">${p.title}</div><div class="tiny muted ellipsis">${p.author || ''}${p.language ? ' · ' + langLabel(p.language) : ''}</div></div>
        ${p.following ? html`<span class="tag mint">${t('podcasts.following')}</span>` : ''}</a>`)}</div>
        <p class="tiny muted center mt">${t('podcasts.source_note')}</p>`.__raw
      : html`<div class="empty"><div class="big">🎙️</div><p>${t('podcasts.empty')}</p></div>`.__raw;
  };

  on(el, 'click', '[data-l]', (_e, b) => { langF = b.dataset.l; localStorage.setItem('troqly_pod_lang', langF); load(); });
  $('#s', el).addEventListener('submit', (e) => { e.preventDefault(); term = e.target.q.value.trim(); load(); loadRecs(); });
  await Promise.all([load(), loadRecs()]);
}

export function episodeRow(e) {
  return html`<li class="row"><a href="/episode/${e.id}" class="grow" style="text-decoration:none">
    <div class="small" style="font-weight:700">${e.completed ? '✓ ' : ''}${e.title}</div>
    <div class="tiny muted">${e.published_at ? relative(e.published_at) : ''}${e.duration_s ? ' · ' + duration(e.duration_s) : ''}${e.position_s > 15 && !e.completed ? ' · ' + t('podcasts.resume_at', { time: duration(e.position_s) }) : ''}</div></a>
    <button class="btn icon soft" data-q="${e.id}" data-on="${e.queued ? 1 : 0}" aria-label="${e.queued ? t('podcasts.unqueue') : t('podcasts.queue')}">${e.queued ? '✓' : '＋'}</button></li>`;
}
