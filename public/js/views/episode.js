import { t, lang, date, duration } from '../i18n.js';
import { html, $, on, modal, toast, errorText, icon, spinner } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { topbar } from '../app.js';
import { player, playEpisode, toggle, skip, cycleSpeed, onPlayer, fullPlayer } from '../player.js';

export async function render(ctx) {
  const { el, params } = ctx;
  const d = await api(`/episodes/${Number(params.id)}?locale=${lang()}`);
  const ep = d.episode;

  el.innerHTML = html`${topbar({ title: '', back: `/podcast/${ep.podcast_id}` })}
    <div id="pl">${fullPlayer(ep)}</div>
    <h2 class="mt">${ep.title}</h2>
    <p class="small muted"><a href="/podcast/${ep.podcast_id}">${ep.podcast}</a>${ep.published_at ? ' · ' + date(ep.published_at) : ''}${ep.duration_s ? ' · ' + duration(ep.duration_s) : ''}</p>
    <div class="row wrap">
      <button class="btn sm soft" id="queue">${ep.queued ? '✓ ' + t('podcasts.in_queue') : '＋ ' + t('podcasts.queue')}</button>
      ${store.groupId ? html`<button class="btn sm soft" id="share">${icon('share')} ${t('podcasts.share_group')}</button>` : ''}
    </div>
    ${d.games.length ? html`<section class="card mt"><h3>🎲 ${t('podcasts.games_in_episode')}</h3><div class="row wrap">${d.games.map((g) => html`<a class="chip" href="/game/${g.id}">${g.name}</a>`)}</div></section>` : ''}
    <section class="card mt"><h3>✨ ${t('podcasts.summary')}</h3><div id="sum">${ep.summary ? html`<p>${ep.summary}</p>` : spinner()}</div>
      <p class="tiny muted mb0">${t('podcasts.summary_note')}</p></section>
    ${ep.description ? html`<details class="card"><summary class="small" style="font-weight:700;cursor:pointer">${t('podcasts.description')}</summary><p class="small muted mt" style="white-space:pre-wrap">${ep.description}</p></details>` : ''}`.__raw;

  if (!ep.summary) {
    api(`/episodes/${ep.id}/summary`, { method: 'POST', body: { locale: lang() } })
      .then((r) => { $('#sum', el).innerHTML = r.summary ? html`<p>${r.summary}</p>`.__raw : html`<p class="small muted">${t('podcasts.no_summary')}</p>`.__raw; })
      .catch((e) => { $('#sum', el).innerHTML = html`<p class="small muted">${errorText(e)}</p>`.__raw; });
  }

  const repaint = (what) => {
    if (what === 'time' && player.episode?.id === ep.id) {
      const a = player.audio, s = $('#seek', el);
      if (s && !s.matches(':active')) { s.max = Math.round(a.duration || 1); s.value = Math.round(a.currentTime); }
      const tp = $('#t-pos', el); if (tp) tp.textContent = duration(a.currentTime);
      const td = $('#t-dur', el); if (td && a.duration) td.textContent = duration(a.duration);
      return;
    }
    const box = $('#pl', el);
    if (box) box.innerHTML = fullPlayer({ ...ep, position_s: player.episode?.id === ep.id ? player.audio.currentTime : ep.position_s }).__raw;
  };
  const off = onPlayer(repaint);

  on(el, 'click', '[data-pf]', (_e, b) => {
    const a = b.dataset.pf;
    if (a === 'play') { if (player.episode?.id === ep.id) toggle(); else playEpisode(ep, ep.completed ? 0 : ep.position_s || 0); }
    if (a === 'back') skip(-30);
    if (a === 'fwd') skip(30);
    if (a === 'speed') cycleSpeed();
  });
  on(el, 'input', '#seek', (_e, s) => { if (player.episode?.id === ep.id) player.audio.currentTime = Number(s.value); });

  $('#queue', el).addEventListener('click', async (e) => {
    ep.queued = !ep.queued;
    await api(`/queue/${ep.id}`, { method: 'POST', body: { add: ep.queued } }).catch(() => {});
    e.target.textContent = ep.queued ? '✓ ' + t('podcasts.in_queue') : '＋ ' + t('podcasts.queue');
    toast(ep.queued ? t('podcasts.queued') : t('podcasts.unqueued'));
  });
  $('#share', el)?.addEventListener('click', () => {
    const m = modal(html`<h2>${t('podcasts.share_group')}</h2><p class="small muted">${ep.title}</p>
      <label class="field"><span>${t('podcasts.share_message')}</span><input id="msg" type="text" maxlength="200" placeholder="${t('podcasts.share_placeholder')}"></label>
      <button class="btn block" id="send">${t('common.share')}</button><button class="btn block ghost mt" data-close>${t('common.cancel')}</button>`);
    $('#send', m.el).addEventListener('click', async () => {
      try {
        await api(`/groups/${store.groupId}/shares`, { method: 'POST', body: { episode_id: ep.id, message: $('#msg', m.el).value } });
        toast(t('podcasts.shared')); m.close();
      } catch (err) { toast(errorText(err)); }
    });
  });
  return off;
}
