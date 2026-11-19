import { t, lang, relative, langLabel } from '../i18n.js';
import { html, $, on, modal, toast, errorText, esc, raw, spinner } from '../ui.js';
import { api } from '../api.js';
import { topbar } from '../app.js';

function highlight(text, quote) {
  const safe = esc(text);
  if (!quote) return safe;
  const words = quote.trim().split(/\s+/).slice(0, 6).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  try {
    const re = new RegExp(esc(words.join(' ')).replace(/ /g, '\\s+'), 'i');
    return safe.replace(re, (m) => `<mark>${m}</mark>`);
  } catch { return safe; }
}

export async function render(ctx) {
  const { el, params } = ctx;
  const id = Number(params.id);
  let data = await api(`/rulebooks/${id}`);
  let poll;
  const history = [];

  const answerBubble = (a) => a.found
    ? html`<div class="bubble ai"><div>${a.answer}</div>
        <div>${a.citations.map((c) => html`<button class="cite" data-page="${c.page}" data-quote="${c.quote}">📄 ${t('rules.page', { n: c.page })}</button>`)}</div>
        ${a.citations[0] ? html`<div class="quote">“${a.citations[0].quote}”</div>` : ''}
        ${a.id ? html`<button class="link tiny" data-flag="${a.id}" data-on="${a.flagged ? 1 : 0}">${a.flagged ? '⚠️ ' + t('rules.flagged') : t('rules.flag')}</button>` : ''}</div>`
    : html`<div class="bubble ai none">🔍 ${t('rules.not_found')}<div class="tiny muted mt">${t('rules.not_found_help')}</div></div>`;

  const paint = () => {
    const rb = data.rulebook;
    el.innerHTML = html`${topbar({ title: data.game.name, back: '/rules' })}
      <p class="small muted">${rb.title}${rb.status === 'ready' ? ` · ${t('rules.pages', { count: rb.pages })}` : ''}${rb.language ? ` · ${langLabel(rb.language)}` : ''}</p>
      ${rb.status === 'processing' ? html`<section class="card center">${spinner()}<p>${t('rules.processing')}</p></section>` : ''}
      ${rb.status.startsWith('error') ? html`<section class="card"><p>${t('rules.status_' + rb.status.replace('-', '_'))}</p><button class="btn soft" id="del">${t('common.delete')}</button></section>` : ''}
      ${rb.status === 'ready' ? html`
        <section class="card flat small muted">🛡️ ${t('rules.promise')}${rb.language && rb.language !== lang() ? ' ' + t('rules.cross_lang', { lang: langLabel(rb.language) }) : ''}</section>
        <div id="chat"></div>
        <form id="ask" class="composer"><input class="grow" name="q" type="text" maxlength="500" placeholder="${t('rules.placeholder')}" aria-label="${t('rules.placeholder')}" autocomplete="off" required><button class="btn">${t('rules.ask')}</button></form>
        ${data.questions.length ? html`<h3 class="mt">${t('rules.group_questions')}</h3>${data.questions.map((q) => html`<div class="card">
          <div class="small" style="font-weight:700">${q.question}</div><div class="tiny muted">${q.by || ''} · ${relative(q.created_at)}</div>
          <div class="mt">${answerBubble({ ...q, citations: q.citations || [] })}</div></div>`)}` : ''}` : ''}`.__raw;
  };
  paint();

  if (data.rulebook.status === 'processing') {
    poll = setInterval(async () => {
      data = await api(`/rulebooks/${id}`);
      if (data.rulebook.status !== 'processing') { clearInterval(poll); paint(); }
    }, 3000);
  }

  el.addEventListener('submit', async (e) => {
    if (e.target.id !== 'ask') return;
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    const chat = $('#chat', el);
    chat.insertAdjacentHTML('beforeend', html`<div class="bubble me">${q}</div><div class="bubble ai" id="thinking">${t('rules.thinking')}</div>`.__raw);
    e.target.reset();
    try {
      const a = await api(`/rulebooks/${id}/ask`, { method: 'POST', body: { question: q, locale: lang(), history } });
      history.push({ q });
      $('#thinking', el).outerHTML = answerBubble(a).__raw;
    } catch (err) {
      $('#thinking', el).outerHTML = html`<div class="bubble ai none">${errorText(err)}</div>`.__raw;
    }
    chat.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  on(el, 'click', '[data-page]', async (_e, b) => {
    const m = modal(html`<h2>${t('rules.page', { n: b.dataset.page })}</h2><div id="pg">${spinner()}</div><button class="btn block soft mt" data-close>${t('common.close')}</button>`);
    try {
      const p = await api(`/rulebooks/${id}/pages/${b.dataset.page}`);
      $('#pg', m.el).innerHTML = html`<p class="tiny muted">${t('rules.original_text')}</p><div class="page-text">${raw(highlight(p.text, b.dataset.quote))}</div>`.__raw;
      m.el.querySelector('mark')?.scrollIntoView({ block: 'center' });
    } catch (err) { $('#pg', m.el).textContent = errorText(err); }
  });
  on(el, 'click', '[data-flag]', async (_e, b) => {
    const flagged = b.dataset.on !== '1';
    try {
      await api(`/rule-questions/${b.dataset.flag}/flag`, { method: 'POST', body: { flagged } });
      b.dataset.on = flagged ? '1' : '0';
      b.textContent = flagged ? '⚠️ ' + t('rules.flagged') : t('rules.flag');
      toast(flagged ? t('rules.flag_thanks') : t('common.saved'));
    } catch (err) { toast(errorText(err)); }
  });
  on(el, 'click', '#del', async () => {
    await api(`/rulebooks/${id}`, { method: 'DELETE' });
    ctx.go('/rules', { replace: true });
  });
  return () => clearInterval(poll);
}
