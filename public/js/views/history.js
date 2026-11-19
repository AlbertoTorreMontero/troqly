import { t, date, duration, num } from '../i18n.js';
import { html, $$, toast, errorText, cover } from '../ui.js';
import { api } from '../api.js';
import { group } from '../store.js';
import { topbar } from '../app.js';
import { requireGroup } from './_shared.js';

export async function render(ctx) {
  const { el, go } = ctx;
  if (!requireGroup(el, go)) return;
  const { plays } = await api(`/groups/${group().id}/plays`);
  el.innerHTML = html`${topbar({ title: t('history.title'), back: '/' })}
    ${plays.length ? plays.map((p) => html`<section class="card">
      <div class="row">${cover(p.game)}<div class="grow"><a href="/game/${p.game_id}" style="font-weight:700;text-decoration:none">${p.game}</a>
        <div class="tiny muted">${date(p.ended_at)}${p.duration_s ? ` · ⏱ ${duration(p.duration_s)}` : ''}${p.cooperative ? ` · ${p.coop_won ? t('live.coop_won') : t('live.coop_lost')}` : ''}</div></div>
        <button class="btn sm ghost" data-del="${p.id}" aria-label="${t('common.delete')}">✕</button></div>
      <ul class="list">${(p.players || []).map((x) => html`<li><span class="head" style="width:20px">${x.rank}</span><span>${x.emoji || '🎲'}</span><span class="grow">${x.name}</span>${x.winner ? html`<span class="tag mint">${t('live.winner')}</span>` : ''}<b>${x.score == null ? '' : num(Number(x.score))}</b></li>`)}</ul>
    </section>`) : html`<div class="empty"><div class="big">📜</div><p>${t('home.no_plays')}</p><a class="btn" href="/live">${t('home.new_table')}</a></div>`}`.__raw;
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('history.confirm_delete'))) return;
    try { await api(`/plays/${b.dataset.del}`, { method: 'DELETE' }); render(ctx); } catch (e) { toast(errorText(e)); }
  }));
}
