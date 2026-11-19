// IA y RSS simulados para probar la interfaz sin salir a internet.
const http = require('http');
const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Mesa de Prueba</title><language>es</language><description>Podcast de juegos de mesa</description>
<item><title>Reseña de Catan 30 años después</title><guid>ep1</guid><description>Repasamos Catan, sus expansiones y por qué sigue en tantas mesas.</description><enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/><pubDate>Mon, 10 Nov 2026 10:00:00 GMT</pubDate><itunes:duration>45:10</itunes:duration></item>
</channel></rss>`;
http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    if (req.url === '/feed.xml') return res.end(FEED);
    if (req.url.startsWith('/g/models?')) return res.end(JSON.stringify({ models: [{ name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] }] }));
    const body = b ? JSON.parse(b) : {};
    const sys = body.systemInstruction?.parts?.[0]?.text || '';
    const user = (body.contents?.[0]?.parts || []).map((p) => p.text || '').join('\n');
    let out = 'ok';
    if (/rules referee/.test(sys)) {
      const es = /Spanish/.test(sys);
      out = /trade|comerciar/i.test((user.match(/Question: (.*)$/m) || [])[1] || '')
        ? { found: true, answer: es ? 'No. Solo puedes comerciar durante tu propio turno.' : 'No. You can only trade during your own turn.', citations: [{ page: 2, quote: "You cannot trade on another player's turn." }] }
        : { found: false, answer: '', citations: [] };
    } else if (/Summarize/.test(sys)) out = /Spanish/.test(sys) ? 'Repaso a Catan tres décadas después: expansiones y por qué sigue vigente.' : 'A look back at Catan three decades on: expansions and why it still holds up.';
    else if (/link board game/.test(sys)) out = [];
    else if (/Reply with exactly/.test(user)) out = 'troqly';
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof out === 'string' ? out : JSON.stringify(out) }] } }] }));
  });
}).listen(3301);
