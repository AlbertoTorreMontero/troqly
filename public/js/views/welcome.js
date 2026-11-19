import { t } from '../i18n.js';
import { html, $ } from '../ui.js';
import { store } from '../store.js';

export async function render({ el, query, go }) {
  if (store.user) return go(query.get('next') || '/', { replace: true });
  const next = query.get('next');
  const nx = next ? `?next=${encodeURIComponent(next)}` : '';
  el.innerHTML = html`<section class="welcome">
    <img class="mark" src="/icons/icon.svg" alt="TROQLY">
    <h1>TROQLY</h1>
    <p class="slogan">${t('brand.slogan')}</p>
    <div class="stack">
      <a class="btn block big" href="/register${nx}">${t('auth.create_account')}</a>
      <a class="btn block ghost" href="/login${nx}">${t('auth.have_account')}</a>
    </div>
    <hr>
    <form id="join" class="card">
      <h3>${t('welcome.join_title')}</h3>
      <p class="small muted">${t('welcome.join_text')}</p>
      <div class="row">
        <input class="grow" name="code" type="text" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="${t('welcome.code_placeholder')}" aria-label="${t('welcome.code_placeholder')}" style="text-transform:uppercase;letter-spacing:.2em;font-weight:700">
        <button class="btn">${t('welcome.join_btn')}</button>
      </div>
    </form>
    <p class="tiny muted center mt">${t('welcome.footer')}</p>
  </section>`.__raw;
  $('#join', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim().toUpperCase();
    if (code.length >= 4) go(`/m/${code}`);
  });
}
