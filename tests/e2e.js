// Prueba de punta a punta: varios "móviles" (clientes) contra el servidor real + una IA y un RSS simulados.
const http = require('http');
const { spawn, execSync } = require('child_process');
const path = require('path');
const assert = require('assert/strict');
const PDFDocument = require('pdfkit');
const { io } = require('socket.io-client');

const APP = 3200, MOCK = 3201;
const DB = 'postgresql://postgres@localhost:5433/troqly_test?host=/tmp';
const base = `http://localhost:${APP}`;
let pass = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };

// ---------- IA y RSS simulados ----------
const MANUAL = [
  'SETUP\nEach player takes 5 coins and 3 cards. The youngest player goes first.',
  'TRADING\nDuring your turn you may trade resources with any other player. You cannot trade on another player\'s turn.',
  'END OF THE GAME\nThe game ends when a player reaches 10 victory points. In case of a tie, the player with more coins wins.',
];
function mockGemini(body) {
  const sys = body.systemInstruction?.parts?.[0]?.text || '';
  const user = body.contents[0].parts.map((p) => p.text || '').join('\n');
  let out;
  if (/Reply with exactly/.test(user)) out = 'troqly';
  else if (/rules referee/.test(sys)) {
    const q = (user.match(/Question: (.*)$/m) || [])[1] || '';
    if (/hallucinat/i.test(q)) out = { found: true, answer: 'Sí, puedes volar.', citations: [{ page: 2, quote: 'Players may fly over the board using dragon tokens at any time' }] };
    else if (/trade|comerciar/i.test(q)) out = { found: true, answer: 'No: solo puedes comerciar durante tu turno.', citations: [{ page: 2, quote: "You cannot trade on another player's turn." }] };
    else if (/tie|empate/i.test(q)) out = { found: true, answer: 'Gana quien tenga más monedas.', citations: [{ page: 1, quote: 'In case of a tie, the player with more coins wins.' }] }; // página equivocada a propósito
    else out = { found: false, answer: '', citations: [] };
    if (/Spanish/.test(sys)) assert.ok(true);
  } else if (/Summarize podcast/.test(sys)) out = (/Spanish/.test(sys) ? 'Reseña de Wingspan y primeras impresiones.' : 'Wingspan review and first impressions.');
  else if (/link board game podcast/.test(sys)) {
    const ids = [...user.matchAll(/^#(\d+) (.*)$/gm)].map((m) => ({ id: Number(m[1]), title: m[2] }));
    const rootId = Number((user.match(/^(\d+)\|Root$/m) || [])[1]);
    out = ids.map((e) => ({ episode: e.id, games: /Root/.test(e.title) ? [rootId] : [] }));
  } else out = 'ok';
  const text = typeof out === 'string' ? out : JSON.stringify(out);
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] };
}
const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Mesa de Prueba</title><language>es</language><description>Podcast de juegos de mesa</description>
<item><title>Reseña de Wingspan</title><guid>ep1</guid><description>Hablamos de Wingspan, el juego de pájaros, y de sus expansiones con calma.</description><enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/><pubDate>Mon, 10 Nov 2026 10:00:00 GMT</pubDate><itunes:duration>45:10</itunes:duration></item>
<item><title>Root: guía de facciones</title><guid>ep2</guid><description>Las facciones de Root explicadas.</description><enclosure url="https://example.com/ep2.mp3" type="audio/mpeg"/><pubDate>Tue, 11 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>Noticias de la semana</title><guid>ep3</guid><description>Novedades del mundillo.</description><enclosure url="https://example.com/ep3.mp3" type="audio/mpeg"/><pubDate>Wed, 12 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
let geminiCalls = 0;
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    if (req.url === '/feed.xml') { res.setHeader('content-type', 'application/rss+xml'); return res.end(FEED); }
    if (req.url.startsWith('/g/models?')) return res.end(JSON.stringify({ models: [
      { name: 'models/gemini-9.0-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9.0-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
    ] }));
    const m = req.url.match(/^\/g\/models\/([^:]+):generateContent/);
    if (m) {
      geminiCalls++;
      assert.equal(m[1], 'gemini-9.0-flash');
      assert.equal(req.headers['x-goog-api-key'], 'test-key');
      return res.end(JSON.stringify(mockGemini(JSON.parse(b))));
    }
    res.statusCode = 404; res.end('{}');
  });
});

// ---------- Cliente HTTP con cookies ----------
function client() {
  let cookie = '';
  const call = async (p, { method = 'GET', body, form } = {}) => {
    const headers = { cookie };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const r = await fetch(base + p, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  };
  call.cookie = () => cookie;
  return call;
}
function sock(cookie) {
  return io(`${base}/live`, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true });
}
const emitAck = (s, ev, msg) => new Promise((r) => s.emit(ev, msg, r));
const waitState = (s, pred, ms = 3000) => new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('timeout esperando estado')), ms);
  const h = (st) => { if (pred(st)) { clearTimeout(to); s.off('state', h); resolve(st); } };
  s.on('state', h);
});
const pdfBuffer = () => new Promise((resolve) => {
  const doc = new PDFDocument();
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  MANUAL.forEach((p, i) => { if (i) doc.addPage(); doc.fontSize(14).text(p); });
  doc.end();
});

(async () => {
  execSync(`psql -h /tmp -p 5433 -U postgres -q -c "DROP DATABASE IF EXISTS troqly_test" -c "CREATE DATABASE troqly_test"`);
  await new Promise((r) => mock.listen(MOCK, r));
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(APP), GEMINI_API_KEY: 'test-key', GEMINI_BASE: `http://localhost:${MOCK}/g` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  srv.stdout.on('data', (d) => (logs += d));
  srv.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 50 && !/escuchando/.test(logs); i++) await new Promise((r) => setTimeout(r, 200));
  try {
    console.log('Cuentas y grupo');
    const ana = client(), bea = client();
    let r = await ana('/api/auth/register', { method: 'POST', body: { email: 'ana@test.com', password: 'secreta123', name: 'Ana', locale: 'es' } });
    assert.equal(r.status, 200);
    r = await ana('/api/auth/register', { method: 'POST', body: { email: 'ana@test.com', password: 'secreta123', name: 'Ana' } });
    assert.equal(r.data.error, 'email_taken'); ok('registro + email duplicado rechazado');
    r = await ana('/api/auth/register', { method: 'POST', body: { email: 'x@test.com', password: '123' } });
    assert.equal(r.data.error, 'short_password'); ok('contraseña corta rechazada');
    await bea('/api/auth/register', { method: 'POST', body: { email: 'bea@test.com', password: 'secreta123', name: 'Bea', locale: 'en' } });
    r = await ana('/api/groups', { method: 'POST', body: { name: 'Los del jueves' } });
    const gid = r.data.id, invite = r.data.invite_code;
    r = await bea(`/api/invite/${invite}`);
    assert.equal(r.data.name, 'Los del jueves');
    await bea(`/api/invite/${invite}/join`, { method: 'POST' });
    r = await bea('/api/me');
    assert.equal(r.data.groups[0].members, 2); ok('grupo creado e invitación por enlace');
    r = await bea(`/api/groups/999/home`);
    assert.equal(r.status, 403); ok('no se ve un grupo ajeno');

    console.log('Colección');
    const games = (await ana('/api/games?q=')).data;
    assert.ok(games.length >= 60, 'semilla');
    const catan = (await ana('/api/games?q=catan')).data[0];
    const wingspan = (await ana('/api/games?q=wingspan')).data[0];
    const pandemic = (await ana('/api/games?q=pandemic')).data.find((g) => g.name === 'Pandemic');
    await ana('/api/collection', { method: 'POST', body: { game_id: catan.id, status: 'owned', price_paid: 40 } });
    await ana('/api/collection', { method: 'POST', body: { game_id: wingspan.id, status: 'unplayed', price_paid: 55 } });
    await bea('/api/collection', { method: 'POST', body: { game_id: pandemic.id, status: 'owned' } });
    r = await ana(`/api/collection?group=${gid}`);
    assert.equal(r.data.length, 3); ok('colección del grupo une la de todos');
    r = await ana('/api/games', { method: 'POST', body: { name: 'Mi Juego Casero', min_players: 2, max_players: 6, mechanics: ['bluffing'] } });
    assert.ok(r.data.id); ok('juego añadido a mano');
    r = await ana(`/api/groups/${gid}/suggest?players=4&minutes=60`);
    assert.ok(r.data.some((g) => g.name === 'Wingspan' && g.unplayed)); ok('¿A qué jugamos? sugiere y marca sin estrenar');

    console.log('Mesa en vivo (anfitrión + 3 móviles)');
    r = await ana('/api/live', { method: 'POST', body: { group_id: gid, game_id: catan.id } });
    const code = r.data.code;
    r = await ana(`/api/live/${code}`);
    assert.ok(r.data.qr.startsWith('data:image/png')); ok(`mesa ${code} con QR`);
    const host = sock(ana.cookie());
    await new Promise((res) => host.on('connect', res));
    let j = await emitAck(host, 'join', { code });
    assert.ok(j.isHost); assert.equal(j.state.players.length, 1);
    const beaS = sock(bea.cookie());
    await new Promise((res) => beaS.on('connect', res));
    j = await emitAck(beaS, 'join', { code });
    const beaId = j.you; assert.ok(beaId);
    const g1 = sock(), g2 = sock();
    await Promise.all([g1, g2].map((s) => new Promise((res) => s.on('connect', res))));
    j = await emitAck(g1, 'join', { code, guestToken: 'guest-token-carlos-123' });
    assert.equal(j.need, 'nickname'); ok('invitado sin apodo → se le pide');
    j = await emitAck(g1, 'join', { code, guestToken: 'guest-token-carlos-123', nickname: 'Carlos', emoji: '🐙' });
    const carlosId = j.you;
    j = await emitAck(g2, 'join', { code, guestToken: 'guest-token-dani-456', nickname: 'Dani' });
    const daniId = j.you;
    j = await emitAck(sock(), 'join', { code, guestToken: 'guest-token-carlos-123' });
    assert.equal(j.you, carlosId); ok('al reconectar, el invitado recupera su sitio');
    const anaId = j.state.players.find((p) => p.name === 'Ana').id;

    // Varios móviles apuntando a la vez
    const seen = waitState(host, (st) => st.players.find((p) => p.id === carlosId).score === 1 && st.players.find((p) => p.id === daniId).score === 8 && st.players.find((p) => p.id === beaId).score === 3);
    g1.emit('score', { playerId: carlosId, delta: 1 });
    g2.emit('score', { playerId: daniId, delta: 5 });
    beaS.emit('score', { playerId: beaId, delta: 3 });
    g2.emit('score', { playerId: daniId, delta: 3 });
    await seen; ok('marcador sincronizado al instante en la pantalla principal');
    g1.emit('score', { playerId: daniId, delta: 100 });
    await new Promise((res) => setTimeout(res, 300));
    r = await ana(`/api/live/${code}`);
    assert.equal(r.data.state.players.find((p) => p.id === daniId).score, 8); ok('un invitado no puede tocar puntos ajenos');
    host.emit('score', { playerId: anaId, set: 4 });
    host.emit('host', { action: 'turn_start' });
    await new Promise((res) => setTimeout(res, 120));
    for (let i = 0; i < 8; i++) { host.emit('host', { action: 'turn_next' }); await new Promise((res) => setTimeout(res, i % 4 === 1 ? 160 : 30)); }
    host.emit('dice', { sides: 6, count: 2 });
    let st = await waitState(g1, (s) => s.dice && s.dice.values.length === 2);
    assert.ok(st.dice.values.every((v) => v >= 1 && v <= 6)); ok('dado compartido');
    g2.emit('first');
    st = await waitState(host, (s) => !!s.firstPick); ok('¿quién empieza? sorteado');
    // Carlos remonta desde el último puesto
    g1.emit('score', { playerId: carlosId, delta: 9 });
    await waitState(host, (s) => s.players.find((p) => p.id === carlosId).score === 10);
    const ended = waitState(g2, (s) => s.status === 'ended');
    const endAck = await emitAck(host, 'end', { kingmakerId: daniId });
    assert.ok(endAck.ok);
    st = await ended;
    assert.equal(st.result.podium[0].name, 'Carlos');
    assert.deepEqual(st.result.podium.slice(0, 3).map((p) => p.rank), [1, 2, 3]); ok('podio con los tres primeros en todos los móviles');
    const keys = st.result.awards.map((a) => a.key).sort();
    assert.ok(keys.includes('sandbagger') && keys.includes('kingmaker') && keys.includes('first_unbox') && keys.includes('ap'), keys.join(',')); ok(`logros: ${keys.join(', ')}`);
    [host, beaS, g1, g2].forEach((s) => s.close());

    console.log('Historial, estadísticas, rivalidades');
    r = await bea(`/api/groups/${gid}/plays`);
    assert.equal(r.data.plays.length, 1);
    assert.equal(r.data.plays[0].players.length, 4); ok('la partida está en el historial de todos');
    const carlos = client();
    await carlos('/api/auth/register', { method: 'POST', body: { email: 'carlos@test.com', password: 'secreta123', name: 'Carlos' } });
    r = await carlos('/api/me/claim', { method: 'POST', body: { tokens: ['guest-token-carlos-123'] } });
    assert.equal(r.data.claimed, 1);
    r = await carlos('/api/stats');
    assert.equal(r.data.total, 1); assert.equal(r.data.wins, 1); ok('el invitado crea cuenta y reclama su victoria');
    // Segunda partida rápida: Ana gana a Bea
    r = await ana('/api/live', { method: 'POST', body: { group_id: gid, game_id: catan.id } });
    const h2 = sock(ana.cookie()), b2 = sock(bea.cookie());
    await Promise.all([h2, b2].map((s) => new Promise((res) => s.on('connect', res))));
    await emitAck(h2, 'join', { code: r.data.code });
    const bj = await emitAck(b2, 'join', { code: r.data.code });
    const anaP = bj.state.players.find((p) => p.name === 'Ana').id;
    h2.emit('score', { playerId: anaP, set: 12 });
    b2.emit('score', { playerId: bj.you, set: 15 });
    await new Promise((res) => setTimeout(res, 200));
    h2.emit('score', { playerId: anaP, set: 20 });
    await new Promise((res) => setTimeout(res, 200));
    await emitAck(h2, 'end', {});
    [h2, b2].forEach((s) => s.close());
    r = await ana(`/api/stats?group=${gid}`);
    const s = r.data;
    assert.equal(s.total, 2); assert.equal(s.wins, 1);
    assert.equal(s.h_index, 1);
    assert.ok(s.by_mechanic.some((m) => m.key === 'trading'));
    assert.ok(Object.keys(s.heatmap).length >= 1);
    assert.equal(s.cost_per_play.find((c) => c.name === 'Catan').per_play, 20); ok('estadísticas: % victorias, H-index, mecánicas, heatmap, coste por partida (40 €/2 = 20 €)');
    r = await ana(`/api/groups/${gid}/ranking`);
    const vsBea = r.data.rivalries.find((v) => v.name === 'Bea');
    assert.equal(vsBea.me, 2); assert.equal(vsBea.them, 0);
    assert.equal(vsBea.top_game.name, 'Catan'); ok('rivalidades: Ana le gana 2–0 a Bea en Catan');
    r = await ana(`/api/groups/${gid}/home`);
    assert.ok(r.data.last); ok('inicio del grupo con última partida');

    console.log('Asistente de reglas');
    const fd = new FormData();
    fd.append('group_id', gid); fd.append('game_id', catan.id);
    fd.append('files', new Blob([await pdfBuffer()], { type: 'application/pdf' }), 'catan-rules.pdf');
    r = await ana('/api/rulebooks', { method: 'POST', form: fd });
    const rb = r.data.id;
    for (let i = 0; i < 30; i++) { r = await ana(`/api/rulebooks/${rb}`); if (r.data.rulebook.status !== 'processing') break; await new Promise((res) => setTimeout(res, 200)); }
    assert.equal(r.data.rulebook.status, 'ready'); assert.equal(r.data.rulebook.pages, 3); assert.equal(r.data.rulebook.language, 'en'); ok('PDF leído: 3 páginas, idioma detectado (en)');
    r = await ana(`/api/rulebooks/${rb}/ask`, { method: 'POST', body: { question: '¿Puedo comerciar en el turno de otro?', locale: 'es' } });
    assert.equal(r.data.found, true); assert.equal(r.data.citations[0].page, 2); ok('respuesta en español citando la página 2 del manual en inglés');
    r = await ana(`/api/rulebooks/${rb}/ask`, { method: 'POST', body: { question: '¿Y si hay empate?', locale: 'es' } });
    assert.equal(r.data.found, true); assert.equal(r.data.citations[0].page, 3); ok('cita con página equivocada → el servidor la corrige (pág. 3)');
    r = await ana(`/api/rulebooks/${rb}/ask`, { method: 'POST', body: { question: 'hallucinate: can I fly?', locale: 'es' } });
    assert.equal(r.data.found, false); assert.equal(r.data.answer, null); assert.equal(r.data.rejected, 1); ok('regla inventada → cita rechazada → "no aparece en el manual"');
    r = await ana(`/api/rulebooks/${rb}/ask`, { method: 'POST', body: { question: '¿Cuántos dragones hay?', locale: 'es' } });
    assert.equal(r.data.found, false); ok('pregunta sin respuesta → "no aparece en el manual"');
    r = await bea(`/api/rule-questions/${r.data.id}/flag`, { method: 'POST', body: { flagged: true } });
    assert.equal(r.status, 200);
    r = await bea(`/api/rulebooks/${rb}`);
    assert.ok(r.data.questions.some((q) => q.flagged)); ok('marcar respuesta como incorrecta');
    r = await ana(`/api/rulebooks/${rb}/pages/2`);
    assert.match(r.data.text, /trade/); ok('ver el texto original de la página citada');

    console.log('Podcasts');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: DB });
    const pod = (await pool.query("INSERT INTO podcasts(feed_url,title,language) VALUES ($1,'Mesa de Prueba','es') RETURNING id", [`http://localhost:${MOCK}/feed.xml`])).rows[0].id;
    await pool.query("INSERT INTO app_meta(key,value,updated_at) VALUES ('pod_dir','1',now())");
    r = await ana('/api/podcasts?lang=es');
    assert.ok(r.data.podcasts.some((p) => p.id === pod)); ok('directorio filtrado por idioma');
    r = await ana(`/api/podcasts/${pod}`);
    assert.equal(r.data.episodes.length, 3); ok('episodios leídos del RSS (audio desde la URL original)');
    await ana(`/api/podcasts/${pod}/follow`, { method: 'POST', body: { follow: true } });
    for (let i = 0; i < 20; i++) { const c = await pool.query('SELECT count(*)::int n FROM episodes WHERE NOT tagged'); if (!c.rows[0].n) break; await new Promise((res) => setTimeout(res, 200)); }
    const wEps = (await ana(`/api/games/${wingspan.id}/episodes`)).data;
    assert.equal(wEps.length, 1); assert.match(wEps[0].title, /Wingspan/); ok('"Escuchar sobre este juego": Wingspan ↔ episodio (por nombre)');
    const root = (await ana('/api/games?q=root')).data.find((g) => g.name === 'Root');
    const rEps = (await ana(`/api/games/${root.id}/episodes`)).data;
    assert.equal(rEps.length, 1); assert.equal(rEps[0].method, 'ai'); ok('Root (nombre ambiguo) enlazado solo con confirmación de la IA');
    const ep = wEps[0].id;
    r = await ana(`/api/episodes/${ep}/summary`, { method: 'POST', body: { locale: 'es' } });
    assert.match(r.data.summary, /Reseña/);
    r = await bea(`/api/episodes/${ep}/summary`, { method: 'POST', body: { locale: 'en' } });
    assert.match(r.data.summary, /review/); ok('resumen IA en el idioma de cada usuario (es / en)');
    await ana(`/api/episodes/${ep}/progress`, { method: 'POST', body: { position: 600 } });
    await ana(`/api/queue/${ep}`, { method: 'POST', body: { add: true } });
    r = await ana('/api/library');
    assert.equal(r.data.inProgress[0].position_s, 600); assert.equal(r.data.queue.length, 1); ok('seguir donde lo dejé + escuchar más tarde');
    r = await bea(`/api/podcast-recs?group=${gid}`);
    assert.ok(r.data.some((e) => e.id === ep)); ok('recomendaciones según la colección del grupo');
    await ana(`/api/groups/${gid}/shares`, { method: 'POST', body: { episode_id: ep, message: 'Escuchad esta reseña antes de comprarlo' } });
    r = await bea(`/api/groups/${gid}/home`);
    assert.equal(r.data.shares[0].message, 'Escuchad esta reseña antes de comprarlo'); ok('episodio compartido con el grupo');
    await pool.end();

    console.log('Servidor');
    r = await fetch(`${base}/api/health/ai`).then((x) => x.json());
    assert.equal(r.ok, true); assert.equal(r.model, 'gemini-9.0-flash'); ok('salud IA: elige solo un modelo Flash válido');
    const html = await fetch(`${base}/m/ABCDE`).then((x) => x.text());
    assert.match(html, /TROQLY/); ok('rutas de la app servidas (PWA)');
    const sw = await fetch(`${base}/sw.js`); assert.equal(sw.status, 200);
    const mf = await fetch(`${base}/manifest.webmanifest`).then((x) => x.json()); assert.equal(mf.display, 'standalone'); ok('manifest + service worker');
    const font = await fetch(`${base}/fonts/inter/inter-latin-wght-normal.woff2`); assert.equal(font.status, 200); ok('tipografías propias');
    console.log(`\n${pass} comprobaciones OK · ${geminiCalls} llamadas a la IA simulada`);
  } catch (e) {
    console.error('\n✗ FALLO:', e.message, '\n', e.stack.split('\n').slice(1, 4).join('\n'));
    console.error('--- logs del servidor ---\n' + logs.slice(-2500));
    process.exitCode = 1;
  } finally {
    srv.kill();
    mock.close();
    setTimeout(() => process.exit(), 300);
  }
})();
