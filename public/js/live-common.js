// Piezas compartidas por la pantalla del anfitrión y la del móvil del jugador.
import { t, num, duration } from './i18n.js';
import { html } from './ui.js';

let ioLoaded;
export function loadIo() {
  if (window.io) return Promise.resolve(window.io);
  ioLoaded ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/socket.io/socket.io.js';
    s.onload = () => res(window.io);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return ioLoaded;
}

export async function connect(code, joinMsg, onState) {
  const io = await loadIo();
  const socket = io('/live', { transports: ['websocket', 'polling'], reconnection: true });
  let joined = null;
  const join = () => new Promise((resolve) => socket.emit('join', { code, ...joinMsg() }, (r) => { joined = r; resolve(r); }));
  socket.on('state', onState);
  socket.on('connect', () => { if (joined) join(); }); // al reconectar, volvemos a entrar
  await new Promise((r) => (socket.connected ? r() : socket.once('connect', r)));
  const first = await join();
  return { socket, first, rejoin: join };
}

export function ranksOf(st) {
  const sorted = [...st.players].sort((a, b) => (st.lowWins ? a.score - b.score : b.score - a.score));
  const r = {};
  let rank = 0, prev = null;
  sorted.forEach((p, i) => { if (prev === null || p.score !== prev) rank = i + 1; r[p.id] = rank; prev = p.score; });
  return { sorted, r };
}

export function turnClock(st, p) {
  const running = st.turn?.runningSince && st.players[st.turn.index]?.id === p.id ? Date.now() - st.turn.runningSince : 0;
  return (p.turnMs || 0) + running;
}

export function scoreboard(st, { me, editable = false, big = false } = {}) {
  const { sorted, r } = ranksOf(st);
  const current = st.players[st.turn?.index]?.id;
  const hasScores = st.players.some((p) => p.score !== 0);
  return html`<ul class="score-list ${big ? 'big-screen' : ''}">${sorted.map((p) => html`<li class="score-row ${hasScores && r[p.id] === 1 && !st.game.cooperative ? 'lead' : ''} ${st.turn?.runningSince && p.id === current ? 'turn' : ''} ${!p.connected && !p.offline && !p.host ? 'off' : ''}" data-pid="${p.id}">
      <span class="emoji">${p.emoji}</span>
      <div class="grow"><div class="name ellipsis" style="font-weight:700">${p.name}${me === p.id ? html` <span class="tag">${t('common.you')}</span>` : ''}</div>
        <div class="tiny muted">${st.turn?.runningSince && p.id === current ? t('live.their_turn') : ''} ${p.turns ? `⏱ ${duration(turnClock(st, p) / 1000)}` : ''}</div></div>
      ${editable ? html`<button class="btn icon soft" data-delta="-1" data-p="${p.id}" aria-label="${t('live.minus_one', { name: p.name })}">−</button>` : ''}
      <span class="pts" aria-label="${t('live.points_of', { name: p.name })}">${num(p.score)}</span>
      ${editable ? html`<button class="btn icon" data-delta="1" data-p="${p.id}" aria-label="${t('live.plus_one', { name: p.name })}">+</button>` : ''}
    </li>`)}</ul>`;
}

export function diceView(st) {
  if (!st.dice) return '';
  const total = st.dice.values.reduce((a, b) => a + b, 0);
  return html`<div class="dice" data-at="${st.dice.at}">${st.dice.values.map((v) => html`<div class="die">${v}</div>`)}</div>
    <p class="center small muted">${t('live.rolled', { name: st.dice.by, total, sides: st.dice.sides })}</p>`;
}

export function firstView(st) {
  if (!st.firstPick) return '';
  const p = st.players.find((x) => x.id === st.firstPick.playerId);
  return p ? html`<p class="center"><b>${p.emoji} ${t('live.first_is', { name: p.name })}</b></p>` : '';
}

export function podiumView(st) {
  const res = st.result;
  if (!res) return '';
  const pod = res.podium;
  const coop = st.game.cooperative;
  const top3 = [pod.find((p) => p.rank === 2), pod.find((p) => p.rank === 1), pod.find((p) => p.rank === 3)];
  const awards = res.awards || [];
  const nameOf = (id) => pod.find((p) => p.id === id)?.name || '';
  const winner = pod.find((p) => p.rank === 1);
  return html`<section class="center">
    <p class="tiny muted mb0">${st.game.name}</p>
    ${coop
      ? html`<h1>${st.coopWon ? t('live.coop_won_big') : t('live.coop_lost_big')}</h1>`
      : html`<h1>${t('live.wins_title', { name: winner?.name || '' })}</h1>
        ${winner?.streak >= 2 ? html`<p class="muted">🔥 ${t('home.hot_streak', { name: winner.name, count: winner.streak })}</p>` : ''}
        <div class="podium">${top3.map((p, i) => p ? html`<div class="step p${[2, 1, 3][i]}"><div class="who">${p.emoji}</div><div class="nm ellipsis">${p.name}</div><div class="tiny muted">${num(Number(p.score))}</div><div class="block">${p.rank}</div></div>` : html`<div class="step"></div>`)}</div>`}
    ${awards.length ? html`<div class="stack mt" style="text-align:left">${awards.map((a) => html`<div class="ach"><span class="ico">${({ ap: '🐢', kingmaker: '👑', sandbagger: '🦈', record: '🏆', first_unbox: '📦' })[a.key] || '🔥'}</span>
        <div><b>${t('ach.' + a.key + '.name')}</b><div class="small muted">${t('ach.' + a.key + '.line', { name: nameOf(a.playerId) })}</div></div></div>`)}</div>` : ''}
    <ul class="list mt" style="text-align:left">${pod.map((p) => html`<li><b class="head" style="width:22px">${p.rank}</b><span>${p.emoji}</span><span class="grow">${p.name}</span><b>${num(Number(p.score))}</b></li>`)}</ul>
    <p class="tiny muted">⏱ ${duration(res.duration)}</p>
  </section>`;
}
