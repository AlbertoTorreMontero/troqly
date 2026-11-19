// Móvil del jugador: entra con el código/QR, sin instalar ni registrarse.
import { t, num, duration } from '../i18n.js';
import { html, $, on, toast, confetti, icon } from '../ui.js';
import { store, guestToken } from '../store.js';
import { api } from '../api.js';
import { connect, scoreboard, diceView, firstView, podiumView, turnClock } from '../live-common.js';
import { shareCard } from '../card.js';

const EMOJIS = ['🦊', '🐙', '🦉', '🐸', '🐼', '🦁', '🐢', '🦄', '🐝', '🐳', '🦖', '🐧'];

export async function render({ el, params }) {
  const code = params.code.toUpperCase();
  try { await api(`/live/${code}`); } catch {
    el.innerHTML = html`<section class="welcome"><div class="empty"><div class="big">🎲</div><p>${t('live.not_found')}</p><a class="btn" href="/welcome">${t('common.back_home')}</a></div></section>`.__raw;
    return;
  }
  let st = null, me = null, celebrated = false, tick;
  let nickname = localStorage.getItem('troqly_nick') || '';
  let emoji = localStorage.getItem('troqly_emoji') || '';

  const header = () => html`<header class="topbar"><span class="logo"><img src="/icons/icon.svg" alt="" width="30" height="30"></span>
    <div class="title">${st?.game?.name || 'TROQLY'}</div><span class="tag amber head" style="font-size:.95rem">${code}</span></header>`;

  const askNick = () => {
    el.innerHTML = html`${header()}<section class="welcome" style="min-height:auto;padding-top:12px">
      <h1>${t('player.join_title')}</h1><p class="muted">${t('player.join_sub', { game: st?.game?.name || '' })}</p>
      <form id="nick">
        <label class="field"><span>${t('player.nickname')}</span><input name="nick" type="text" maxlength="18" value="${nickname}" autocomplete="nickname" required></label>
        <p class="small muted">${t('player.pick_emoji')}</p>
        <div class="row wrap" id="emo">${EMOJIS.map((e) => html`<button type="button" class="chip ${emoji === e ? 'on' : ''}" data-e="${e}" style="font-size:1.4rem">${e}</button>`)}</div>
        <button class="btn block big mt">${t('player.enter')}</button>
      </form><p class="tiny muted center mt">${t('player.no_account_needed')}</p></section>`.__raw;
    on($('#emo', el), 'click', '[data-e]', (_e, b) => { emoji = b.dataset.e; el.querySelectorAll('[data-e]').forEach((x) => x.classList.toggle('on', x === b)); });
    $('#nick', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      nickname = e.target.nick.value.trim();
      localStorage.setItem('troqly_nick', nickname);
      if (emoji) localStorage.setItem('troqly_emoji', emoji);
      const r = await conn.rejoin();
      handleJoin(r);
    });
  };

  const paint = () => {
    if (!st) return;
    if (st.status === 'ended') {
      clearInterval(tick);
      const mine = st.result?.podium.find((p) => p.id === me);
      el.innerHTML = html`${header()}${podiumView(st)}
        ${mine?.rank === 1 && !st.game.cooperative ? html`<p class="center"><b>${t('player.you_won')}</b></p>` : ''}
        <div class="stack mt"><button class="btn block big" id="share">${icon('share')} ${t('live.share_card')}</button>
        ${store.user ? html`<a class="btn block soft" href="/">${t('common.back_home')}</a>`
          : html`<div class="card"><b>${t('player.save_title')}</b><p class="small muted">${t('player.save_text')}</p><a class="btn block" href="/register?next=/">${t('auth.create_account')}</a></div>`}</div>`.__raw;
      if (!celebrated) { confetti(); celebrated = true; navigator.vibrate?.([60, 40, 60]); }
      return;
    }
    const p = st.players.find((x) => x.id === me);
    if (!p) return askNick();
    const current = st.players[st.turn?.index];
    const myTurn = current?.id === me && st.turn?.runningSince;
    el.innerHTML = html`${header()}
      <section class="card center hero">
        <div style="font-size:2.4rem">${p.emoji}</div><b>${p.name}</b>
        <div class="code-big" style="color:var(--text);letter-spacing:0" aria-live="polite">${num(p.score)}</div>
        <div class="scorepad">${[-1, 1, 5, 10].map((d) => html`<button class="btn ${d < 0 ? 'soft' : ''}" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`)}</div>
        <form id="custom" class="row mt"><input class="grow" name="v" type="number" inputmode="decimal" step="any" placeholder="${t('player.custom')}" aria-label="${t('player.custom')}"><button class="btn soft" name="op" value="add">+</button><button class="btn soft" name="op" value="set">=</button></form>
      </section>
      ${myTurn ? html`<button class="btn block big mint" data-h="turn_next">✅ ${t('player.end_turn')} · <span id="clock">${duration(turnClock(st, p) / 1000)}</span></button>`
        : st.turn?.runningSince && current ? html`<p class="center small muted">${t('player.turn_of', { name: current.name })}</p>` : ''}
      <h3 class="mt">${t('live.scoreboard')}</h3>
      ${scoreboard(st, { me })}
      <div class="grid2 mt"><button class="btn soft" id="roll">🎲 ${t('live.roll')}</button><button class="btn soft" id="first">👆 ${t('live.who_first')}</button></div>
      <div class="mt">${diceView(st)}${firstView(st)}</div>`.__raw;
  };

  const handleJoin = (r) => {
    if (r.error) { toast(t('errors.' + r.error)); return; }
    if (r.state) st = r.state;
    if (r.you) me = r.you;
    if (r.need === 'nickname') return askNick();
    paint();
  };

  const conn = await connect(code, () => ({ guestToken: guestToken(), nickname, emoji: emoji || undefined }), (s) => { st = s; paint(); });
  const sock = conn.socket;
  if (conn.first.state) st = conn.first.state;
  handleJoin(conn.first);

  tick = setInterval(() => {
    const c = $('#clock', el), p = st?.players.find((x) => x.id === me);
    if (c && p) c.textContent = duration(turnClock(st, p) / 1000);
  }, 500);

  on(el, 'click', '[data-d]', (_e, b) => { sock.emit('score', { playerId: me, delta: Number(b.dataset.d) }); navigator.vibrate?.(15); });
  on(el, 'click', '[data-h]', (_e, b) => sock.emit('host', { action: b.dataset.h }));
  on(el, 'click', '#roll', () => sock.emit('dice', { sides: 6, count: 1 }));
  on(el, 'click', '#first', () => sock.emit('first'));
  on(el, 'click', '#share', () => shareCard(st));
  el.addEventListener('submit', (e) => {
    if (e.target.id !== 'custom') return;
    e.preventDefault();
    const v = Number(String(e.target.v.value).replace(',', '.'));
    if (!Number.isFinite(v) || e.target.v.value === '') return;
    const op = e.submitter?.value || 'add';
    sock.emit('score', op === 'set' ? { playerId: me, set: v } : { playerId: me, delta: v });
    e.target.reset();
  });
  return () => { clearInterval(tick); sock.disconnect(); };
}
