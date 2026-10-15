// Chat tab: talks to /api/chat (server-sent events) and renders answers.

import { esc, renderMarkdown, store } from './util.js';

const BOT_ICON = '<span class="bot-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M2 13v2M22 13v2"/></svg></span>';
const GREETING = 'Hi there! 👋 I’m your course advisor. How can I help you today?';
const SUGGESTIONS = [
  'What are the prerequisites for CS 481?',
  'Can I take MATH 474 at the same time as CS 480?',
  'What can I take after CS 331?',
  'Does my schedule have any time conflicts?',
];

export function createChat({ els, known, getContext, onCodeClick }) {
  let messages = store.get('chat', []);
  if (!Array.isArray(messages)) messages = [];
  messages = messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-40);
  let busy = false;
  let controller = null;
  let mode = null;

  const save = () => store.set('chat', messages.filter((m) => !m.error).slice(-40));

  function bubble(m) {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
    const body = m.pending && !m.content
      ? '<span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span>'
      : renderMarkdown(m.content, known);
    const retry = m.error ? '<button type="button" class="btn retry" data-retry>Try again</button>' : '';
    return `<div class="msg bot${m.error ? ' error' : ''}">${BOT_ICON}<div class="bubble">${body}${retry}</div></div>`;
  }

  function render() {
    const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 60;
    let html = bubble({ role: 'assistant', content: GREETING });
    html += messages.map(bubble).join('');
    if (!messages.length) {
      html += `<div class="suggestions">${SUGGESTIONS.map((s) => `<button type="button" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    }
    els.log.innerHTML = html;
    if (atBottom || busy) els.log.scrollTop = els.log.scrollHeight;
    els.send.classList.toggle('stop', busy);
    els.send.setAttribute('aria-label', busy ? 'Stop' : 'Send');
  }

  let frame = 0;
  const renderSoon = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  };

  async function ask(text) {
    const question = String(text || '').trim();
    if (!question || busy) return;
    messages.push({ role: 'user', content: question.slice(0, 4000) });
    const reply = { role: 'assistant', content: '', pending: true };
    messages.push(reply);
    busy = true;
    render();

    controller = new AbortController();
    try {
      const history = messages.filter((m) => m !== reply && !m.error).map(({ role, content }) => ({ role, content }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history, context: getContext() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `The server returned an error (${res.status}).`;
        try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* not JSON */ }
        throw Object.assign(new Error(msg), { safe: true });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const line = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line.slice(5)); } catch { continue; }
          if (evt.type === 'meta') setMode(evt.mode, evt.model);
          else if (evt.type === 'text') { reply.content += evt.text; renderSoon(); }
          else if (evt.type === 'error') throw Object.assign(new Error(evt.message), { safe: true });
          else if (evt.type === 'done') finished = true;
        }
      }
      if (!reply.content.trim()) throw Object.assign(new Error('The advisor sent an empty answer. Try again.'), { safe: true });
    } catch (err) {
      if (err.name === 'AbortError') {
        if (!reply.content) reply.content = '_Stopped._';
        else reply.content += '\n\n_Stopped._';
      } else {
        reply.error = true;
        reply.retryText = question;
        reply.content = err.safe ? err.message : 'Could not reach the advisor server. Is it still running?';
      }
    } finally {
      reply.pending = false;
      busy = false;
      controller = null;
      save();
      render();
    }
  }

  function setMode(m, model) {
    mode = m;
    if (m === 'claude') {
      els.mode.textContent = 'Claude';
      els.mode.className = 'mode-badge ok';
      els.mode.title = `Answers from ${model || 'Claude'}`;
    } else {
      els.mode.textContent = 'Offline';
      els.mode.className = 'mode-badge warn';
      els.mode.title = 'No Claude API key is set on the server. Answers come from the app’s course data only.';
    }
  }

  // ----- events -----
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { controller?.abort(); return; }
    const text = els.input.value;
    els.input.value = '';
    autosize();
    ask(text);
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.form.requestSubmit();
    }
  });
  const autosize = () => {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(els.input.scrollHeight, 180)}px`;
  };
  els.input.addEventListener('input', autosize);
  els.log.addEventListener('click', (e) => {
    const s = e.target.closest('[data-suggest]');
    if (s) return ask(s.dataset.suggest);
    const code = e.target.closest('.code-link');
    if (code) return onCodeClick(code.dataset.code);
    if (e.target.closest('[data-retry]')) {
      const last = messages[messages.length - 1];
      if (last?.error) {
        messages.pop(); // error bubble
        const q = messages.pop(); // the question
        ask(q?.content || last.retryText);
      }
    }
  });
  els.clear.addEventListener('click', () => {
    if (busy) controller?.abort();
    messages = [];
    save();
    render();
    els.input.focus();
  });

  // server mode badge
  fetch('/api/health').then((r) => r.json()).then((h) => setMode(h.mode, h.model)).catch(() => {
    els.mode.textContent = 'Server offline';
    els.mode.className = 'mode-badge warn';
  });

  render();
  return { ask, render, get busy() { return busy; }, get mode() { return mode; } };
}
