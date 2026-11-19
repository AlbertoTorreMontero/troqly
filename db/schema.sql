-- TROQLY schema (idempotente)
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cafe',          -- cafe | store (modo futuro, sin pantallas)
  country TEXT,
  owner_user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  locale TEXT DEFAULT 'es',
  currency TEXT DEFAULT 'EUR',
  theme TEXT DEFAULT 'dark',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  owner_id INT REFERENCES users(id),
  venue_id INT REFERENCES venues(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS mechanics (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  year INT,
  min_players INT DEFAULT 1,
  max_players INT DEFAULT 4,
  min_minutes INT DEFAULT 30,
  max_minutes INT DEFAULT 60,
  weight NUMERIC(3,1),
  cooperative BOOLEAN DEFAULT false,
  ambiguous BOOLEAN DEFAULT false,            -- nombre común (necesita IA para enlazar podcasts)
  source TEXT DEFAULT 'seed',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_mechanics (
  game_id INT REFERENCES games(id) ON DELETE CASCADE,
  mechanic_id INT REFERENCES mechanics(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, mechanic_id)
);

CREATE TABLE IF NOT EXISTS collection_items (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  venue_id INT REFERENCES venues(id),
  game_id INT REFERENCES games(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'owned',       -- owned | wishlist | want_to_play | unplayed
  price_paid NUMERIC(10,2),
  currency TEXT,
  acquired_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, game_id)
);

CREATE TABLE IF NOT EXISTS plays (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  game_id INT REFERENCES games(id),
  venue_id INT REFERENCES venues(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ DEFAULT now(),
  duration_s INT,
  cooperative BOOLEAN DEFAULT false,
  coop_won BOOLEAN,
  notes TEXT,
  created_by INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS play_players (
  id SERIAL PRIMARY KEY,
  play_id INT REFERENCES plays(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  guest_name TEXT,
  guest_token TEXT,
  emoji TEXT,
  score NUMERIC,
  rank INT,
  is_winner BOOLEAN DEFAULT false,
  is_first_player BOOLEAN DEFAULT false,
  turn_time_s INT,
  turns INT,
  started_behind BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS play_players_user ON play_players(user_id);
CREATE INDEX IF NOT EXISTS play_players_play ON play_players(play_id);

CREATE TABLE IF NOT EXISTS live_tables (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  host_user_id INT REFERENCES users(id),
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  game_id INT REFERENCES games(id),
  state JSONB NOT NULL,
  status TEXT DEFAULT 'lobby',
  play_id INT REFERENCES plays(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  play_id INT REFERENCES plays(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rulebooks (
  id SERIAL PRIMARY KEY,
  game_id INT REFERENCES games(id) ON DELETE CASCADE,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT,
  language TEXT,
  pages INT DEFAULT 0,
  status TEXT DEFAULT 'ready',                -- processing | ready | error
  uploaded_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rule_pages (
  rulebook_id INT REFERENCES rulebooks(id) ON DELETE CASCADE,
  page INT NOT NULL,
  text TEXT NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
  PRIMARY KEY (rulebook_id, page)
);
CREATE INDEX IF NOT EXISTS rule_pages_tsv ON rule_pages USING GIN (tsv);

CREATE TABLE IF NOT EXISTS rule_questions (
  id SERIAL PRIMARY KEY,
  rulebook_id INT REFERENCES rulebooks(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  question TEXT NOT NULL,
  answer TEXT,
  citations JSONB DEFAULT '[]',
  found BOOLEAN DEFAULT false,
  flagged BOOLEAN DEFAULT false,
  locale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS podcasts (
  id SERIAL PRIMARY KEY,
  feed_url TEXT UNIQUE NOT NULL,
  pi_id BIGINT,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  language TEXT,
  image_url TEXT,
  link TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS episodes (
  id SERIAL PRIMARY KEY,
  podcast_id INT REFERENCES podcasts(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  duration_s INT,
  tagged BOOLEAN DEFAULT false,
  UNIQUE (podcast_id, guid)
);
CREATE INDEX IF NOT EXISTS episodes_pub ON episodes(published_at DESC);

CREATE TABLE IF NOT EXISTS episode_games (
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  game_id INT REFERENCES games(id) ON DELETE CASCADE,
  confidence REAL,
  method TEXT,
  PRIMARY KEY (episode_id, game_id)
);

CREATE TABLE IF NOT EXISTS episode_summaries (
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (episode_id, locale)
);

CREATE TABLE IF NOT EXISTS podcast_follows (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  podcast_id INT REFERENCES podcasts(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, podcast_id)
);

CREATE TABLE IF NOT EXISTS listen_queue (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE IF NOT EXISTS listen_progress (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  position_s INT DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE IF NOT EXISTS shares (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  episode_id INT REFERENCES episodes(id) ON DELETE CASCADE,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage (
  day DATE NOT NULL,
  scope TEXT NOT NULL,
  count INT DEFAULT 0,
  PRIMARY KEY (day, scope)
);
