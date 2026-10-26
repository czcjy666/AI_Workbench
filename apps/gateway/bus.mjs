// 事件总线：业务事件 + opencode事件 聚合后经SSE推给浏览器
import { EventEmitter } from 'node:events';
import { opencode } from './opencode.mjs';
import { q } from '../../packages/shared/db.mjs';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emit(type, payload) {
  bus.emit('event', { type, payload, ts: Date.now() });
}

// 订阅opencode全局事件，只转发属于本工作台会话的
let started = false;
export function startOpencodePump() {
  if (started) return;
  started = true;
  (async () => {
    for (;;) {
      try {
        for await (const ev of opencode.events()) {
          const sid = ev.properties?.sessionID || ev.info?.sessionID || ev.sessionID;
          if (!sid) continue;
          const rows = await q('SELECT scenario, ref_type, ref_id FROM session_map WHERE opencode_session_id=? AND status=\'active\' LIMIT 1', [sid]);
          if (!rows.length) continue;
          emit('oc-event', { session: sid, scenario: rows[0].scenario, refId: rows[0].ref_id, event: ev });
        }
      } catch (e) {
        console.error('[oc-pump] 断开重连中:', e.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();
}

// SSE响应封装
export function sseHandler(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(':ok\n\n');
  const listener = (evt) => {
    try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch { /* closed */ }
  };
  bus.on('event', listener);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);
  res.on('close', () => { clearInterval(hb); bus.off('event', listener); });
}
