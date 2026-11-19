import { t, duration } from '../i18n.js';
import { html, $, on, modal, toast, confetti, icon } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { connect, scoreboard, diceView, firstView, podiumView, turnClock } from '../live-common.js';
import { shareCard } from '../card.js';

export async function render({ el, params, go }) {
  const code = params.code.toUpperCase();
  let info;
  try { info = await api(`/live/${code}`); } catch {
    el.innerHTML = html`<div class="empty"><div class="big">🎲</div><p>${t('live.not_found')}</p><a class="btn" href="/live">${t('live.new_title')}</a></div>`.__raw;
    return;
  }
  let st = info.state;
  let isHost = store.user && store.user.id === st.hostUserId;
  let celebrated = st.status === 'ended';
  let showQr = st.status === 'lobby';
  let tick;

  el.innerHTML = html`<header class="topbar"><button class="btn icon soft" data-back="/" aria-label="${t('common.back')}">${icon('back')}</button>
      <div class="title">${st.game.name}</div><span class="tag amber head" style="font-size:.95rem">${code}</span></header><div id="body"></div>`.__raw;
  const body = $('#body', el);

  const paint = () => {
    if (st.status === 'ended') {
      clearInterval(tick);
      body.innerHTML = html`${podiumView(st)}
        <div class="stack mt"><button class="btn block big" id="share">${icon('share')} ${t('live.share_card')}</button>
        <a class="btn block soft" href="/live?game=${st.game.id}">${t('live.rematch')}</a>
        <a class="btn block ghost" href="/stats">${t('stats.title')}</a></div>`.__raw;
      if (!celebrated) { confetti(); celebrated = true; }
      return;
    }
    const current = st.players[st.turn?.index];
    body.innerHTML = html`
      <section class="card center ${showQr ? '' : 'hidden'}" id="qrbox">
        <p class="small muted">${t('live.scan')}</p>
        <img class="qr" src="${info.qr}" alt="${t('live.qr_alt', { code })}" width="260" height="260">
        <div class="code-big mt">${code}</div>
        <p class="tiny muted">${info.url.replace(/^https?:\/\//, '')}</p>
      </section>
      <div class="row between"><h3 class="mb0">${t('live.players_title', { count: st.players.length })}</h3>
        <button class="link small" id="toggleqr">${showQr ? t('live.hide_qr') : t('live.show_qr')}</button></div>
      <div class="mt">${scoreboard(st, { editable: isHost, big: true })}</div>
      ${isHost ? html`<form id="addp" class="row mt"><input class="grow" name="name" type="text" maxlength="18" placeholder="${t('live.add_offline')}" aria-label="${t('live.add_offline')}"><button class="btn soft">+</button></form>` : ''}
      ${st.game.cooperative ? '' : html`<p class="tiny muted mt">${st.lowWins ? t('live.low_wins_on') : ''}</p>`}

      <section class="card mt center">
        <h3>⏱ ${t('live.turn_timer')}</h3>
        ${current ? html`<p class="mb0">${current.emoji} <b>${current.name}</b></p>` : ''}
        <div class="timer" id="clock">${current ? duration(turnClock(st, current) / 1000) : '0:00'}</div>
        <div class="row" style="justify-content:center">
          ${st.turn?.runningSince
            ? html`<button class="btn" data-h="turn_next">${t('live.next_turn')}</button>${isHost ? html`<button class="btn soft" data-h="turn_pause">${t('live.pause')}</button>` : ''}`
            : html`<button class="btn" data-h="turn_start">${t('live.start_timer')}</button>`}
        </div>
      </section>

      <section class="grid2">
        <div class="card center"><h3>🎲 ${t('live.dice')}</h3>
          <div class="row" style="justify-content:center"><select id="sides" style="width:auto">${[6, 4, 8, 10, 12, 20].map((s) => html`<option value="${s}">d${s}</option>`)}</select>
          <select id="count" style="width:auto">${[1, 2, 3].map((s) => html`<option>${s}</option>`)}</select></div>
          <button class="btn soft block mt" id="roll">${t('live.roll')}</button><div id="dice" class="mt">${diceView(st)}</div></div>
        <div class="card center"><h3>👆 ${t('live.who_first')}</h3><button class="btn soft block" id="first">${t('live.pick')}</button><div class="mt">${firstView(st)}</div></div>
      </section>

      ${isHost ? html`<button class="btn block big mint mt" id="end">🏁 ${t('live.end')}</button>` : html`<p class="center small muted mt">${t('live.host_ends')}</p>`}`.__raw;
  };

  const conn = await connect(code, () => ({ screen: !isHost ? true : undefined }), (s) => {
    const prevDice = st.dice?.at;
    st = s;
    if (st.status !== 'lobby' && showQr && st.players.length > 1 && !paint.userOpened) showQr = false;
    paint();
    if (st.dice && st.dice.at !== prevDice) navigator.vibrate?.(40);
  });
  isHost = !!conn.first.isHost;
  if (conn.first.state) st = conn.first.state;
  const sock = conn.socket;
  paint();

  tick = setInterval(() => {
    const c = $('#clock', el), cur = st.players[st.turn?.index];
    if (c && cur && st.turn?.runningSince) c.textContent = duration(turnClock(st, cur) / 1000);
  }, 500);

  on(el, 'click', '[data-delta]', (_e, b) => sock.emit('score', { playerId: b.dataset.p, delta: Number(b.dataset.delta) }));
  on(el, 'click', '.score-row .pts', (_e, s) => {
    if (!isHost) return;
    const pid = s.closest('[data-pid]').dataset.pid;
    const v = prompt(t('live.set_score'));
    if (v != null && v.trim() !== '' && !isNaN(Number(v.replace(',', '.')))) sock.emit('score', { playerId: pid, set: Number(v.replace(',', '.')) });
  });
  on(el, 'click', '[data-h]', (_e, b) => sock.emit('host', { action: b.dataset.h }));
  on(el, 'click', '#roll', () => sock.emit('dice', { sides: Number($('#sides', el).value), count: Number($('#count', el).value) }));
  on(el, 'click', '#first', () => sock.emit('first'));
  on(el, 'click', '#toggleqr', () => { showQr = !showQr; paint.userOpened = showQr; paint(); });
  on(el, 'click', '#share', () => shareCard(st));
  el.addEventListener('submit', (e) => {
    if (e.target.id !== 'addp') return;
    e.preventDefault();
    const v = e.target.name.value.trim();
    if (v) sock.emit('host', { action: 'add_player', name: v });
    e.target.reset();
  });
  on(el, 'click', '#end', () => {
    const coop = st.game.cooperative;
    const m = modal(html`<h2>${t('live.end_title')}</h2>
      ${coop ? html`<p>${t('live.coop_question')}</p><div class="grid2"><button class="btn mint" data-coop="1">${t('live.coop_yes')}</button><button class="btn soft" data-coop="0">${t('live.coop_no')}</button></div>`
        : html`<label class="field"><span>👑 ${t('live.kingmaker_q')}</span><select id="km"><option value="">${t('live.nobody')}</option>${st.players.map((p) => html`<option value="${p.id}">${p.emoji} ${p.name}</option>`)}</select></label>
          <p class="tiny muted">${t('live.kingmaker_help')}</p>`}
      <button class="btn block big mt" id="confirm" ${coop ? 'disabled' : ''}>${t('live.end_confirm')}</button>
      <button class="btn block ghost mt" data-close>${t('common.cancel')}</button>`);
    let coopWon = null;
    on(m.el, 'click', '[data-coop]', (_e, b) => {
      coopWon = b.dataset.coop === '1';
      m.el.querySelectorAll('[data-coop]').forEach((x) => x.classList.toggle('ghost', x !== b));
      $('#confirm', m.el).disabled = false;
    });
    $('#confirm', m.el).addEventListener('click', () => {
      if (coop) sock.emit('host', { action: 'coop', value: coopWon });
      sock.emit('end', { kingmakerId: coop ? null : $('#km', m.el).value || null }, (r) => {
        if (r?.error) toast(t('errors.server'));
        m.close();
      });
    });
  });

  return () => { clearInterval(tick); sock.disconnect(); };
}
