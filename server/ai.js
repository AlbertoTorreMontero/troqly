// Cliente mínimo de la API de Gemini. Solo se usa en el servidor; la clave sale de GEMINI_API_KEY.
const { q, one } = require('./db');

const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
let resolvedModel = null;
let candidates = [];

const LIMITS = {
  rules: Number(process.env.AI_DAILY_RULES || 300),
  summary: Number(process.env.AI_DAILY_SUMMARY || 300),
  tagging: Number(process.env.AI_DAILY_TAGGING || 60),
  ocr: Number(process.env.AI_DAILY_OCR || 80),
};

class AiError extends Error {
  constructor(code, msg) {
    super(msg || code);
    this.code = code;
  }
}

function enabled() {
  return !!process.env.GEMINI_API_KEY;
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY, ...(init.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const code = res.status === 503 || /high demand|overloaded|unavailable/i.test(data?.error?.message || '') ? 'busy' : res.status === 429 ? 'quota' : res.status === 404 ? 'model_not_found' : res.status === 400 || res.status === 403 ? 'bad_key_or_request' : 'ai_error';
    const err = new AiError(code, data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function pickModel() {
  const data = await call('models?pageSize=200');
  const ok = (data.models || []).filter((m) =>
    (m.supportedGenerationMethods || []).includes('generateContent') &&
    /flash/i.test(m.name) && !/image|tts|audio|live|embedding|thinking-exp|preview-.*-tts/i.test(m.name)
  );
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  ok.sort((a, b) => (/lite/.test(a.name) - /lite/.test(b.name)) || (/preview|exp/.test(a.name) - /preview|exp/.test(b.name)) || ver(b.name) - ver(a.name));
  if (!ok.length) throw new AiError('model_not_found', 'No hay modelos Flash disponibles para esta clave');
  candidates = ok.map((m) => m.name.replace(/^models\//, ''));
  return candidates[0];
}

async function model() {
  if (resolvedModel) return resolvedModel;
  resolvedModel = process.env.GEMINI_MODEL || (await pickModel());
  return resolvedModel;
}

async function bump(scope) {
  const row = await one(
    `INSERT INTO ai_usage(day,scope,count) VALUES (current_date,$1,1)
     ON CONFLICT (day,scope) DO UPDATE SET count = ai_usage.count + 1 RETURNING count`,
    [scope]
  );
  if (LIMITS[scope] && row.count > LIMITS[scope]) throw new AiError('daily_limit');
}

/**
 * Genera contenido. parts: [{text}] o [{inline_data:{mime_type,data}}]
 * schema: si se pasa, devuelve JSON parseado.
 */
async function generate({ parts, system, schema, temperature = 0.2, scope = 'misc', maxTokens = 2048 }) {
  if (!enabled()) throw new AiError('ai_disabled');
  await bump(scope);
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens: Math.max(2048, maxTokens * 4) }, // los modelos que razonan gastan tokens pensando
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }
  const first = await model();
  if (!candidates.length) { try { await pickModel(); } catch { /* sin lista */ } }
  const order = [first, ...candidates.filter((c) => c !== first)].slice(0, 4);
  let data, lastErr;
  for (const m of order) {
    try {
      data = await call(`models/${m}:generateContent`, { method: 'POST', body: JSON.stringify(body) });
      if (m !== resolvedModel) resolvedModel = m; // nos quedamos con el que responde
      break;
    } catch (e) {
      lastErr = e;
      if (!['busy', 'model_not_found', 'quota'].includes(e.code)) throw e;
    }
  }
  if (!data) throw lastErr;
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new AiError('empty', data.candidates?.[0]?.finishReason || 'sin respuesta');
  if (!schema) return text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const m2 = text.match(/[\[{][\s\S]*[\]}]/);
    if (m2) return JSON.parse(m2[0]);
    throw new AiError('bad_json');
  }
}

const LANG_NAMES = { es: 'Spanish', en: 'English', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ca: 'Catalan', nl: 'Dutch', pl: 'Polish' };
const langName = (l) => LANG_NAMES[(l || 'en').slice(0, 2)] || 'English';

let lastHealth = null;
async function health() {
  if (lastHealth && Date.now() - lastHealth.at < (lastHealth.ok ? 10 * 60 * 1000 : 20 * 1000)) return lastHealth;
  if (!enabled()) return (lastHealth = { ok: false, error: 'ai_disabled', at: Date.now() });
  try {
    const out = await generate({
      parts: [{ text: 'Reply with exactly the word: troqly' }],
      scope: 'health',
      temperature: 0,
      maxTokens: 256,
    });
    lastHealth = { ok: /troqly/i.test(out), model: await model(), sample: out.slice(0, 40), at: Date.now() };
  } catch (e) {
    lastHealth = { ok: false, error: e.code || 'ai_error', detail: String(e.message).slice(0, 160), at: Date.now() };
  }
  return lastHealth;
}

module.exports = { generate, enabled, AiError, langName, health, model };
