import { t, locales, lang, setLocale } from '../i18n.js';
import { html, $, toast, errorText } from '../ui.js';
import { api } from '../api.js';
import { store, refreshMe } from '../store.js';
import { topbar, applyTheme, go } from '../app.js';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP', 'CLP', 'PEN', 'BRL', 'CHF', 'CAD', 'AUD', 'JPY'];

export async function render(ctx) {
  const { el } = ctx;
  const u = store.user;
  const theme = document.documentElement.dataset.theme;
  el.innerHTML = html`${topbar({ title: t('settings.title'), back: '/' })}
    <section class="card">
      <label class="field"><span>${t('settings.language')}</span><select id="lang">${locales().map((l) => html`<option value="${l.code}" ${l.code === lang() ? 'selected' : ''}>${l.name}</option>`)}</select></label>
      <p class="tiny muted">${t('settings.language_help')}</p>
      <label class="field"><span>${t('settings.theme')}</span><select id="theme"><option value="dark" ${theme === 'dark' ? 'selected' : ''}>🌙 ${t('settings.dark')}</option><option value="light" ${theme === 'light' ? 'selected' : ''}>☀️ ${t('settings.light')}</option></select></label>
      <label class="field"><span>${t('settings.currency')}</span><select id="cur">${CURRENCIES.map((c) => html`<option ${c === u.currency ? 'selected' : ''}>${c}</option>`)}</select></label>
      <form id="name" class="field"><span class="small muted" style="font-weight:600">${t('auth.name')}</span><div class="row mt"><input class="grow" name="n" type="text" maxlength="40" value="${u.display_name}" aria-label="${t('auth.name')}"><button class="btn soft">${t('common.save')}</button></div></form>
    </section>
    <section class="card">
      <p class="small muted">${t('settings.install_help')}</p>
      <p class="small muted mb0">${u.email}</p>
    </section>
    <button class="btn block ghost" id="logout">${t('settings.logout')}</button>
    <p class="tiny muted center mt">TROQLY · ${t('brand.slogan')}</p>`.__raw;

  const patch = async (body) => {
    try { await api('/me', { method: 'PATCH', body }); await refreshMe(); toast(t('common.saved')); } catch (e) { toast(errorText(e)); }
  };
  $('#lang', el).addEventListener('change', async (e) => { await setLocale(e.target.value); await patch({ locale: e.target.value }); render(ctx); });
  $('#theme', el).addEventListener('change', (e) => { applyTheme(e.target.value); patch({ theme: e.target.value }); });
  $('#cur', el).addEventListener('change', (e) => patch({ currency: e.target.value }));
  $('#name', el).addEventListener('submit', (e) => { e.preventDefault(); patch({ display_name: e.target.n.value }); });
  $('#logout', el).addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    store.user = null; store.groups = []; store.groupId = null;
    go('/welcome', { replace: true });
  });
}
