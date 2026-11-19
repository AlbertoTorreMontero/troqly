const express = require('express');
const crypto = require('crypto');
const { q, one, many, slugify } = require('./db');
const A = require('./auth');
const S = require('./stats');

const r = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const SUPPORTED = ['es', 'en'];
const okLocale = (l) => (SUPPORTED.includes((l || '').slice(0, 2)) ? l.slice(0, 2) : 'en');

function inviteCode() {
  return crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
}

async function groupsFor(userId) {
  return many(
    `SELECT g.id, g.name, g.invite_code, gm.role,
            (SELECT count(*)::int FROM group_members WHERE group_id = g.id) AS members
       FROM groups g JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1 ORDER BY g.created_at`,
    [userId]
  );
}

async function memberOr403(req, res, groupId) {
  if (!(await A.isMember(groupId, req.user.id))) {
    res.status(403).json({ error: 'not_member' });
    return false;
  }
  return true;
}

// ---------- Auth ----------
r.post('/auth/register', wrap(async (req, res) => {
  const { email, password, name, locale, currency } = req.body || {};
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: 'bad_email' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'short_password' });
  const n = String(name || '').trim().slice(0, 40) || e.split('@')[0];
  if (await one('SELECT 1 FROM users WHERE email=$1', [e])) return res.status(409).json({ error: 'email_taken' });
  const u = await one(
    'INSERT INTO users(email,password_hash,display_name,locale,currency) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [e, await A.hashPassword(password), n, okLocale(locale), String(currency || 'EUR').slice(0, 3).toUpperCase()]
  );
  await A.createSession(res, u.id);
  res.json({ ok: true });
}));

r.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const u = await one('SELECT id, password_hash FROM users WHERE email=$1', [String(email || '').trim().toLowerCase()]);
  if (!u || !(await A.checkPassword(String(password || ''), u.password_hash))) return res.status(401).json({ error: 'bad_login' });
  await A.createSession(res, u.id);
  res.json({ ok: true });
}));

r.post('/auth/logout', wrap(async (req, res) => {
  const t = req.cookies[A.COOKIE];
  if (t) await q('DELETE FROM sessions WHERE token=$1', [t]);
  res.clearCookie(A.COOKIE);
  res.json({ ok: true });
}));

r.get('/me', wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user, groups: await groupsFor(req.user.id) });
}));

r.patch('/me', A.requireUser, wrap(async (req, res) => {
  const { locale, theme, currency, display_name } = req.body || {};
  await q(
    `UPDATE users SET locale = coalesce($2, locale), theme = coalesce($3, theme),
       currency = coalesce($4, currency), display_name = coalesce($5, display_name) WHERE id = $1`,
    [req.user.id, locale ? okLocale(locale) : null, ['dark', 'light'].includes(theme) ? theme : null,
      currency ? String(currency).slice(0, 3).toUpperCase() : null, display_name ? String(display_name).slice(0, 40) : null]
  );
  res.json({ ok: true });
}));

// Reclamar partidas jugadas como invitado
r.post('/me/claim', A.requireUser, wrap(async (req, res) => {
  const tokens = (req.body?.tokens || []).filter((t) => typeof t === 'string' && t.length > 10).slice(0, 20);
  if (!tokens.length) return res.json({ claimed: 0 });
  const out = await q(
    `UPDATE play_players SET user_id = $1, guest_name = NULL
      WHERE guest_token = ANY($2) AND user_id IS NULL
        AND play_id NOT IN (SELECT play_id FROM play_players WHERE user_id = $1)`,
    [req.user.id, tokens]
  );
  res.json({ claimed: out.rowCount });
}));

// ---------- Grupos ----------
r.post('/groups', A.requireUser, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 50);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const g = await one('INSERT INTO groups(name,invite_code,owner_id) VALUES ($1,$2,$3) RETURNING id, invite_code', [name, inviteCode(), req.user.id]);
  await q("INSERT INTO group_members VALUES ($1,$2,'owner')", [g.id, req.user.id]);
  res.json(g);
}));

r.get('/groups/:id', A.requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await memberOr403(req, res, id))) return;
  const group = await one('SELECT id, name, invite_code, owner_id FROM groups WHERE id=$1', [id]);
  const members = await many(
    `SELECT u.id, u.display_name, gm.role FROM group_members gm JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 ORDER BY gm.joined_at`, [id]);
  res.json({ group, members });
}));

r.get('/invite/:code', wrap(async (req, res) => {
  const g = await one(
    `SELECT g.id, g.name, (SELECT count(*)::int FROM group_members WHERE group_id = g.id) AS members
       FROM groups g WHERE invite_code = $1`, [req.params.code]);
  if (!g) return res.status(404).json({ error: 'not_found' });
  res.json(g);
}));

r.post('/invite/:code/join', A.requireUser, wrap(async (req, res) => {
  const g = await one('SELECT id FROM groups WHERE invite_code=$1', [req.params.code]);
  if (!g) return res.status(404).json({ error: 'not_found' });
  await q('INSERT INTO group_members(group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g.id, req.user.id]);
  res.json({ id: g.id });
}));

r.get('/groups/:id/home', A.requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await memberOr403(req, res, id))) return;
  const last = await one(
    `SELECT p.id, p.ended_at, g.name AS game, g.id AS game_id,
            (SELECT json_agg(json_build_object('name', coalesce(u.display_name, pp.guest_name), 'emoji', pp.emoji,
                    'score', pp.score, 'rank', pp.rank, 'winner', pp.is_winner) ORDER BY pp.rank)
               FROM play_players pp LEFT JOIN users u ON u.id = pp.user_id WHERE pp.play_id = p.id) AS players
       FROM plays p JOIN games g ON g.id = p.game_id WHERE p.group_id = $1 ORDER BY p.ended_at DESC LIMIT 1`, [id]);
  const shares = await many(
    `SELECT s.id, s.message, s.created_at, u.display_name AS by, e.id AS episode_id, e.title, po.title AS podcast, po.image_url
       FROM shares s JOIN users u ON u.id = s.user_id JOIN episodes e ON e.id = s.episode_id JOIN podcasts po ON po.id = e.podcast_id
      WHERE s.group_id = $1 ORDER BY s.created_at DESC LIMIT 5`, [id]);
  const live = await one(
    "SELECT code, g.name AS game FROM live_tables lt JOIN games g ON g.id = lt.game_id WHERE group_id=$1 AND status <> 'ended' AND expires_at > now() ORDER BY lt.created_at DESC LIMIT 1", [id]);
  const counts = await one('SELECT count(*)::int AS plays FROM plays WHERE group_id=$1', [id]);
  res.json({ last, shares, live, hot: await S.hotStreak(id), plays: counts.plays });
}));

r.get('/groups/:id/ranking', A.requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await memberOr403(req, res, id))) return;
  res.json({ ranking: await S.groupRanking(id), rivalries: await S.rivalries(req.user.id, id) });
}));

r.get('/groups/:id/plays', A.requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await memberOr403(req, res, id))) return;
  const gameId = req.query.game ? Number(req.query.game) : null;
  const plays = await many(
    `SELECT p.id, p.ended_at, p.duration_s, p.cooperative, p.coop_won, g.name AS game, g.id AS game_id,
            (SELECT json_agg(json_build_object('name', coalesce(u.display_name, pp.guest_name), 'emoji', pp.emoji,
                    'score', pp.score, 'rank', pp.rank, 'winner', pp.is_winner) ORDER BY pp.rank)
               FROM play_players pp LEFT JOIN users u ON u.id = pp.user_id WHERE pp.play_id = p.id) AS players
       FROM plays p JOIN games g ON g.id = p.game_id
      WHERE p.group_id = $1 ${gameId ? 'AND p.game_id = $2' : ''}
      ORDER BY p.ended_at DESC LIMIT 100`, gameId ? [id, gameId] : [id]);
  res.json({ plays });
}));

r.delete('/plays/:id', A.requireUser, wrap(async (req, res) => {
  const p = await one('SELECT group_id, created_by FROM plays WHERE id=$1', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (!(await memberOr403(req, res, p.group_id))) return;
  await q('DELETE FROM plays WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- Juegos ----------
r.get('/mechanics', wrap(async (_req, res) => res.json(await many('SELECT id, key FROM mechanics ORDER BY key'))));

r.get('/games', wrap(async (req, res) => {
  const qs = String(req.query.q || '').trim();
  const rows = await many(
    `SELECT g.id, g.name, g.year, g.min_players, g.max_players, g.min_minutes, g.max_minutes, g.weight, g.cooperative,
            array(SELECT m.key FROM game_mechanics gm JOIN mechanics m ON m.id = gm.mechanic_id WHERE gm.game_id = g.id) AS mechanics
       FROM games g WHERE ($1 = '' OR g.name ILIKE '%' || $1 || '%')
      ORDER BY (g.name ILIKE $1 || '%') DESC, g.name LIMIT 60`, [qs]);
  res.json(rows);
}));

r.post('/games', A.requireUser, wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'name_required' });
  const n = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || d));
  let slug = slugify(name);
  if (await one('SELECT 1 FROM games WHERE slug=$1', [slug])) slug += '-' + crypto.randomBytes(2).toString('hex');
  const g = await one(
    `INSERT INTO games(slug,name,year,min_players,max_players,min_minutes,max_minutes,cooperative,source,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9) RETURNING id`,
    [slug, name, b.year ? n(b.year, 2020, 1800, 2100) : null, n(b.min_players, 2, 1, 100), n(b.max_players, 4, 1, 100),
      n(b.min_minutes, 30, 1, 1440), n(b.max_minutes, 60, 1, 1440), !!b.cooperative, req.user.id]
  );
  for (const k of (b.mechanics || []).slice(0, 8)) {
    await q('INSERT INTO game_mechanics SELECT $1, id FROM mechanics WHERE key=$2 ON CONFLICT DO NOTHING', [g.id, k]);
  }
  res.json(g);
}));

r.get('/games/:id', A.requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const game = await one(
    `SELECT g.*, array(SELECT m.key FROM game_mechanics gm JOIN mechanics m ON m.id = gm.mechanic_id WHERE gm.game_id = g.id) AS mechanics
       FROM games g WHERE id = $1`, [id]);
  if (!game) return res.status(404).json({ error: 'not_found' });
  const mine = await one('SELECT id, status, price_paid, currency, acquired_at FROM collection_items WHERE user_id=$1 AND game_id=$2', [req.user.id, id]);
  const groupId = Number(req.query.group) || null;
  let rulebooks = [], plays = 0, record = null;
  if (groupId && (await A.isMember(groupId, req.user.id))) {
    rulebooks = await many("SELECT id, title, language, pages, status, created_at FROM rulebooks WHERE game_id=$1 AND group_id=$2 ORDER BY created_at DESC", [id, groupId]);
    plays = (await one('SELECT count(*)::int AS n FROM plays WHERE game_id=$1 AND group_id=$2', [id, groupId])).n;
    record = await one(
      `SELECT pp.score, coalesce(u.display_name, pp.guest_name) AS name FROM play_players pp
         JOIN plays p ON p.id = pp.play_id LEFT JOIN users u ON u.id = pp.user_id
        WHERE p.game_id=$1 AND p.group_id=$2 AND pp.score IS NOT NULL ORDER BY pp.score DESC LIMIT 1`, [id, groupId]);
  }
  res.json({ game, mine, rulebooks, plays, record });
}));

// ---------- Colección ----------
r.get('/collection', A.requireUser, wrap(async (req, res) => {
  const groupId = Number(req.query.group) || null;
  if (groupId && !(await memberOr403(req, res, groupId))) return;
  const rows = await many(
    `SELECT c.id, c.status, c.price_paid, c.currency, c.user_id, u.display_name AS owner,
            g.id AS game_id, g.name, g.year, g.min_players, g.max_players, g.min_minutes, g.max_minutes, g.weight, g.cooperative,
            array(SELECT m.key FROM game_mechanics gm JOIN mechanics m ON m.id = gm.mechanic_id WHERE gm.game_id = g.id) AS mechanics,
            (SELECT count(*)::int FROM plays p WHERE p.game_id = g.id ${groupId ? 'AND p.group_id = $2' : `AND p.id IN (SELECT play_id FROM play_players WHERE user_id = $1)`}) AS plays
       FROM collection_items c JOIN games g ON g.id = c.game_id JOIN users u ON u.id = c.user_id
      WHERE ${groupId ? '$1::int IS NOT NULL AND c.user_id IN (SELECT user_id FROM group_members WHERE group_id = $2)' : 'c.user_id = $1'}
      ORDER BY g.name`, groupId ? [req.user.id, groupId] : [req.user.id]);
  res.json(rows);
}));

const STATUSES = ['owned', 'wishlist', 'want_to_play', 'unplayed'];
r.post('/collection', A.requireUser, wrap(async (req, res) => {
  const { game_id, status, price_paid, currency } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'bad_status' });
  const row = await one(
    `INSERT INTO collection_items(user_id,game_id,status,price_paid,currency)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id,game_id) DO UPDATE SET status = EXCLUDED.status,
        price_paid = coalesce(EXCLUDED.price_paid, collection_items.price_paid),
        currency = coalesce(EXCLUDED.currency, collection_items.currency)
     RETURNING id`,
    [req.user.id, Number(game_id), status, price_paid === '' || price_paid == null ? null : Number(price_paid), currency || req.user.currency]
  );
  res.json(row);
}));

r.delete('/collection/:id', A.requireUser, wrap(async (req, res) => {
  await q('DELETE FROM collection_items WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// ¿A qué jugamos?
r.get('/groups/:id/suggest', A.requireUser, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await memberOr403(req, res, id))) return;
  const players = Math.max(1, Number(req.query.players) || 4);
  const minutes = Math.max(5, Number(req.query.minutes) || 60);
  const rows = await many(
    `SELECT DISTINCT ON (g.id) g.id, g.name, g.min_players, g.max_players, g.min_minutes, g.max_minutes, g.weight, g.cooperative,
            array(SELECT m.key FROM game_mechanics gm JOIN mechanics m ON m.id = gm.mechanic_id WHERE gm.game_id = g.id) AS mechanics,
            (SELECT count(*)::int FROM plays p WHERE p.game_id = g.id AND p.group_id = $1) AS plays,
            (SELECT max(ended_at) FROM plays p WHERE p.game_id = g.id AND p.group_id = $1) AS last_played,
            u.display_name AS owner
       FROM collection_items c JOIN games g ON g.id = c.game_id JOIN users u ON u.id = c.user_id
      WHERE c.user_id IN (SELECT user_id FROM group_members WHERE group_id = $1)
        AND c.status IN ('owned','unplayed')
        AND g.min_players <= $2 AND g.max_players >= $2 AND g.min_minutes <= $3`,
    [id, players, minutes]);
  const now = Date.now();
  for (const g of rows) {
    const fit = g.max_minutes <= minutes ? 1 : 0.6;
    const fresh = g.plays === 0 ? 1.5 : Math.min(1.3, (now - new Date(g.last_played).getTime()) / (30 * 864e5) * 0.3 + 0.7);
    g.score = fit * fresh;
    g.unplayed = g.plays === 0;
  }
  rows.sort((a, b) => b.score - a.score);
  res.json(rows.slice(0, 12));
}));

// ---------- Estadísticas ----------
r.get('/stats', A.requireUser, wrap(async (req, res) => {
  const groupId = Number(req.query.group) || null;
  if (groupId && !(await memberOr403(req, res, groupId))) return;
  res.json(await S.userStats(req.user.id, groupId));
}));

module.exports = r;
