// advisor. — server
// Serves the web app, the course data, and /api/chat (Claude Messages API, streamed).
// No npm packages needed. Node 18.17+.
//
//   cp .env.example .env      # add your ANTHROPIC_API_KEY
//   node server.js            # then open http://localhost:3000

import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './public/js/core/catalog.js';
import { courseDataBlock, readClientContext, studentContextBlock } from './lib/context.js';
import { offlineAnswer } from './lib/offline.js';
import { streamClaude } from './lib/claude.js';
import { readTranscriptWithClaude } from './lib/transcript-ai.js';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------- config ----------
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv(join(ROOT, '.env'));

const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  apiKey: (process.env.ANTHROPIC_API_KEY || '').trim(),
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  maxTokens: Math.min(Math.max(Number(process.env.MAX_TOKENS) || 1024, 128), 8192),
  instructionsFile: process.env.ADVISOR_INSTRUCTIONS || join(ROOT, 'advisor_instructions.txt'),
  rateLimit: Number(process.env.CHAT_RATE_LIMIT) || 30, // chat requests per IP per 5 minutes
};

// ---------- data ----------
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const catalog = readJson(join(ROOT, 'data', 'catalog.json'));
const sections = readJson(join(ROOT, 'data', 'sections.json'));
const forecast = existsSync(join(ROOT, 'data', 'forecast.json')) ? readJson(join(ROOT, 'data', 'forecast.json')) : null;
const { programs } = existsSync(join(ROOT, 'data', 'programs.json')) ? readJson(join(ROOT, 'data', 'programs.json')) : { programs: [] };
const index = buildIndex(catalog, sections, forecast);
const COURSE_DATA = courseDataBlock(index, programs);

let instructionsCache = { mtime: 0, text: '' };
function instructions() {
  // re-read when the file changes, so edits apply without a restart
  const { mtimeMs } = statSync(config.instructionsFile);
  if (mtimeMs !== instructionsCache.mtime) {
    instructionsCache = { mtime: mtimeMs, text: readFileSync(config.instructionsFile, 'utf8').trim() };
  }
  return instructionsCache.text;
}
instructions(); // fail fast if the file is missing

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(res, file, req) {
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const { size } = statSync(file);
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

/** Resolve a URL path inside a folder. Returns null for anything outside it. */
function safePath(base, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = resolve(base, `.${decoded}`);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        fail(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > config.rateLimit;
}

/** Keep only valid turns, merge repeats, start with the user and end with the user. */
export function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-30)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, 4000);
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

// ---------- chat ----------
async function handleChat(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return sendJson(res, 429, { error: 'Too many questions in a short time. Wait a few minutes and try again.' });

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.status === 413 ? err.message : 'Send JSON: { "messages": [...] }.' });
  }
  const messages = cleanMessages(body?.messages);
  if (!messages.length) return sendJson(res, 400, { error: 'Ask a question first.' });
  const ctx = readClientContext(body?.context, index);
  const question = messages[messages.length - 1].content;

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  if (!config.apiKey) {
    send({ type: 'meta', mode: 'offline' });
    send({ type: 'text', text: offlineAnswer(index, question, ctx, programs) });
    send({ type: 'done' });
    return res.end();
  }

  send({ type: 'meta', mode: 'claude', model: config.model });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  res.on('close', () => controller.abort());

  try {
    const result = await streamClaude({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      maxTokens: config.maxTokens,
      system: [
        { type: 'text', text: instructions() },
        { type: 'text', text: COURSE_DATA, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: studentContextBlock(index, question, ctx, programs) },
      ],
      messages,
      signal: controller.signal,
      onText: (text) => send({ type: 'text', text }),
    });
    if (result.stopReason === 'max_tokens') send({ type: 'text', text: '\n\n_(Answer cut short. Ask me to continue.)_' });
    send({ type: 'done' });
  } catch (err) {
    if (res.destroyed) return; // the student closed the page
    let message;
    if (err.name === 'AbortError') message = 'The answer took too long. Try again.';
    else if (err.safe) message = err.message;
    else {
      console.error('[chat]', err);
      message = 'Could not reach the Claude API. Check your internet connection and try again.';
    }
    send({ type: 'error', message });
  } finally {
    clearTimeout(timer);
    res.end();
  }
}

// ---------- transcript reading with Claude (only when the student asks) ----------
async function handleTranscript(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return sendJson(res, 429, { error: 'Too many requests in a short time. Wait a few minutes and try again.' });
  if (!config.apiKey) {
    return sendJson(res, 503, { error: 'Reading transcripts with Claude needs ANTHROPIC_API_KEY on the server. You can still upload a text-based PDF, an .html or .txt file, or paste the text.' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req, 12 * 1024 * 1024));
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.status === 413 ? 'The file is too large (limit about 8 MB).' : 'Send JSON: { "file": {...} } or { "text": "..." }.' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  res.on('close', () => controller.abort());
  try {
    const out = await readTranscriptWithClaude(
      { text: body?.text, file: body?.file && { mediaType: String(body.file.mediaType || ''), data: body.file.data } },
      { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, signal: controller.signal },
    );
    return sendJson(res, 200, out);
  } catch (err) {
    if (res.destroyed) return undefined;
    if (err.name === 'AbortError') return sendJson(res, 504, { error: 'Reading the transcript took too long. Try again.' });
    if (err.safe) return sendJson(res, err.status || 502, { error: err.message });
    console.error('[transcript]', err);
    return sendJson(res, 502, { error: 'Could not reach the Claude API. Try again.' });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- routes ----------
const PUBLIC = join(ROOT, 'public');
const DATA = join(ROOT, 'data');

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (path === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        mode: config.apiKey ? 'claude' : 'offline',
        model: config.apiKey ? config.model : null,
        semester: index.semester,
        sampleSections: index.sample,
        courses: index.courses.size,
        sections: index.crnMap.size,
        forecastTerms: forecast ? forecast.terms.map((t) => t.label) : [],
        programs: programs.map((p) => p.id),
      });
    }
    if (path === '/api/transcript') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
      return await handleTranscript(req, res);
    }
    if (path === '/api/chat') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
      return await handleChat(req, res);
    }
    if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });

    if (['/data/catalog.json', '/data/sections.json', '/data/forecast.json', '/data/programs.json'].includes(path)) {
      return serveFile(res, join(DATA, path.slice('/data/'.length)), req);
    }
    const file = safePath(PUBLIC, path === '/' ? '/index.html' : path);
    if (file && existsSync(file) && statSync(file).isFile()) return serveFile(res, file, req);
    return sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error.' });
    else res.end();
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(config.port, config.host, () => {
    const where = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
    console.log(`advisor. running at ${where}`);
    console.log(config.apiKey
      ? `Chat: Claude (${config.model})`
      : 'Chat: offline mode (set ANTHROPIC_API_KEY in .env to use Claude)');
    console.log(`Data: ${index.courses.size} courses, ${index.crnMap.size} ${index.sample ? 'SAMPLE ' : ''}sections for ${index.semester}`);
  });
}
