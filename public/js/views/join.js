import { t } from '../i18n.js';
import { html, $, errorText, toast } from '../ui.js';
import { api } from '../api.js';
import { store, refreshMe, setGroup } from '../store.js';

export async function render({ el, params, go }) {
  let g;
  try {
    g = await api(`/invite/${encodeURIComponent(params.code)}`);
  } catch {
    el.innerHTML = html`<section class="welcome"><div class="empty"><div class="big">🧩</div><p>${t('join.not_found')}</p><a class="btn" href="/">${t('common.back_home')}</a></div></section>`.__raw;
    return;
  }
  const next = encodeURIComponent(location.pathname);
  el.innerHTML = html`<section class="welcome">
    <img class="mark" src="/icons/icon.svg" alt="">
    <p class="muted">${t('join.invited')}</p>
    <h1>${g.name}</h1>
    <p class="muted">${t('join.members', { count: g.members })}</p>
    ${store.user
      ? html`<button class="btn block big" id="go">${t('join.join_btn')}</button>`
      : html`<div class="stack"><a class="btn block big" href="/register?next=${next}">${t('auth.create_account')}</a><a class="btn block ghost" href="/login?next=${next}">${t('auth.have_account')}</a></div>`}
  </section>`.__raw;
  $('#go', el)?.addEventListener('click', async () => {
    try {
      const r = await api(`/invite/${encodeURIComponent(params.code)}/join`, { method: 'POST' });
      await refreshMe();
      setGroup(r.id);
      toast(t('join.joined', { name: g.name }));
      go('/', { replace: true });
    } catch (e) { toast(errorText(e)); }
  });
}
