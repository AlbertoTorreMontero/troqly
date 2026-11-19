const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[troqly] Falta DATABASE_URL');
  process.exit(1);
}
const needsSsl = !/localhost|127\.0\.0\.1|host=\/tmp|@\/|\?host=/.test(url) && !process.env.PGSSL_DISABLE;
const pool = new Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
});
pool.on('error', (e) => console.error('[db]', e.message));

const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await seed();
}

async function seed() {
  const games = require('./seed-games');
  const have = await one('SELECT count(*)::int AS n FROM games WHERE source = $1', ['seed']);
  if (have.n >= games.length) return;
  const mechKeys = new Set();
  games.forEach((g) => g[9].split(',').forEach((m) => mechKeys.add(m)));
  for (const k of mechKeys) await q('INSERT INTO mechanics(key) VALUES ($1) ON CONFLICT DO NOTHING', [k]);
  const mech = Object.fromEntries((await many('SELECT id, key FROM mechanics')).map((m) => [m.key, m.id]));
  for (const [name, year, minP, maxP, minM, maxM, weight, coop, amb, mechs] of games) {
    const g = await one(
      `INSERT INTO games(slug,name,year,min_players,max_players,min_minutes,max_minutes,weight,cooperative,ambiguous,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'seed')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [slugify(name), name, year, minP, maxP, minM, maxM, weight, !!coop, !!amb]
    );
    for (const m of mechs.split(',')) {
      await q('INSERT INTO game_mechanics VALUES ($1,$2) ON CONFLICT DO NOTHING', [g.id, mech[m]]);
    }
  }
  console.log(`[troqly] Semilla: ${games.length} juegos`);
}

module.exports = { pool, q, one, many, migrate, slugify };
