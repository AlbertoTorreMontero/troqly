const { many, one } = require('./db');

function hIndex(counts) {
  const s = [...counts].sort((a, b) => b - a);
  let h = 0;
  while (h < s.length && s[h] >= h + 1) h++;
  return h;
}

async function userPlays(userId, groupId) {
  return many(
    `SELECT p.id, p.game_id, g.name AS game_name, p.ended_at, p.duration_s, p.cooperative, p.coop_won,
            pp.is_winner, pp.rank, pp.score, p.group_id
       FROM play_players pp JOIN plays p ON p.id = pp.play_id JOIN games g ON g.id = p.game_id
      WHERE pp.user_id = $1 ${groupId ? 'AND p.group_id = $2' : ''}
      ORDER BY p.ended_at ASC`,
    groupId ? [userId, groupId] : [userId]
  );
}

function streaks(plays) {
  let cur = 0, best = 0;
  for (const p of plays) {
    if (p.is_winner) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return { current: cur, best };
}

async function userStats(userId, groupId) {
  const plays = await userPlays(userId, groupId);
  const total = plays.length;
  const wins = plays.filter((p) => p.is_winner).length;
  const byGame = {};
  for (const p of plays) {
    byGame[p.game_id] ||= { game_id: p.game_id, name: p.game_name, plays: 0, wins: 0, minutes: 0 };
    byGame[p.game_id].plays++;
    if (p.is_winner) byGame[p.game_id].wins++;
    byGame[p.game_id].minutes += Math.round((p.duration_s || 0) / 60);
  }
  const games = Object.values(byGame).sort((a, b) => b.plays - a.plays);
  const counts = games.map((g) => g.plays);

  // Coste por partida (colección propia con precio)
  const owned = await many(
    `SELECT c.game_id, g.name, c.price_paid, c.currency,
            (SELECT count(*)::int FROM play_players pp JOIN plays p ON p.id = pp.play_id
              WHERE pp.user_id = c.user_id AND p.game_id = c.game_id) AS plays
       FROM collection_items c JOIN games g ON g.id = c.game_id
      WHERE c.user_id = $1 AND c.status IN ('owned','unplayed') AND c.price_paid IS NOT NULL`,
    [userId]
  );
  const costPerPlay = owned.map((o) => ({
    game_id: o.game_id, name: o.name, currency: o.currency, price: Number(o.price_paid), plays: o.plays,
    per_play: Number(o.price_paid) / Math.max(1, o.plays),
  })).sort((a, b) => a.per_play - b.per_play);

  // Heatmap último año
  const heat = {};
  const since = Date.now() - 366 * 864e5;
  for (const p of plays) {
    const t = new Date(p.ended_at);
    if (t.getTime() < since) continue;
    const k = t.toISOString().slice(0, 10);
    heat[k] = (heat[k] || 0) + 1;
  }

  // Por mecánica
  const mech = await many(
    `SELECT m.key, count(*)::int AS plays, sum(CASE WHEN pp.is_winner THEN 1 ELSE 0 END)::int AS wins
       FROM play_players pp JOIN plays p ON p.id = pp.play_id
       JOIN game_mechanics gm ON gm.game_id = p.game_id JOIN mechanics m ON m.id = gm.mechanic_id
      WHERE pp.user_id = $1 ${groupId ? 'AND p.group_id = $2' : ''}
      GROUP BY m.key ORDER BY plays DESC`,
    groupId ? [userId, groupId] : [userId]
  );

  const ach = await many(
    `SELECT key, count(*)::int AS n, max(earned_at) AS last FROM achievements
      WHERE user_id = $1 ${groupId ? 'AND group_id = $2' : ''} GROUP BY key ORDER BY n DESC`,
    groupId ? [userId, groupId] : [userId]
  );

  const fives = counts.filter((c) => c >= 5).length;
  const dimes = counts.filter((c) => c >= 10).length;
  return {
    total, wins, win_pct: total ? wins / total : 0,
    h_index: hIndex(counts), fives, dimes,
    distinct_games: games.length,
    hours: Math.round(plays.reduce((s, p) => s + (p.duration_s || 0), 0) / 360) / 10,
    most_played: games.slice(0, 8),
    streak: streaks(plays),
    cost_per_play: costPerPlay,
    heatmap: heat,
    by_mechanic: mech,
    achievements: ach,
  };
}

async function groupRanking(groupId) {
  const rows = await many(
    `SELECT u.id, u.display_name,
            count(pp.id)::int AS plays,
            coalesce(sum(CASE WHEN pp.is_winner THEN 1 ELSE 0 END),0)::int AS wins
       FROM group_members gm JOIN users u ON u.id = gm.user_id
       LEFT JOIN play_players pp ON pp.user_id = u.id
            AND pp.play_id IN (SELECT id FROM plays WHERE group_id = $1)
      WHERE gm.group_id = $1
      GROUP BY u.id ORDER BY wins DESC, plays ASC`,
    [groupId]
  );
  for (const r of rows) {
    r.win_pct = r.plays ? r.wins / r.plays : 0;
    r.streak = streaks(await userPlays(r.id, groupId));
  }
  return rows;
}

/** Cara a cara: para cada otro miembro, cuántas veces quedó por delante cada uno (por juego también). */
async function rivalries(userId, groupId) {
  const rows = await many(
    `SELECT a.play_id, p.game_id, g.name AS game, a.rank AS my_rank, a.is_winner AS my_win,
            b.user_id AS other_id, u.display_name AS other_name, b.rank AS other_rank, b.is_winner AS other_win,
            p.cooperative
       FROM play_players a
       JOIN play_players b ON b.play_id = a.play_id AND b.user_id IS NOT NULL AND b.user_id <> a.user_id
       JOIN plays p ON p.id = a.play_id JOIN games g ON g.id = p.game_id JOIN users u ON u.id = b.user_id
      WHERE a.user_id = $1 AND p.group_id = $2 AND NOT p.cooperative`,
    [userId, groupId]
  );
  const map = {};
  for (const r of rows) {
    const k = r.other_id;
    map[k] ||= { user_id: k, name: r.other_name, me: 0, them: 0, games: {} };
    const g = (map[k].games[r.game_id] ||= { game_id: r.game_id, name: r.game, me: 0, them: 0 });
    if (r.my_rank < r.other_rank) { map[k].me++; g.me++; }
    else if (r.other_rank < r.my_rank) { map[k].them++; g.them++; }
  }
  return Object.values(map).map((x) => {
    const games = Object.values(x.games).sort((a, b) => b.me + b.them - (a.me + a.them));
    return { ...x, games, top_game: games[0] || null };
  }).sort((a, b) => b.me + b.them - (a.me + a.them));
}

async function hotStreak(groupId) {
  const ranking = await groupRanking(groupId);
  const best = ranking.filter((r) => r.streak.current >= 2).sort((a, b) => b.streak.current - a.streak.current)[0];
  return best ? { name: best.display_name, user_id: best.id, n: best.streak.current } : null;
}

async function currentStreak(userId, groupId) {
  return streaks(await userPlays(userId, groupId)).current;
}

module.exports = { userStats, groupRanking, rivalries, hotStreak, hIndex, currentStreak };
