import { t, langLabel } from '../i18n.js';
import { html, $, on, toast, errorText } from '../ui.js';
import { api } from '../api.js';
import { topbar } from '../app.js';
import { episodeRow } from './podcasts.js';

export async function render(ctx) {
  const { el, params } = ctx;
  const d = await api(`/podcasts/${Number(params.id)}`);
  const p = d.podcast;
  el.innerHTML = html`${topbar({ title: '', back: '/podcasts' })}
    <section class="row" style="align-items:flex-start"><img class="pod-img lg" src="${p.image_url || '/icons/icon-512.png'}" alt="">
      <div class="grow"><h2>${p.title}</h2><p class="small muted">${p.author || ''}${p.language ? ' · ' + langLabel(p.language) : ''}</p>
      <button class="btn sm ${d.following ? 'soft' : ''}" id="follow">${d.following ? '✓ ' + t('podcasts.following') : t('podcasts.follow')}</button></div></section>
    ${p.description ? html`<p class="small muted mt" style="max-height:6.5em;overflow:hidden">${p.description}</p>` : ''}
    <h3 class="mt">${t('podcasts.episodes', { count: d.episodes.length })}</h3>
    ${d.episodes.length ? html`<ul class="list">${d.episodes.map(episodeRow)}</ul>` : html`<p class="muted">${t('podcasts.no_episodes')}</p>`}`.__raw;

  $('#follow', el).addEventListener('click', async () => {
    try { await api(`/podcasts/${p.id}/follow`, { method: 'POST', body: { follow: !d.following } }); toast(d.following ? t('podcasts.unfollowed') : t('podcasts.followed')); render(ctx); }
    catch (e) { toast(errorText(e)); }
  });
  bindQueue(el);
}

export function bindQueue(el) {
  on(el, 'click', '[data-q]', async (_e, b) => {
    const add = b.dataset.on !== '1';
    try {
      await api(`/queue/${b.dataset.q}`, { method: 'POST', body: { add } });
      b.dataset.on = add ? '1' : '0';
      b.textContent = add ? '✓' : '＋';
      toast(add ? t('podcasts.queued') : t('podcasts.unqueued'));
    } catch (e) { toast(errorText(e)); }
  });
}
