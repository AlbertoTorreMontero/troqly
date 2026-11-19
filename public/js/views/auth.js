import { t, lang, defaultCurrency, setLocale } from '../i18n.js';
import { html, $, errorText } from '../ui.js';
import { api } from '../api.js';
import { store, refreshMe } from '../store.js';

export async function render({ el, query, go }) {
  const isReg = location.pathname === '/register';
  const next = query.get('next') || '/';
  if (store.user) return go(next, { replace: true });
  el.innerHTML = html`<section class="welcome">
    <a href="/welcome" class="logo"><img src="/icons/icon.svg" alt="" width="30" height="30">TROQLY</a>
    <h1 class="mt">${isReg ? t('auth.register_title') : t('auth.login_title')}</h1>
    <p class="muted">${isReg ? t('auth.register_sub') : t('auth.login_sub')}</p>
    <form id="f" class="mt" novalidate>
      ${isReg ? html`<label class="field"><span>${t('auth.name')}</span><input name="name" type="text" autocomplete="nickname" maxlength="40" required></label>` : ''}
      <label class="field"><span>${t('auth.email')}</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>${t('auth.password')}</span><input name="password" type="password" autocomplete="${isReg ? 'new-password' : 'current-password'}" minlength="8" required></label>
      ${isReg ? html`<p class="tiny muted">${t('auth.password_hint')}</p>` : ''}
      <p class="small" id="err" role="alert" style="color:var(--coral)"></p>
      <button class="btn block big">${isReg ? t('auth.create_account') : t('auth.login')}</button>
    </form>
    <p class="center mt small">${isReg ? t('auth.have_account') : t('auth.no_account')}
      <a class="link" href="${isReg ? '/login' : '/register'}?next=${encodeURIComponent(next)}">${isReg ? t('auth.login') : t('auth.create_account')}</a></p>
  </section>`.__raw;

  $('#f', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    $('#err', el).textContent = '';
    try {
      const body = { email: f.email.value, password: f.password.value };
      if (isReg) Object.assign(body, { name: f.name.value, locale: lang(), currency: defaultCurrency() });
      await api(isReg ? '/auth/register' : '/auth/login', { method: 'POST', body });
      const guest = localStorage.getItem('troqly_guest');
      if (guest) await api('/me/claim', { method: 'POST', body: { tokens: [guest] } }).catch(() => {});
      await refreshMe();
      if (store.user?.locale && store.user.locale !== lang()) await setLocale(store.user.locale);
      go(next, { replace: true });
    } catch (err) {
      $('#err', el).textContent = errorText(err);
      btn.disabled = false;
    }
  });
}
