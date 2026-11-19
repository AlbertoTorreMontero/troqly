import { t, minutesLabel } from '../i18n.js';
import { html, $, toast, errorText, cover, icon } from '../ui.js';
import { api } from '../api.js';
import { store, refreshMe, setGroup, group } from '../store.js';

export function inviteUrl(code) {
  return `${location.origin}/join/${code}`;
}

export async function shareInvite(g) {
  const url = inviteUrl(g.invite_code);
  const text = t('group.invite_text', { name: g.name });
  if (navigator.share) {
    try { await navigator.share({ title: 'TROQLY', text, url }); return; } catch { /* cancelado */ }
  }
  try { await navigator.clipboard.writeText(url); toast(t('group.link_copied')); } catch { prompt(t('group.copy_link'), url); }
}

/** Si el usuario no tiene grupo, pinta la pantalla para crearlo y devuelve false. */
export function requireGroup(el, go) {
  if (store.groupId) return true;
  el.innerHTML = html`<header class="topbar"><a href="/" class="logo"><img src="/icons/icon.svg" alt="" width="30" height="30">TROQLY</a><div class="title"></div>
      <a class="btn icon soft" href="/settings" aria-label="${t('nav.settings')}">${icon('gear')}</a></header>
    <section class="card hero">
      <h1>${t('onboarding.title', { name: store.user.display_name })}</h1>
      <p class="muted">${t('onboarding.text')}</p>
      <form id="newgroup">
        <label class="field"><span>${t('group.name')}</span><input name="name" type="text" maxlength="50" placeholder="${t('group.name_placeholder')}" required></label>
        <button class="btn block">${t('group.create')}</button>
      </form>
      <p class="small muted mt">${t('onboarding.or_invite')}</p>
    </section>`.__raw;
  $('#newgroup', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const g = await api('/groups', { method: 'POST', body: { name: e.target.name.value } });
      await refreshMe();
      setGroup(g.id);
      toast(t('group.created'));
      go('/', { replace: true });
    } catch (err) { toast(errorText(err)); }
  });
  return false;
}

export function groupSwitcher() {
  if (store.groups.length < 2) return html`<div class="title">${group()?.name || ''}</div>`;
  return html`<select class="title" id="gsw" aria-label="${t('group.switch')}" style="min-height:40px;max-width:60%;font-weight:700;background:transparent;border:0;padding:0 4px">
    ${store.groups.map((g) => html`<option value="${g.id}" ${g.id === store.groupId ? 'selected' : ''}>${g.name}</option>`)}</select><div class="grow"></div>`;
}
export function bindGroupSwitcher(el, rerender) {
  $('#gsw', el)?.addEventListener('change', (e) => { setGroup(Number(e.target.value)); rerender(); });
}

export function gameRow(g, extra = '') {
  const players = g.min_players === g.max_players ? g.min_players : `${g.min_players}–${g.max_players}`;
  const mins = g.min_minutes === g.max_minutes ? minutesLabel(g.min_minutes) : `${minutesLabel(g.min_minutes)}–${minutesLabel(g.max_minutes)}`;
  return html`${cover(g.name)}<div class="grow"><div style="font-weight:700" class="ellipsis">${g.name}</div>
    <div class="tiny muted">👥 ${players} · ⏱ ${mins}${g.cooperative ? html` · 🤝 ${t('game.coop')}` : ''}</div>${extra}</div>`;
}

export const ACH_ICONS = { ap: '🐢', kingmaker: '👑', sandbagger: '🦈', record: '🏆', first_unbox: '📦', streak_3: '🔥', streak_5: '🔥', streak_10: '☄️' };
