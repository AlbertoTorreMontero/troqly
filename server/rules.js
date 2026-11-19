// Asistente de reglas: responde SOLO con el manual subido y verifica cada cita en el servidor.
const express = require('express');
const multer = require('multer');
const { q, one, many } = require('./db');
const A = require('./auth');
const AI = require('./ai');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 40 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

let pdfjs;
async function loadPdfjs() {
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

async function pdfPages(buf) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let text = '';
    for (const it of tc.items) text += it.str + (it.hasEOL ? '\n' : ' ');
    pages.push({ page: i, text: text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim() });
  }
  await doc.destroy();
  return pages;
}

const OCR_SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { page: { type: 'INTEGER' }, text: { type: 'STRING' } }, required: ['page', 'text'] },
};
const OCR_SYSTEM = 'You transcribe board game rulebook pages. Copy the text exactly as printed, in its original language. Do not translate, summarize or add anything. Keep headings and list items on their own lines.';

async function ocrPdf(buf) {
  const out = await AI.generate({
    scope: 'ocr', system: OCR_SYSTEM, schema: OCR_SCHEMA, temperature: 0, maxTokens: 60000,
    parts: [
      { inline_data: { mime_type: 'application/pdf', data: buf.toString('base64') } },
      { text: 'Transcribe every page. Return one item per page with its page number (1-based, as in the PDF).' },
    ],
  });
  return out.filter((p) => p.text).map((p) => ({ page: p.page, text: p.text.trim() }));
}

async function ocrImages(files, startPage) {
  const pages = [];
  for (let i = 0; i < files.length; i += 4) {
    const batch = files.slice(i, i + 4);
    const parts = [];
    batch.forEach((f, j) => {
      parts.push({ text: `Image for page ${startPage + i + j}:` });
      parts.push({ inline_data: { mime_type: f.mimetype, data: f.buffer.toString('base64') } });
    });
    parts.push({ text: 'Transcribe each image. Use the page number given before each image.' });
    const out = await AI.generate({ scope: 'ocr', system: OCR_SYSTEM, schema: OCR_SCHEMA, temperature: 0, maxTokens: 30000, parts });
    pages.push(...out.filter((p) => p.text).map((p) => ({ page: p.page, text: p.text.trim() })));
  }
  return pages;
}

const STOP = {
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'jugador', 'carta', 'turno'],
  en: ['the', 'and', 'of', 'to', 'a', 'in', 'is', 'you', 'that', 'for', 'player', 'card', 'turn', 'your'],
  fr: ['le', 'la', 'les', 'de', 'et', 'des', 'un', 'une', 'joueur', 'vous', 'est', 'carte', 'tour'],
  de: ['der', 'die', 'das', 'und', 'ein', 'eine', 'spieler', 'sie', 'ist', 'karte', 'zug', 'nicht'],
  it: ['il', 'la', 'di', 'e', 'che', 'un', 'una', 'giocatore', 'carta', 'turno', 'per', 'del'],
  pt: ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'um', 'uma', 'jogador', 'carta', 'turno', 'para', 'você'],
};
function detectLang(text) {
  const words = text.toLowerCase().match(/\p{L}+/gu) || [];
  const sample = words.slice(0, 4000);
  let best = 'en', bestN = -1;
  for (const [l, list] of Object.entries(STOP)) {
    const set = new Set(list);
    const n = sample.filter((w) => set.has(w)).length;
    if (n > bestN) { best = l; bestN = n; }
  }
  return best;
}

async function processUpload(rulebookId, files) {
  try {
    let pages = [];
    const pdfs = files.filter((f) => f.mimetype === 'application/pdf');
    const imgs = files.filter((f) => /^image\//.test(f.mimetype));
    for (const f of pdfs) {
      let p = await pdfPages(f.buffer);
      const avg = p.reduce((s, x) => s + x.text.length, 0) / Math.max(1, p.length);
      if (avg < 20) { // PDF escaneado: sin capa de texto
        try { p = await ocrPdf(f.buffer); } catch (e) { if (!p.some((x) => x.text.length > 3)) throw e; }
      }
      const offset = pages.length;
      pages.push(...p.map((x) => ({ page: x.page + offset, text: x.text })));
    }
    if (imgs.length) pages.push(...(await ocrImages(imgs, pages.length + 1)));
    pages = pages.filter((p) => p.text && p.text.length > 3);
    if (!pages.length) throw new Error('no_text');
    for (const p of pages) {
      await q('INSERT INTO rule_pages(rulebook_id,page,text) VALUES ($1,$2,$3) ON CONFLICT (rulebook_id,page) DO UPDATE SET text = EXCLUDED.text',
        [rulebookId, p.page, p.text.slice(0, 20000)]);
    }
    const lang = detectLang(pages.map((p) => p.text).join(' '));
    await q("UPDATE rulebooks SET status='ready', pages=$2, language=$3 WHERE id=$1", [rulebookId, pages.length, lang]);
  } catch (e) {
    console.error('[rules upload]', e.code || '', e.message);
    await q("UPDATE rulebooks SET status=$2 WHERE id=$1", [rulebookId, e.code === 'ai_disabled' ? 'error_ai' : e.code === 'quota' || e.code === 'daily_limit' ? 'error_quota' : 'error']);
  }
}

// ---- Verificación de citas ----
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[“”«»"'’‘`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function quoteInPage(quote, pageText) {
  const nq = norm(quote), np = norm(pageText);
  if (nq.length < 8) return false;
  if (np.includes(nq)) return true;
  const w = nq.split(' ');
  if (w.length < 6) return false;
  const shingles = [];
  for (let i = 0; i + 4 <= w.length; i++) shingles.push(w.slice(i, i + 4).join(' '));
  const hit = shingles.filter((s) => np.includes(s)).length;
  return hit / shingles.length >= 0.8;
}

const ANSWER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN' },
    answer: { type: 'STRING' },
    citations: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { page: { type: 'INTEGER' }, quote: { type: 'STRING' } }, required: ['page', 'quote'] },
    },
  },
  required: ['found', 'answer', 'citations'],
};

async function ask(rulebook, question, locale, history = []) {
  const all = await many('SELECT page, text FROM rule_pages WHERE rulebook_id=$1 ORDER BY page', [rulebook.id]);
  let pages = all;
  const total = all.reduce((s, p) => s + p.text.length, 0);
  if (total > 250000) {
    const terms = (question.toLowerCase().match(/\p{L}{3,}/gu) || []).slice(0, 12);
    const top = terms.length ? await many(
      `SELECT page FROM rule_pages WHERE rulebook_id=$1 AND tsv @@ to_tsquery('simple', $2)
        ORDER BY ts_rank(tsv, to_tsquery('simple', $2)) DESC LIMIT 40`, [rulebook.id, terms.join(' | ')]) : [];
    const keep = new Set([...top.map((t) => t.page), ...all.slice(0, 6).map((p) => p.page)]);
    pages = all.filter((p) => keep.has(p.page));
    let size = 0;
    pages = pages.filter((p) => (size += p.text.length) < 240000);
  }
  const manual = pages.map((p) => `<page n="${p.page}">\n${p.text}\n</page>`).join('\n');
  const lang = AI.langName(locale);
  const system = [
    'You are a strict board game rules referee. You may ONLY use the rulebook text provided inside <manual>.',
    'Never use outside knowledge, other editions, forums or common sense to fill gaps. Never guess.',
    'If the manual does not clearly answer the question, return found=false, an empty answer and no citations.',
    `Write "answer" in ${lang}, short and clear (max 5 sentences), friendly tone.`,
    'Each citation must have the page number and a "quote" copied EXACTLY, character by character, from that page in its original language (8 to 40 words). Do not translate quotes.',
    'Give 1 to 3 citations. Every claim in the answer must be supported by a citation.',
  ].join('\n');
  const ctx = history.slice(-3).map((h) => `Previous question: ${String(h.q).slice(0, 300)}`).join('\n');
  const out = await AI.generate({
    scope: 'rules', system, schema: ANSWER_SCHEMA, temperature: 0.1, maxTokens: 1500,
    parts: [{ text: `<manual title="${(rulebook.title || '').replace(/"/g, '')}">\n${manual}\n</manual>\n${ctx}\nQuestion: ${question}` }],
  });
  const byPage = Object.fromEntries(all.map((p) => [p.page, p.text]));
  const verified = [];
  for (const c of out.citations || []) {
    let page = c.page;
    if (!byPage[page] || !quoteInPage(c.quote, byPage[page])) {
      // a veces el modelo se equivoca de página: buscamos la cita en todo el manual
      const alt = all.find((p) => quoteInPage(c.quote, p.text));
      if (!alt) continue;
      page = alt.page;
    }
    verified.push({ page, quote: String(c.quote).slice(0, 400) });
  }
  const found = !!out.found && verified.length > 0 && !!String(out.answer || '').trim();
  return {
    found,
    answer: found ? String(out.answer).trim() : null,
    citations: found ? verified : [],
    rejected: (out.citations || []).length - verified.length,
  };
}

function router() {
  const r = express.Router();

  r.post('/rulebooks', A.requireUser, upload.array('files', 40), wrap(async (req, res) => {
    const groupId = Number(req.body.group_id), gameId = Number(req.body.game_id);
    if (!(await A.isMember(groupId, req.user.id))) return res.status(403).json({ error: 'not_member' });
    const files = (req.files || []).filter((f) => f.mimetype === 'application/pdf' || /^image\/(jpeg|png|webp|heic|heif)$/.test(f.mimetype));
    if (!files.length) return res.status(400).json({ error: 'no_files' });
    const needsAi = files.some((f) => f.mimetype !== 'application/pdf');
    if (needsAi && !AI.enabled()) return res.status(503).json({ error: 'ai_disabled' });
    const title = String(req.body.title || '').slice(0, 80) || files[0].originalname.replace(/\.[a-z]+$/i, '');
    const rb = await one("INSERT INTO rulebooks(game_id,group_id,title,status,uploaded_by) VALUES ($1,$2,$3,'processing',$4) RETURNING id",
      [gameId, groupId, title, req.user.id]);
    processUpload(rb.id, files); // en segundo plano
    res.json({ id: rb.id, status: 'processing' });
  }));

  async function rulebookFor(req, res) {
    const rb = await one('SELECT * FROM rulebooks WHERE id=$1', [Number(req.params.id)]);
    if (!rb) { res.status(404).json({ error: 'not_found' }); return null; }
    if (!(await A.isMember(rb.group_id, req.user.id))) { res.status(403).json({ error: 'not_member' }); return null; }
    return rb;
  }

  r.get('/rulebooks', A.requireUser, wrap(async (req, res) => {
    const groupId = Number(req.query.group);
    if (!(await A.isMember(groupId, req.user.id))) return res.status(403).json({ error: 'not_member' });
    res.json(await many(
      `SELECT r.id, r.title, r.language, r.pages, r.status, r.created_at, g.name AS game, g.id AS game_id
         FROM rulebooks r JOIN games g ON g.id = r.game_id WHERE r.group_id=$1 ORDER BY r.created_at DESC`, [groupId]));
  }));

  r.get('/rulebooks/:id', A.requireUser, wrap(async (req, res) => {
    const rb = await rulebookFor(req, res);
    if (!rb) return;
    const game = await one('SELECT id, name FROM games WHERE id=$1', [rb.game_id]);
    const questions = await many(
      `SELECT rq.id, rq.question, rq.answer, rq.citations, rq.found, rq.flagged, rq.created_at, u.display_name AS by
         FROM rule_questions rq LEFT JOIN users u ON u.id = rq.user_id WHERE rulebook_id=$1 ORDER BY rq.created_at DESC LIMIT 50`, [rb.id]);
    res.json({ rulebook: rb, game, questions });
  }));

  r.delete('/rulebooks/:id', A.requireUser, wrap(async (req, res) => {
    const rb = await rulebookFor(req, res);
    if (!rb) return;
    await q('DELETE FROM rulebooks WHERE id=$1', [rb.id]);
    res.json({ ok: true });
  }));

  r.get('/rulebooks/:id/pages/:page', A.requireUser, wrap(async (req, res) => {
    const rb = await rulebookFor(req, res);
    if (!rb) return;
    const p = await one('SELECT page, text FROM rule_pages WHERE rulebook_id=$1 AND page=$2', [rb.id, Number(req.params.page)]);
    if (!p) return res.status(404).json({ error: 'not_found' });
    res.json(p);
  }));

  r.post('/rulebooks/:id/ask', A.requireUser, wrap(async (req, res) => {
    const rb = await rulebookFor(req, res);
    if (!rb) return;
    if (rb.status !== 'ready') return res.status(409).json({ error: 'not_ready' });
    const question = String(req.body?.question || '').trim().slice(0, 500);
    if (question.length < 3) return res.status(400).json({ error: 'empty' });
    const locale = (req.body?.locale || req.user.locale || 'es').slice(0, 2);
    try {
      const out = await ask(rb, question, locale, Array.isArray(req.body?.history) ? req.body.history : []);
      const row = await one(
        'INSERT INTO rule_questions(rulebook_id,user_id,question,answer,citations,found,locale) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [rb.id, req.user.id, question, out.answer, JSON.stringify(out.citations), out.found, locale]);
      res.json({ id: row.id, ...out });
    } catch (e) {
      const code = e.code || 'ai_error';
      console.error('[rules ask]', code, e.message);
      res.status(code === 'quota' || code === 'daily_limit' ? 429 : 503).json({ error: code });
    }
  }));

  r.post('/rule-questions/:id/flag', A.requireUser, wrap(async (req, res) => {
    const rq = await one('SELECT rq.id, r.group_id FROM rule_questions rq JOIN rulebooks r ON r.id = rq.rulebook_id WHERE rq.id=$1', [req.params.id]);
    if (!rq || !(await A.isMember(rq.group_id, req.user.id))) return res.status(404).json({ error: 'not_found' });
    await q('UPDATE rule_questions SET flagged = $2 WHERE id=$1', [rq.id, req.body?.flagged !== false]);
    res.json({ ok: true });
  }));

  return r;
}

module.exports = { router, quoteInPage, pdfPages, detectLang };
