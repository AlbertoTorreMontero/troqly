import { t, pct } from '../i18n.js';
import { html, $, toast, errorText } from '../ui.js';
import { api } from '../api.js';
import { store, group, refreshMe, setGroup } from '../store.js';
import { topbar } from '../app.js';
import { requireGroup, shareInvite, inviteUrl } from './_shared.js';

export async function render(ctx) {
  const { el, go } = ctx;
  if (!requireGroup(el, go)) return;
  const g = group();
  const [info, rk] = await Promise.all([api(`/groups/${g.id}`), api(`/groups/${g.id}/ranking`)]);
  el.innerHTML = html`${topbar({ title: g.name, back: '/' })}
    <section class="card">
      <h3>${t('group.invite')}</h3>
      <p class="small muted">${t('group.invite_help')}</p>
      <div class="row"><input type="text" readonly value="${inviteUrl(info.group.invite_code)}" aria-label="${t('group.copy_link')}" class="grow small"><button class="btn" id="share">${t('common.share')}</button></div>
    </section>

    <section class="card">
      <h3>${t('group.ranking')}</h3>
      ${rk.ranking.length ? html`<ul class="list">${rk.ranking.map((r, i) => html`<li>
        <b style="width:24px" class="head">${i + 1}</b>
        <div class="grow"><div style="font-weight:700">${r.display_name}${r.id === store.user.id ? html` <span class="tag">${t('common.you')}</span>` : ''}</div>
          <div class="tiny muted">${t('group.wins_of', { wins: r.wins, plays: r.plays })}${r.streak.current >= 2 ? html` · 🔥 ${t('group.streak', { count: r.streak.current })}` : ''}</div>
          <div class="bar mint mt" style="height:6px"><i style="width:${Math.round(r.win_pct * 100)}%"></i></div></div>
        <b class="head" style="color:var(--mint)">${pct(r.win_pct)}</b></li>`)}</ul>` : html`<p class="muted">${t('group.no_ranking')}</p>`}
    </section>

    <section class="card">
      <h3>${t('group.rivalries')}</h3>
      ${rk.rivalries.length ? rk.rivalries.map((v) => {
        const lead = v.me === v.them ? 'tie' : v.me > v.them ? 'me' : 'them';
        const top = v.top_game;
        const line = top
          ? (top.me > top.them ? t('group.rival_you_win', { name: v.name, me: top.me, them: top.them, game: top.name })
            : top.them > top.me ? t('group.rival_they_win', { name: v.name, me: top.me, them: top.them, game: top.name })
            : t('group.rival_tie', { name: v.name, me: top.me, them: top.them, game: top.name }))
          : '';
        const total = v.me + v.them || 1;
        return html`<div class="mb0" style="margin-bottom:14px">
          <div class="row between small"><b>${t('common.you')}</b><b>${v.name}</b></div>
          <div class="vs"><span class="n" style="color:var(--mint)">${v.me}</span><div class="bar"><i style="width:${(v.me / total) * 100}%"></i></div><span class="n" style="color:var(--coral)">${v.them}</span></div>
          <p class="small ${lead === 'them' ? '' : 'muted'}">${line}</p></div>`;
      }) : html`<p class="muted">${t('group.no_rivalries')}</p>`}
    </section>

    <section class="card">
      <h3>${t('group.members_title', { count: info.members.length })}</h3>
      <ul class="list">${info.members.map((m) => html`<li><span>👤</span><span class="grow">${m.display_name}</span>${m.role === 'owner' ? html`<span class="tag amber">${t('group.owner')}</span>` : ''}</li>`)}</ul>
    </section>

    <form class="card" id="newgroup">
      <h3>${t('group.new_group')}</h3>
      <div class="row"><input class="grow" name="name" type="text" maxlength="50" placeholder="${t('group.name_placeholder')}" aria-label="${t('group.name')}" required><button class="btn soft">${t('group.create')}</button></div>
    </form>`.__raw;
  $('#share', el).addEventListener('click', () => shareInvite(info.group));
  $('#newgroup', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const ng = await api('/groups', { method: 'POST', body: { name: e.target.name.value } });
      await refreshMe(); setGroup(ng.id); toast(t('group.created')); render(ctx);
    } catch (err) { toast(errorText(err)); }
  });
}
