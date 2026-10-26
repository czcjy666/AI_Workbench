// opencode HTTP API 客户端（Node24原生fetch）
const BASE = process.env.OPENCODE_BASE || 'http://127.0.0.1:4096';

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`opencode ${method} ${path} -> ${res.status}: ${txt.slice(0, 300)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

export const opencode = {
  health: () => req('GET', '/global/health'),

  createSession: ({ title, agent }) =>
    req('POST', '/session', { title, agent: agent || 'ask' }),

  getSession: (id) => req('GET', `/session/${id}`),

  listMessages: (id) => req('GET', `/session/${id}/message`),

  sendMessage: (id, { text, agent }) =>
    req('POST', `/session/${id}/message`, {
      agent: agent || 'ask',
      parts: [{ type: 'text', text }],
    }),

  sendMessageAsync: (id, { text, agent }) =>
    req('POST', `/session/${id}/prompt_async`, {
      agent: agent || 'ask',
      parts: [{ type: 'text', text }],
    }),

  abort: (id) => req('POST', `/session/${id}/abort`, {}),

  // 全局SSE事件流（转发给浏览器）
  events: async function* () {
    const res = await fetch(BASE + '/event', { headers: { accept: 'text/event-stream' } });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
        if (dataLine) {
          try { yield JSON.parse(dataLine.slice(5)); } catch { /* 忽略非JSON */ }
        }
      }
    }
  },
};
