// Server tests. A fake Claude API runs on a local port so no key or network is needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let upstream;
let lastRequest = null;
let upstreamMode = 'ok';
let base;
let server;

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

before(async () => {
  upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastRequest = { headers: req.headers, body: JSON.parse(body), url: req.url };
      if (!lastRequest.body.stream && JSON.stringify(lastRequest.body.system).includes('PLAN TASK')) {
        // recommended plan: one course is in a term the forecast skips, one breaks a prerequisite
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({
          summary: 'Finish in Spring 2028.',
          graduation: 'Spring 2028',
          terms: [
            { term: 'Spring 2027', courses: [{ code: 'CS 450', credits: 3, requirement: 'Computer Science Requirements', reason: 'Required.' }, { code: 'CS 485', credits: 3, requirement: 'Computer Science Requirements', reason: 'Required.' }] },
            { term: 'Fall 2027', courses: [{ code: 'CS 481', credits: 3, requirement: 'Computer Science Electives', reason: 'AI.' }, { code: null, label: 'IPRO', credits: 3, requirement: 'Interprofessional Projects (IPRO)', reason: 'Second IPRO.' }] },
            { term: 'Summer 2027', courses: [{ code: 'CS 487', credits: 3 }] },
          ],
          tips: ['Start early.'],
          assumptions: [],
        }) }], stop_reason: 'end_turn' }));
      }
      if (!lastRequest.body.stream) {
        // transcript reading (not streamed)
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({
          type: 'message', role: 'assistant', stop_reason: 'end_turn',
          content: [{ type: 'text', text: '```json\n{"courses":[{"code":"cs 331","title":"Data Structures and Algorithms","credits":3,"grade":"A","term":"Fall 2025","status":"completed"},{"code":"bad"}],"warnings":["Row 7 was blurry"]}\n```' }],
        }));
      }
      if (upstreamMode === 'unauthorized') {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
      }
      if (upstreamMode === 'overloaded') {
        return sse(res, [['message_start', { type: 'message_start', message: { usage: {} } }], ['error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]]);
      }
      return sse(res, [
        ['message_start', { type: 'message_start', message: { usage: { input_tokens: 10 } } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['ping', { type: 'ping' }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'You need ' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'CS 331.' } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }],
        ['message_stop', { type: 'message_stop' }],
      ]);
    });
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
  process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
  process.env.SECTIONS_FILE = 'data/sample-sections.json';
  ({ server } = await import('../server.js'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); upstream.close(); });

async function chat(body) {
  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  const events = text.split('\n\n').filter((b) => b.startsWith('data:')).map((b) => JSON.parse(b.slice(5)));
  return { res, events, text };
}

test('health reports Claude mode', async () => {
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.mode, 'claude');
  assert.equal(h.model, 'claude-sonnet-5-5');
  assert.equal(h.sampleSections, true);
});

test('chat streams Claude text and sends the right request', async () => {
  upstreamMode = 'ok';
  const { res, events } = await chat({
    messages: [
      { role: 'assistant', content: 'Hi there! I am your advisor.' }, // greeting is dropped
      { role: 'user', content: 'What do I need for CS 481?' },
    ],
    context: { completed: ['cs116', 'MATH 251'], savedCrns: ['10161', '99999'], query: 'cs 481', focus: ['CS 481'] },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  assert.equal(events[0].type, 'meta');
  assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'You need CS 331.');
  assert.equal(events.at(-1).type, 'done');

  const { headers, body, url } = lastRequest;
  assert.equal(url, '/v1/messages');
  assert.equal(headers['x-api-key'], 'test-key');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.stream, true);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'What do I need for CS 481?' }]);
  assert.equal(body.system.length, 3);
  assert.match(body.system[0].text, /Course Advisor inside "advisor\."/);
  assert.match(body.system[1].text, /COURSE DATA/);
  assert.deepEqual(body.system[1].cache_control, { type: 'ephemeral' });
  const student = body.system[2].text;
  assert.match(student, /Completed courses \(entered by the student\): CS 116, MATH 251/);
  assert.match(student, /CRN 10161/);
  assert.doesNotMatch(student, /99999/);
  assert.match(student, /CS 481 Artificial Intelligence Language Understanding/);
  assert.match(student, /Eligibility: NOT met/);
});

test('chat passes a friendly error when the key is rejected', async () => {
  upstreamMode = 'unauthorized';
  const { events } = await chat({ messages: [{ role: 'user', content: 'hi' }] });
  const err = events.find((e) => e.type === 'error');
  assert.match(err.message, /API key was rejected/);
  assert.doesNotMatch(JSON.stringify(events), /test-key/);
});

test('chat handles an error event mid-stream', async () => {
  upstreamMode = 'overloaded';
  const { events } = await chat({ messages: [{ role: 'user', content: 'hi' }] });
  assert.match(events.find((e) => e.type === 'error').message, /busy/);
});

test('chat rejects bad input', async () => {
  const empty = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"messages":[]}' });
  assert.equal(empty.status, 400);
  const notJson = await fetch(`${base}/api/chat`, { method: 'POST', body: 'nope' });
  assert.equal(notJson.status, 400);
  const big = await fetch(`${base}/api/chat`, { method: 'POST', body: 'x'.repeat(600 * 1024) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
  const get = await fetch(`${base}/api/chat`);
  assert.equal(get.status, 405);
});

test('static files are served and paths cannot escape', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(`${base}/js/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/data/catalog.json`)).status, 200);
  assert.equal((await fetch(`${base}/%2e%2e/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 404);
  assert.equal((await fetch(`${base}/data/../.env`)).status, 404);
  assert.equal((await fetch(`${base}/nope.html`)).status, 404);
});

test('transcript reading with Claude (PDF and text)', async () => {
  const post = (body) => fetch(`${base}/api/transcript`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let res = await post({ file: { mediaType: 'application/pdf', data: 'JVBERi0xLjQK' } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual(out.courses.map((c) => c.code), ['CS 331']);
  assert.equal(out.courses[0].status, 'completed');
  assert.deepEqual(out.warnings, ['Row 7 was blurry']);
  const sent = lastRequest.body;
  assert.equal(sent.stream, undefined);
  assert.equal(sent.messages[0].content[0].type, 'document');
  assert.equal(sent.messages[0].content[0].source.media_type, 'application/pdf');
  assert.match(sent.system, /return the courses as JSON/);

  res = await post({ file: { mediaType: 'image/png', data: 'iVBORw0KGgo=' } });
  assert.equal(res.status, 200);
  assert.equal(lastRequest.body.messages[0].content[0].type, 'image');

  res = await post({ text: 'CS 331 Data Structures A 3.000' });
  assert.equal(res.status, 200);
  assert.match(lastRequest.body.messages[0].content[0].text, /<transcript>/);

  assert.equal((await post({ file: { mediaType: 'application/zip', data: 'AAAA' } })).status, 400);
  assert.equal((await post({ file: { mediaType: 'application/pdf', data: 'not base64 !!' } })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await fetch(`${base}/api/transcript`)).status, 405);
});

test('forecast and program data are served', async () => {
  const f = await (await fetch(`${base}/data/forecast.json`)).json();
  assert.deepEqual(f.terms.map((t) => t.key), ['S27', 'F27', 'S28', 'F28']);
  const p = await (await fetch(`${base}/data/programs.json`)).json();
  assert.equal(p.programs[0].id, 'bs-cs');
  assert.equal((await fetch(`${base}/vendor/pdfjs/pdf.min.mjs`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}/samples/sample-transcript.txt`)).status, 200);
});

test('recommended plan: advisor plan is checked; bad input is refused', async () => {
  const { parseTranscriptText } = await import('../public/js/core/transcript.js');
  const { readFileSync } = await import('node:fs');
  const courses = parseTranscriptText(readFileSync(new URL('../public/samples/sample-transcript.txt', import.meta.url), 'utf8')).courses;
  const post = (body) => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post({ context: {} })).status, 400);
  assert.equal((await fetch(`${base}/api/plan`)).status, 405);

  const res = await post({ context: { transcript: courses, maxCredits: 15 }, messages: [{ role: 'user', content: 'I love AI.' }, { role: 'assistant', content: 'Great!' }] });
  assert.equal(res.status, 200);
  const plan = await res.json();
  assert.equal(plan.source, 'claude');
  // the request carried the plan task, the student's context, and the conversation
  const sent = lastRequest.body;
  assert.match(sent.system[2].text, /PLAN TASK/);
  assert.match(sent.system[2].text, /DEGREE PROGRESS/);
  assert.match(sent.messages[0].content, /Student: I love AI\./);
  assert.deepEqual(sent.system[1].cache_control, { type: 'ephemeral' });
  // unknown term dropped and noted
  assert.deepEqual(plan.terms.map((t) => t.label), ['Spring 2027', 'Fall 2027']);
  assert.ok(plan.assumptions.some((a) => /Summer 2027/.test(a)));
  // the checks
  const issue = (code) => plan.terms.flatMap((t) => t.items).find((i) => i.code === code).issues.map((x) => x.message).join(' ');
  assert.match(issue('CS 481'), /Not on the forecast for Fall 2027/);
  assert.match(issue('CS 485'), /Prerequisite not done first/);
  assert.equal(plan.check.ok, false);
  assert.ok(plan.check.issues.some((x) => /Not covered by the plan: Computer Science Requirements/.test(x.message)));

  // rules mode skips Claude
  const rules = await (await post({ context: { transcript: courses }, mode: 'rules' })).json();
  assert.equal(rules.source, 'rules');
  assert.equal(rules.check.ok, true);
});
