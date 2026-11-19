// Podcasts: metadatos de Podcast Index (o búsqueda de iTunes como respaldo) + RSS de cada podcast.
// El audio NUNCA pasa por nuestro servidor: se reproduce desde la URL original.
const crypto = require('crypto');
const express = require('express');
const Parser = require('rss-parser');
const { q, one, many } = require('./db');
const A = require('./auth');
const AI = require('./ai');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parser = new Parser({ timeout: 15000, customFields: { item: [['itunes:duration', 'itDuration']] }, headers: { 'User-Agent': 'Troqly/1.0 (+podcast directory)' } });

const TERMS = {
  en: ['board games', 'boardgames', 'tabletop games'],
  es: ['juegos de mesa', 'jugones juegos de mesa'],
  fr: ['jeux de société'],
  de: ['Brettspiele'],
  it: ['giochi da tavolo'],
  pt: ['jogos de tabuleiro'],
};
const RELEVANT = /board ?games?|boardgam|tabletop|juegos? de mesa|jeux de soci|brettspiel|gesellschaftsspiel|giochi da tavolo|gioco da tavolo|jogos? de tabuleiro|meeple|eurogame|wargam/i;

const piEnabled = () => !!(process.env.PODCASTINDEX_KEY && process.env.PODCASTINDEX_SECRET);

async function pi(path) {
  const key = process.env.PODCASTINDEX_KEY, secret = process.env.PODCASTINDEX_SECRET;
  const date = Math.floor(Date.now() / 1000).toString();
  const auth = crypto.createHash('sha1').update(key + secret + date).digest('hex');
  const res = await fetch(`https://api.podcastindex.org/api/1.0/${path}`, {
    headers: { 'X-Auth-Key': key, 'X-Auth-Date': date, Authorization: auth, 'User-Agent': 'Troqly/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`podcastindex ${res.status}`);
  return res.json();
}

async function itunes(term, lang) {
  const res = await fetch(`https://itunes.apple.com/search?media=podcast&limit=50&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`itunes ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter((r) => r.feedUrl).map((r) => ({
    feed_url: r.feedUrl, title: r.collectionName, author: r.artistName, description: r.primaryGenreName || '',
    language: lang, image_url: r.artworkUrl600 || r.artworkUrl100, link: r.collectionViewUrl, pi_id: null,
  }));
}

const shortLang = (l) => String(l || '').toLowerCase().slice(0, 2) || null;

async function upsertPodcast(p) {
  return one(
    `INSERT INTO podcasts(feed_url,pi_id,title,author,description,language,image_url,link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (feed_url) DO UPDATE SET title = EXCLUDED.title, author = coalesce(EXCLUDED.author, podcasts.author),
        image_url = coalesce(EXCLUDED.image_url, podcasts.image_url), language = coalesce(EXCLUDED.language, podcasts.language),
        pi_id = coalesce(EXCLUDED.pi_id, podcasts.pi_id), description = coalesce(EXCLUDED.description, podcasts.description)
     RETURNING id`,
    [p.feed_url, p.pi_id, String(p.title).slice(0, 200), p.author ? String(p.author).slice(0, 200) : null,
      p.description ? String(p.description).slice(0, 2000) : null, shortLang(p.language), p.image_url || null, p.link || null]
  );
}

async function searchSources(term, lang) {
  if (piEnabled()) {
    const data = await pi(`search/byterm?q=${encodeURIComponent(term)}&max=60&clean=true`);
    return (data.feeds || []).filter((f) => !f.dead).map((f) => ({
      feed_url: f.url, pi_id: f.id, title: f.title, author: f.author || f.ownerName, description: f.description,
      language: f.language || lang, image_url: f.artwork || f.image, link: f.link,
      categories: Object.values(f.categories || {}).join(' '),
    }));
  }
  return itunes(term, lang);
}

let refreshing = null;
async function refreshDirectory(force = false) {
  const meta = await one("SELECT updated_at FROM app_meta WHERE key='pod_dir'");
  const count = (await one('SELECT count(*)::int AS n FROM podcasts')).n;
  if (!force && meta && count > 5 && Date.now() - new Date(meta.updated_at).getTime() < 24 * 3600e3) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    let added = 0;
    for (const [lang, terms] of Object.entries(TERMS)) {
      for (const t of terms) {
        try {
          const found = await searchSources(t, lang);
          for (const f of found) {
            if (!RELEVANT.test(`${f.title} ${f.description || ''} ${f.categories || ''}`)) continue;
            await upsertPodcast(f);
            added++;
          }
        } catch (e) {
          console.error('[podcasts dir]', t, e.message);
        }
      }
    }
    await q("INSERT INTO app_meta(key,value,updated_at) VALUES ('pod_dir',$1,now()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=now()", [String(added)]);
  })().finally(() => { refreshing = null; });
  return refreshing;
}

function parseDuration(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
}
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function refreshFeed(podcast, force = false) {
  if (!force && podcast.last_checked_at && Date.now() - new Date(podcast.last_checked_at).getTime() < 3 * 3600e3) return 0;
  let feed;
  try {
    feed = await parser.parseURL(podcast.feed_url);
  } catch (e) {
    console.error('[rss]', podcast.feed_url, e.message);
    await q('UPDATE podcasts SET last_checked_at = now() WHERE id=$1', [podcast.id]);
    return 0;
  }
  let added = 0;
  for (const it of (feed.items || []).slice(0, 100)) {
    const audio = it.enclosure?.url;
    if (!audio || !/^https?:\/\//.test(audio)) continue;
    const r = await q(
      `INSERT INTO episodes(podcast_id,guid,title,description,audio_url,published_at,duration_s)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (podcast_id,guid) DO NOTHING`,
      [podcast.id, String(it.guid || audio).slice(0, 400), String(it.title || '').slice(0, 300),
        stripHtml(it.contentSnippet || it.content || it.summary || '').slice(0, 4000), audio,
        it.isoDate ? new Date(it.isoDate) : null, parseDuration(it.itDuration)]
    );
    added += r.rowCount;
  }
  await q(
    `UPDATE podcasts SET last_checked_at = now(), image_url = coalesce(image_url, $2), description = coalesce(description, $3),
       language = coalesce(language, $4) WHERE id=$1`,
    [podcast.id, feed.itunes?.image || feed.image?.url || null, stripHtml(feed.description || '').slice(0, 2000) || null, shortLang(feed.language)]
  );
  if (added) tagEpisodes().catch((e) => console.error('[tag]', e.message));
  return added;
}

// ---- Episodios ↔ juegos ----
function normalize(s) {
  return ` ${String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}
let tagging = false;
async function tagEpisodes() {
  if (tagging) return;
  tagging = true;
  try {
    const games = await many('SELECT id, name, ambiguous FROM games');
    const keys = games.map((g) => {
      const base = g.name.split(':')[0];
      return { ...g, full: normalize(g.name), base: base.length >= 4 ? normalize(base) : null };
    });
    for (let round = 0; round < 20; round++) {
      const eps = await many('SELECT id, title, description FROM episodes WHERE NOT tagged ORDER BY published_at DESC NULLS LAST LIMIT 15');
      if (!eps.length) break;
      const forAi = [];
      for (const e of eps) {
        const text = normalize(`${e.title} ${(e.description || '').slice(0, 1500)}`);
        const hits = keys.filter((g) => text.includes(g.full) || (g.base && text.includes(g.base)));
        for (const g of hits.filter((h) => !h.ambiguous)) {
          await q("INSERT INTO episode_games VALUES ($1,$2,0.9,'name_match') ON CONFLICT DO NOTHING", [e.id, g.id]);
        }
        forAi.push(e);
      }
      if (AI.enabled() && forAi.length) {
        try {
          const list = games.map((g) => `${g.id}|${g.name}`).join('\n');
          const out = await AI.generate({
            scope: 'tagging', temperature: 0, maxTokens: 2000,
            system: 'You link board game podcast episodes to the board games they actually discuss. Use only game ids from the list. A game counts only if the title or description clearly refers to that specific board game (not a common word that happens to match). Return an empty list when unsure.',
            schema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { episode: { type: 'INTEGER' }, games: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['episode', 'games'] } },
            parts: [{ text: `GAMES (id|name):\n${list}\n\nEPISODES:\n${forAi.map((e) => `#${e.id} ${e.title}\n${(e.description || '').slice(0, 600)}`).join('\n\n')}` }],
          });
          const valid = new Set(games.map((g) => g.id));
          for (const row of out || []) {
            if (!forAi.find((e) => e.id === row.episode)) continue;
            for (const gid of (row.games || []).filter((x) => valid.has(x)).slice(0, 6)) {
              await q("INSERT INTO episode_games VALUES ($1,$2,0.8,'ai') ON CONFLICT (episode_id,game_id) DO UPDATE SET method='ai+name', confidence=0.95", [row.episode, gid]);
            }
          }
        } catch (e) {
          if (e.code === 'daily_limit' || e.code === 'quota') break;
          console.error('[tag ai]', e.message);
        }
      }
      await q('UPDATE episodes SET tagged = true WHERE id = ANY($1)', [eps.map((e) => e.id)]);
    }
  } finally {
    tagging = false;
  }
}

const EP_FIELDS = `e.id, e.title, e.description, e.audio_url, e.published_at, e.duration_s, p.id AS podcast_id, p.title AS podcast, p.image_url, p.language`;

function router() {
  const r = express.Router();

  r.get('/podcasts', A.requireUser, wrap(async (req, res) => {
    const lang = shortLang(req.query.lang);
    const term = String(req.query.q || '').trim().slice(0, 80);
    const dir = refreshDirectory();
    if (!(await one('SELECT 1 FROM podcasts LIMIT 1'))) await dir;
    if (term.length >= 3) {
      try {
        const found = await searchSources(term, lang || req.user.locale);
        for (const f of found.slice(0, 25)) if (RELEVANT.test(`${f.title} ${f.description || ''} ${f.categories || ''} ${term}`)) await upsertPodcast(f);
      } catch (e) { console.error('[podcast search]', e.message); }
    }
    const rows = await many(
      `SELECT p.id, p.title, p.author, p.language, p.image_url,
              EXISTS(SELECT 1 FROM podcast_follows f WHERE f.podcast_id = p.id AND f.user_id = $1) AS following
         FROM podcasts p
        WHERE ($2::text IS NULL OR p.language = $2) AND ($3 = '' OR p.title ILIKE '%'||$3||'%' OR p.author ILIKE '%'||$3||'%' OR p.description ILIKE '%'||$3||'%')
        ORDER BY following DESC, p.title LIMIT 120`, [req.user.id, lang, term]);
    const langs = await many('SELECT language, count(*)::int AS n FROM podcasts WHERE language IS NOT NULL GROUP BY language ORDER BY n DESC');
    res.json({ podcasts: rows, languages: langs, source: piEnabled() ? 'podcastindex' : 'itunes' });
  }));

  r.get('/podcasts/:id', A.requireUser, wrap(async (req, res) => {
    const p = await one('SELECT * FROM podcasts WHERE id=$1', [Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'not_found' });
    await refreshFeed(p);
    const episodes = await many(
      `SELECT e.id, e.title, e.published_at, e.duration_s, lp.position_s, lp.completed,
              EXISTS(SELECT 1 FROM listen_queue lq WHERE lq.episode_id = e.id AND lq.user_id = $2) AS queued
         FROM episodes e LEFT JOIN listen_progress lp ON lp.episode_id = e.id AND lp.user_id = $2
        WHERE e.podcast_id = $1 ORDER BY e.published_at DESC NULLS LAST LIMIT 100`, [p.id, req.user.id]);
    const following = !!(await one('SELECT 1 FROM podcast_follows WHERE user_id=$1 AND podcast_id=$2', [req.user.id, p.id]));
    if (following) await q('UPDATE podcast_follows SET last_seen_at = now() WHERE user_id=$1 AND podcast_id=$2', [req.user.id, p.id]);
    const fresh = await one('SELECT id, title, author, description, language, image_url, link FROM podcasts WHERE id=$1', [p.id]);
    res.json({ podcast: fresh, episodes, following });
  }));

  r.post('/podcasts/:id/follow', A.requireUser, wrap(async (req, res) => {
    if (req.body?.follow === false) await q('DELETE FROM podcast_follows WHERE user_id=$1 AND podcast_id=$2', [req.user.id, req.params.id]);
    else await q('INSERT INTO podcast_follows(user_id,podcast_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
    res.json({ ok: true });
  }));

  r.get('/episodes/:id', A.requireUser, wrap(async (req, res) => {
    const locale = shortLang(req.query.locale) || req.user.locale;
    const ep = await one(
      `SELECT ${EP_FIELDS}, lp.position_s, lp.completed,
              EXISTS(SELECT 1 FROM listen_queue lq WHERE lq.episode_id = e.id AND lq.user_id = $2) AS queued,
              (SELECT summary FROM episode_summaries s WHERE s.episode_id = e.id AND s.locale = $3) AS summary
         FROM episodes e JOIN podcasts p ON p.id = e.podcast_id
         LEFT JOIN listen_progress lp ON lp.episode_id = e.id AND lp.user_id = $2
        WHERE e.id = $1`, [Number(req.params.id), req.user.id, locale]);
    if (!ep) return res.status(404).json({ error: 'not_found' });
    const games = await many('SELECT g.id, g.name FROM episode_games eg JOIN games g ON g.id = eg.game_id WHERE eg.episode_id=$1', [ep.id]);
    res.json({ episode: ep, games });
  }));

  r.post('/episodes/:id/summary', A.requireUser, wrap(async (req, res) => {
    const locale = shortLang(req.body?.locale) || req.user.locale;
    const ep = await one('SELECT id, title, description FROM episodes WHERE id=$1', [Number(req.params.id)]);
    if (!ep) return res.status(404).json({ error: 'not_found' });
    const have = await one('SELECT summary FROM episode_summaries WHERE episode_id=$1 AND locale=$2', [ep.id, locale]);
    if (have) return res.json({ summary: have.summary });
    if (!ep.description || ep.description.length < 40) return res.json({ summary: null });
    try {
      const summary = await AI.generate({
        scope: 'summary', temperature: 0.3, maxTokens: 400,
        system: `Summarize podcast episode descriptions for board game fans in ${AI.langName(locale)}. 2-3 short sentences. Mention the games covered. Only use information in the description; do not add anything. Plain text, no markdown, no links, no sponsor ads.`,
        parts: [{ text: `Title: ${ep.title}\nDescription: ${ep.description.slice(0, 3500)}` }],
      });
      await q('INSERT INTO episode_summaries VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ep.id, locale, summary]);
      res.json({ summary });
    } catch (e) {
      res.status(e.code === 'quota' || e.code === 'daily_limit' ? 429 : 503).json({ error: e.code || 'ai_error' });
    }
  }));

  r.post('/episodes/:id/progress', A.requireUser, wrap(async (req, res) => {
    const pos = Math.max(0, Math.round(Number(req.body?.position) || 0));
    await q(
      `INSERT INTO listen_progress(user_id,episode_id,position_s,completed,updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id,episode_id) DO UPDATE SET position_s=$3, completed = listen_progress.completed OR $4, updated_at=now()`,
      [req.user.id, Number(req.params.id), pos, !!req.body?.completed]);
    if (req.body?.completed) await q('DELETE FROM listen_queue WHERE user_id=$1 AND episode_id=$2', [req.user.id, Number(req.params.id)]);
    res.json({ ok: true });
  }));

  r.post('/queue/:episodeId', A.requireUser, wrap(async (req, res) => {
    if (req.body?.add === false) await q('DELETE FROM listen_queue WHERE user_id=$1 AND episode_id=$2', [req.user.id, req.params.episodeId]);
    else await q('INSERT INTO listen_queue(user_id,episode_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.episodeId]);
    res.json({ ok: true });
  }));

  r.get('/library', A.requireUser, wrap(async (req, res) => {
    const follows = await many(
      `SELECT p.id, p.title, p.image_url, p.feed_url, p.last_checked_at, f.last_seen_at FROM podcast_follows f JOIN podcasts p ON p.id = f.podcast_id
        WHERE f.user_id = $1 ORDER BY p.title`, [req.user.id]);
    await Promise.all(follows.slice(0, 15).map((p) => refreshFeed(p).catch(() => 0)));
    const fresh = await many(
      `SELECT ${EP_FIELDS} FROM episodes e JOIN podcasts p ON p.id = e.podcast_id JOIN podcast_follows f ON f.podcast_id = p.id AND f.user_id = $1
        WHERE e.published_at > f.last_seen_at - interval '1 second' AND e.published_at > now() - interval '30 days'
        ORDER BY e.published_at DESC LIMIT 30`, [req.user.id]);
    const queue = await many(
      `SELECT ${EP_FIELDS}, lp.position_s FROM listen_queue lq JOIN episodes e ON e.id = lq.episode_id JOIN podcasts p ON p.id = e.podcast_id
         LEFT JOIN listen_progress lp ON lp.episode_id = e.id AND lp.user_id = $1
        WHERE lq.user_id = $1 ORDER BY lq.added_at`, [req.user.id]);
    const inProgress = await many(
      `SELECT ${EP_FIELDS}, lp.position_s FROM listen_progress lp JOIN episodes e ON e.id = lp.episode_id JOIN podcasts p ON p.id = e.podcast_id
        WHERE lp.user_id = $1 AND NOT lp.completed AND lp.position_s > 15 ORDER BY lp.updated_at DESC LIMIT 10`, [req.user.id]);
    res.json({ follows: follows.map(({ feed_url, ...f }) => f), fresh, queue, inProgress });
  }));

  r.get('/library/badge', A.requireUser, wrap(async (req, res) => {
    const row = await one(
      `SELECT count(*)::int AS n FROM episodes e JOIN podcast_follows f ON f.podcast_id = e.podcast_id AND f.user_id = $1
        WHERE e.published_at > f.last_seen_at AND e.published_at > now() - interval '30 days'`, [req.user.id]);
    res.json({ fresh: row.n });
  }));

  r.get('/games/:id/episodes', A.requireUser, wrap(async (req, res) => {
    res.json(await many(
      `SELECT ${EP_FIELDS}, eg.method FROM episode_games eg JOIN episodes e ON e.id = eg.episode_id JOIN podcasts p ON p.id = e.podcast_id
        WHERE eg.game_id = $1 ORDER BY e.published_at DESC NULLS LAST LIMIT 30`, [Number(req.params.id)]));
  }));

  r.get('/podcast-recs', A.requireUser, wrap(async (req, res) => {
    const groupId = Number(req.query.group);
    if (!(await A.isMember(groupId, req.user.id))) return res.status(403).json({ error: 'not_member' });
    const rows = await many(
      `WITH interest AS (
         SELECT game_id, 2 AS w FROM collection_items WHERE user_id IN (SELECT user_id FROM group_members WHERE group_id = $1)
         UNION ALL SELECT game_id, 3 FROM plays WHERE group_id = $1 AND ended_at > now() - interval '120 days'
       ), scored AS (
         SELECT eg.episode_id, sum(i.w) AS score, array_agg(DISTINCT g.name) AS games
           FROM interest i JOIN episode_games eg ON eg.game_id = i.game_id JOIN games g ON g.id = i.game_id
          GROUP BY eg.episode_id
       )
       SELECT ${EP_FIELDS}, s.games, s.score FROM scored s JOIN episodes e ON e.id = s.episode_id JOIN podcasts p ON p.id = e.podcast_id
        WHERE NOT EXISTS (SELECT 1 FROM listen_progress lp WHERE lp.episode_id = e.id AND lp.user_id = $2 AND lp.completed)
        ORDER BY s.score DESC, e.published_at DESC NULLS LAST LIMIT 20`, [groupId, req.user.id]);
    res.json(rows);
  }));

  r.post('/groups/:id/shares', A.requireUser, wrap(async (req, res) => {
    const gid = Number(req.params.id);
    if (!(await A.isMember(gid, req.user.id))) return res.status(403).json({ error: 'not_member' });
    await q('INSERT INTO shares(group_id,user_id,episode_id,message) VALUES ($1,$2,$3,$4)',
      [gid, req.user.id, Number(req.body?.episode_id), String(req.body?.message || '').slice(0, 200)]);
    res.json({ ok: true });
  }));

  return r;
}

module.exports = { router, refreshDirectory, refreshFeed, tagEpisodes, upsertPodcast };
