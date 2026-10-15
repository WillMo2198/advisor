// Minimal streaming client for the Claude Messages API (no SDK needed).
// Docs: https://platform.claude.com/docs/en/api/messages

const API_VERSION = '2023-06-01';

function friendlyError(status, body) {
  const detail = body?.error?.message ? ` (${body.error.message})` : '';
  if (status === 401) return 'The Claude API key was rejected. Check ANTHROPIC_API_KEY in .env.';
  if (status === 403) return `The Claude API key does not have access to this model or feature${detail}.`;
  if (status === 404) return `The model was not found. Check ANTHROPIC_MODEL in .env${detail}.`;
  if (status === 429) return 'The Claude API rate limit was hit. Wait a moment and try again.';
  if (status === 529 || status === 503) return 'Claude is busy right now. Try again in a minute.';
  if (status === 400) return `The request to Claude was invalid${detail}.`;
  return `The Claude API returned an error (${status})${detail}.`;
}

/**
 * Stream a reply. Calls onText(chunk) for each piece of text.
 * Resolves with { stopReason, usage } or throws Error with a user-safe message.
 */
export async function streamClaude({ apiKey, baseUrl, model, maxTokens, system, messages, signal, onText }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const err = new Error(friendlyError(res.status, body));
    err.status = res.status;
    err.safe = true;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason = null;
  let usage = {};

  const handleEvent = (raw) => {
    const dataLines = raw.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart());
    if (!dataLines.length) return;
    let evt;
    try { evt = JSON.parse(dataLines.join('\n')); } catch { return; }
    switch (evt.type) {
      case 'message_start':
        usage = { ...usage, ...(evt.message?.usage || {}) };
        break;
      case 'content_block_delta':
        if (evt.delta?.type === 'text_delta' && evt.delta.text) onText(evt.delta.text);
        break;
      case 'message_delta':
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        usage = { ...usage, ...(evt.usage || {}) };
        break;
      case 'error': {
        const type = evt.error?.type;
        const err = new Error(type === 'overloaded_error'
          ? 'Claude is busy right now. Try again in a minute.'
          : `Claude stopped with an error${evt.error?.message ? `: ${evt.error.message}` : '.'}`);
        err.safe = true;
        throw err;
      }
      default:
        break;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(buffer.slice(cut).match(/^\r?\n\r?\n/)[0].length + cut);
      handleEvent(raw);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleEvent(buffer);
  return { stopReason, usage };
}
