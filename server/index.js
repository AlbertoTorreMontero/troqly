const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const { migrate, one } = require('./db');
const { attachUser } = require('./auth');
const AI = require('./ai');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      'media-src': ["'self'", 'https:', 'http:', 'blob:'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'font-src': ["'self'", 'data:'],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/healthz', async (_req, res) => {
  try {
    await one('SELECT 1');
    res.json({ ok: true, db: true, ai: AI.enabled(), podcastindex: !!process.env.PODCASTINDEX_KEY });
  } catch {
    res.status(500).json({ ok: false, db: false });
  }
});
app.get('/api/health/ai', async (_req, res) => {
  const h = await AI.health();
  res.status(h.ok ? 200 : 503).json(h);
});

app.use('/api', require('./api'));
app.use('/api', require('./live').router());
app.use('/api', require('./rules').router());
app.use('/api', require('./podcasts').router());
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Tipografías propias servidas desde node_modules (sin CDNs externos)
const nm = path.join(__dirname, '..', 'node_modules');
app.use('/fonts/inter', express.static(path.join(nm, '@fontsource-variable', 'inter', 'files'), { maxAge: '365d', immutable: true }));
app.use('/fonts/space-grotesk', express.static(path.join(nm, '@fontsource-variable', 'space-grotesk', 'files'), { maxAge: '365d', immutable: true }));

const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, {
  setHeaders(res, file) {
    if (/sw\.js$|index\.html$|\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));
app.get(/^\/(?!api|socket\.io|fonts).*/, (_req, res) => res.sendFile(path.join(pub, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'too_big' });
  res.status(500).json({ error: 'server' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, pingInterval: 20000, pingTimeout: 20000 });
require('./live').attachSockets(io);

const PORT = Number(process.env.PORT) || 3000;
migrate()
  .then(() => server.listen(PORT, () => console.log(`[troqly] escuchando en :${PORT}`)))
  .catch((e) => {
    console.error('[troqly] error al migrar', e);
    process.exit(1);
  });

module.exports = { app, server };
