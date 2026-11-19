import { t, relative, langLabel } from '../i18n.js';
import { html, $, toast, errorText, cover } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { topbar } from '../app.js';
import { requireGroup } from './_shared.js';

export async function render(ctx) {
  const { el, go, query } = ctx;
  if (!requireGroup(el, go)) return;
  const [books, col] = await Promise.all([api(`/rulebooks?group=${store.groupId}`), api(`/collection?group=${store.groupId}`)]);
  const games = [...new Map(col.map((g) => [g.game_id, { id: g.game_id, name: g.name }])).values()];
  const pre = Number(query.get('game')) || null;
  if (pre && !games.some((g) => g.id === pre)) {
    try { const d = await api(`/games/${pre}`); games.unshift({ id: d.game.id, name: d.game.name }); } catch { /* */ }
  }

  el.innerHTML = html`${topbar({ title: t('rules.title') })}
    <section class="card hero"><h2>${t('rules.hero')}</h2><p class="small muted">${t('rules.hero_sub')}</p></section>
    ${books.length ? html`<section class="card"><h3>${t('rules.manuals')}</h3><div class="list">${books.map((b) => html`<a href="/rules/${b.id}">${cover(b.game)}
      <div class="grow"><b>${b.game}</b><div class="tiny muted">${b.title} · ${b.status === 'ready' ? t('rules.pages', { count: b.pages }) : t('rules.status_' + (b.status.startsWith('error') ? 'error' : b.status))}${b.language ? ' · ' + langLabel(b.language) : ''}</div></div>
      <span class="tag coral">${t('rules.ask')}</span></a>`)}</div></section>` : ''}

    <form class="card" id="up">
      <h3>${t('rules.upload_title')}</h3>
      <label class="field"><span>${t('rules.which_game')}</span><select name="game" required><option value="">—</option>${games.map((g) => html`<option value="${g.id}" ${g.id === pre ? 'selected' : ''}>${g.name}</option>`)}</select></label>
      ${games.length ? '' : html`<p class="small muted">${t('rules.add_game_first')} <a class="link" href="/collection">${t('collection.add')}</a></p>`}
      <label class="field"><span>${t('rules.files')}</span><input name="files" type="file" accept="application/pdf,image/*" multiple required></label>
      <p class="tiny muted">${t('rules.files_help')}</p>
      <button class="btn block">${t('rules.upload_btn')}</button>
    </form>`.__raw;

  $('#up', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    if (!f.game.value || !f.files.files.length) return;
    const fd = new FormData();
    fd.append('group_id', store.groupId);
    fd.append('game_id', f.game.value);
    [...f.files.files].forEach((x) => fd.append('files', x));
    btn.disabled = true;
    btn.textContent = t('rules.uploading');
    try {
      const r = await api('/rulebooks', { method: 'POST', form: fd });
      go(`/rules/${r.id}`);
    } catch (err) {
      toast(errorText(err));
      btn.disabled = false;
      btn.textContent = t('rules.upload_btn');
    }
  });
}
