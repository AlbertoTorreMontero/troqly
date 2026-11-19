// Mesa en vivo: el servidor es la única fuente de verdad del marcador.
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { q, one, many } = require('./db');
const A = require('./auth');
const S = require('./stats');

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const tables = new Map(); // code -> state
const saveTimers = new Map();
const EMOJIS = ['🦊', '🐙', '🦉', '🐸', '🐼', '🦁', '🐢', '🦄', '🐝', '🐳', '🦖', '🐧'];

function genCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
  return s;
}

function publicState(st) {
  return {
    code: st.code, status: st.status, game: st.game, hostUserId: st.hostUserId, groupId: st.groupId,
    players: st.players.map(({ guestToken, ...p }) => p),
    turn: st.turn, lowWins: st.lowWins, coopWon: st.coopWon, dice: st.dice, firstPick: st.firstPick,
    startedAt: st.startedAt, endedAt: st.endedAt, result: st.result || null, events: st.events,
  };
}

function scheduleSave(st) {
  clearTimeout(saveTimers.get(st.code));
  saveTimers.set(st.code, setTimeout(() => {
    q('UPDATE live_tables SET state=$2, status=$3 WHERE code=$1', [st.code, st, st.status]).catch((e) => console.error('[live save]', e.message));
  }, 800));
}

async function load(code) {
  code = String(code || '').toUpperCase();
  if (tables.has(code)) return tables.get(code);
  const row = await one('SELECT state FROM live_tables WHERE code=$1 AND expires_at > now()', [code]);
  if (!row) return null;
  tables.set(code, row.state);
  return row.state;
}

function ranks(st) {
  const sorted = [...st.players].sort((a, b) => (st.lowWins ? a.score - b.score : b.score - a.score));
  const out = {};
  let rank = 0, prev = null;
  sorted.forEach((p, i) => {
    if (prev === null || p.score !== prev) rank = i + 1;
    out[p.id] = rank;
    prev = p.score;
  });
  return out;
}

function trackSandbag(st) {
  if (st.players.length < 2 || st.game.cooperative) return;
  st.events = (st.events || 0) + 1;
  if (st.events < st.players.length) return;
  const r = ranks(st);
  const worst = Math.max(...Object.values(r));
  const lasts = st.players.filter((p) => r[p.id] === worst);
  if (lasts.length === 1) lasts[0].wasLast = true;
}

function closeTurn(st) {
  if (!st.turn?.runningSince) return;
  const p = st.players[st.turn.index];
  if (p) {
    p.turnMs = (p.turnMs || 0) + (Date.now() - st.turn.runningSince);
    p.turns = (p.turns || 0) + 1;
  }
  st.turn.runningSince = null;
}

async function finalize(st, { kingmakerId } = {}) {
  closeTurn(st);
  st.status = 'ended';
  st.endedAt = Date.now();
  const r = ranks(st);
  const coop = st.game.cooperative;
  const players = st.players.map((p) => ({
    ...p,
    rank: coop ? 1 : r[p.id],
    winner: coop ? !!st.coopWon : r[p.id] === 1,
  }));
  const duration = Math.round((st.endedAt - (st.startedAt || st.createdAt)) / 1000);

  const play = await one(
    `INSERT INTO plays(group_id,game_id,started_at,ended_at,duration_s,cooperative,coop_won,created_by)
     VALUES ($1,$2,to_timestamp($3/1000.0),now(),$4,$5,$6,$7) RETURNING id`,
    [st.groupId, st.game.id, st.startedAt || st.createdAt, duration, coop, coop ? !!st.coopWon : null, st.hostUserId]
  );
  for (const p of players) {
    await q(
      `INSERT INTO play_players(play_id,user_id,guest_name,guest_token,emoji,score,rank,is_winner,is_first_player,turn_time_s,turns,started_behind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [play.id, p.userId || null, p.userId ? null : p.name, p.guestToken || null, p.emoji, p.score, p.rank, p.winner,
        st.firstPick?.playerId === p.id, Math.round((p.turnMs || 0) / 1000), p.turns || 0, !!p.wasLast]
    );
  }

  // Logros
  const awards = [];
  const give = async (p, key) => {
    awards.push({ playerId: p.id, key });
    if (p.userId) await q('INSERT INTO achievements(user_id,group_id,key,play_id) VALUES ($1,$2,$3,$4)', [p.userId, st.groupId, key, play.id]);
  };
  const timed = players.filter((p) => (p.turns || 0) >= 2);
  if (timed.length >= 2 && timed.length === players.length) {
    const slow = timed.reduce((a, b) => (a.turnMs / a.turns >= b.turnMs / b.turns ? a : b));
    await give(slow, 'ap');
  }
  if (!coop) {
    for (const w of players.filter((p) => p.winner)) {
      if (w.wasLast) await give(w, 'sandbagger');
      if (w.userId) {
        const s = await S.currentStreak(w.userId, st.groupId);
        if (s === 3 || s === 5 || s === 10) await give(w, `streak_${s}`);
        w.streak = s;
      }
    }
    const km = players.find((p) => p.id === kingmakerId && !p.winner);
    if (km) await give(km, 'kingmaker');
    const rec = await one(
      `SELECT max(pp.score) AS best FROM play_players pp JOIN plays p ON p.id = pp.play_id
        WHERE p.game_id=$1 AND p.group_id=$2 AND p.id <> $3`, [st.game.id, st.groupId, play.id]);
    const top = players.reduce((a, b) => (Number(a.score) >= Number(b.score) ? a : b));
    if (!st.lowWins && rec?.best != null && Number(top.score) > Number(rec.best)) await give(top, 'record');
  }
  const prev = await one('SELECT count(*)::int AS n FROM plays WHERE game_id=$1 AND group_id=$2', [st.game.id, st.groupId]);
  if (prev.n === 1) {
    awards.push({ playerId: null, key: 'first_unbox' });
    for (const p of players.filter((x) => x.userId)) {
      await q('INSERT INTO achievements(user_id,group_id,key,play_id) VALUES ($1,$2,$3,$4)', [p.userId, st.groupId, 'first_unbox', play.id]);
    }
  }
  await q("UPDATE collection_items SET status='owned' WHERE game_id=$1 AND status='unplayed' AND user_id IN (SELECT user_id FROM group_members WHERE group_id=$2)", [st.game.id, st.groupId]);

  st.result = {
    playId: play.id,
    duration,
    podium: players.slice().sort((a, b) => a.rank - b.rank).map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, score: p.score, rank: p.rank, winner: p.winner, streak: p.streak || 0,
    })),
    awards,
  };
  await q("UPDATE live_tables SET state=$2, status='ended', play_id=$3 WHERE code=$1", [st.code, st, play.id]);
  return st;
}

function router() {
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  r.post('/live', A.requireUser, wrap(async (req, res) => {
    const groupId = Number(req.body?.group_id);
    const game = await one('SELECT id, name, cooperative FROM games WHERE id=$1', [Number(req.body?.game_id)]);
    if (!game || !(await A.isMember(groupId, req.user.id))) return res.status(400).json({ error: 'bad_request' });
    let code;
    do code = genCode(); while (await one('SELECT 1 FROM live_tables WHERE code=$1', [code]));
    const st = {
      code, status: 'lobby', game, groupId, hostUserId: req.user.id, players: [], turn: { index: 0, runningSince: null },
      lowWins: !!req.body?.low_wins, coopWon: null, dice: null, firstPick: null, createdAt: Date.now(), events: 0,
    };
    if (req.body?.host_plays !== false) {
      st.players.push({ id: 'p1', name: req.user.display_name, emoji: EMOJIS[0], userId: req.user.id, score: 0, turnMs: 0, turns: 0, connected: false, host: true });
    }
    await q("INSERT INTO live_tables(code,host_user_id,group_id,game_id,state,expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '18 hours')",
      [code, req.user.id, groupId, game.id, st]);
    tables.set(code, st);
    res.json({ code });
  }));

  r.get('/live/:code', wrap(async (req, res) => {
    const st = await load(req.params.code);
    if (!st) return res.status(404).json({ error: 'not_found' });
    const url = `${req.protocol}://${req.get('host')}/m/${st.code}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#15131F', light: '#F6F1E7' } });
    res.json({ state: publicState(st), url, qr });
  }));

  return r;
}

function attachSockets(io) {
  const nsp = io.of('/live');
  nsp.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie || '';
      const m = cookie.match(new RegExp(`${A.COOKIE}=([^;]+)`));
      socket.data.user = m ? await A.userFromToken(decodeURIComponent(m[1])) : null;
    } catch { socket.data.user = null; }
    next();
  });

  nsp.on('connection', (socket) => {
    const bcast = (st) => { nsp.to(st.code).emit('state', publicState(st)); scheduleSave(st); };
    const ctx = () => {
      const st = tables.get(socket.data.code);
      const me = st?.players.find((p) => p.id === socket.data.playerId);
      const isHost = !!(st && socket.data.user && socket.data.user.id === st.hostUserId);
      return { st, me, isHost };
    };

    socket.on('join', async (msg = {}, ack = () => {}) => {
      try {
        const st = await load(msg.code);
        if (!st) return ack({ error: 'not_found' });
        socket.join(st.code);
        socket.data.code = st.code;
        const user = socket.data.user;
        const isHost = !!(user && user.id === st.hostUserId);
        if (msg.screen) { // pantalla grande: solo mira
          return ack({ state: publicState(st), isHost });
        }
        let p = null;
        if (user) p = st.players.find((x) => x.userId === user.id);
        if (!p && msg.guestToken) p = st.players.find((x) => x.guestToken === msg.guestToken);
        if (!p && isHost) return ack({ state: publicState(st), isHost });
        if (!p) {
          if (st.status === 'ended') return ack({ state: publicState(st), isHost });
          if (st.players.length >= 20) return ack({ error: 'full' });
          const name = String(msg.nickname || user?.display_name || '').trim().slice(0, 18);
          if (!name) return ack({ need: 'nickname', state: publicState(st) });
          const used = new Set(st.players.map((x) => x.emoji));
          p = {
            id: 'p' + crypto.randomBytes(4).toString('hex'),
            name, emoji: msg.emoji || EMOJIS.find((e) => !used.has(e)) || '🎲',
            userId: user?.id || null, guestToken: user ? null : String(msg.guestToken || '').slice(0, 64) || null,
            score: 0, turnMs: 0, turns: 0, connected: true,
          };
          st.players.push(p);
        }
        p.connected = true;
        socket.data.playerId = p.id;
        ack({ state: publicState(st), you: p.id, isHost });
        bcast(st);
      } catch (e) {
        console.error('[live join]', e.message);
        ack({ error: 'server' });
      }
    });

    socket.on('score', (msg = {}) => {
      const { st, me, isHost } = ctx();
      if (!st || st.status === 'ended') return;
      const target = st.players.find((p) => p.id === msg.playerId);
      if (!target || !(isHost || (me && me.id === target.id))) return;
      if (typeof msg.set === 'number' && Number.isFinite(msg.set)) target.score = Math.round(msg.set * 100) / 100;
      else if (typeof msg.delta === 'number' && Number.isFinite(msg.delta)) target.score = Math.round((target.score + msg.delta) * 100) / 100;
      else return;
      if (st.status === 'lobby') { st.status = 'playing'; st.startedAt = Date.now(); }
      trackSandbag(st);
      bcast(st);
    });

    socket.on('host', (msg = {}) => {
      const { st, me, isHost } = ctx();
      if (!st || st.status === 'ended') return;
      const current = st.players[st.turn.index];
      switch (msg.action) {
        case 'start':
          if (!isHost) return;
          st.status = 'playing'; st.startedAt ||= Date.now(); break;
        case 'add_player': {
          if (!isHost) return;
          const name = String(msg.name || '').trim().slice(0, 18);
          if (!name) return;
          const used = new Set(st.players.map((x) => x.emoji));
          st.players.push({ id: 'p' + crypto.randomBytes(4).toString('hex'), name, emoji: EMOJIS.find((e) => !used.has(e)) || '🎲', userId: null, guestToken: null, score: 0, turnMs: 0, turns: 0, connected: false, offline: true });
          break;
        }
        case 'remove_player':
          if (!isHost) return;
          st.players = st.players.filter((p) => p.id !== msg.playerId);
          st.turn.index = Math.min(st.turn.index, Math.max(0, st.players.length - 1));
          break;
        case 'turn_start':
          if (!(isHost || me)) return;
          if (!st.turn.runningSince) st.turn.runningSince = Date.now();
          if (st.status === 'lobby') { st.status = 'playing'; st.startedAt = Date.now(); }
          break;
        case 'turn_next':
          if (!(isHost || (me && current && me.id === current.id))) return;
          closeTurn(st);
          st.turn.index = (st.turn.index + 1) % Math.max(1, st.players.length);
          st.turn.runningSince = Date.now();
          break;
        case 'turn_pause':
          if (!isHost) return;
          closeTurn(st); break;
        case 'low_wins':
          if (!isHost) return;
          st.lowWins = !!msg.value; break;
        case 'coop':
          if (!isHost) return;
          st.coopWon = !!msg.value; break;
        default: return;
      }
      bcast(st);
    });

    socket.on('dice', (msg = {}) => {
      const { st, me } = ctx();
      if (!st) return;
      const sides = [4, 6, 8, 10, 12, 20].includes(msg.sides) ? msg.sides : 6;
      const count = Math.min(6, Math.max(1, Number(msg.count) || 1));
      st.dice = { sides, values: Array.from({ length: count }, () => 1 + crypto.randomInt(sides)), by: me?.name || '—', at: Date.now() };
      bcast(st);
    });

    socket.on('first', () => {
      const { st } = ctx();
      if (!st || !st.players.length) return;
      const p = st.players[crypto.randomInt(st.players.length)];
      st.firstPick = { playerId: p.id, at: Date.now() };
      st.turn.index = st.players.indexOf(p);
      bcast(st);
    });

    socket.on('end', async (msg = {}, ack = () => {}) => {
      const { st, isHost } = ctx();
      if (!st || !isHost || st.status === 'ended') return ack({ error: 'forbidden' });
      if (!st.players.length) return ack({ error: 'no_players' });
      try {
        await finalize(st, msg);
        nsp.to(st.code).emit('state', publicState(st));
        ack({ ok: true });
      } catch (e) {
        console.error('[live end]', e);
        ack({ error: 'server' });
      }
    });

    socket.on('disconnect', () => {
      const { st, me } = ctx();
      if (st && me) {
        me.connected = false;
        nsp.to(st.code).emit('state', publicState(st));
      }
    });
  });

  setInterval(() => {
    for (const [code, st] of tables) if (st.status === 'ended' && Date.now() - st.endedAt > 3600e3) tables.delete(code);
  }, 600e3).unref();
}

module.exports = { router, attachSockets };
