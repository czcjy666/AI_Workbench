// 真实访问统计 —— 访客UV / 在线心跳 / 功能使用次数 + 个人简历(md)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { q } from '../../packages/shared/db.mjs';
import { emit } from './bus.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', '..', 'content', 'profile.md');

async function getStats() {
  const [[uv]] = [await q("SELECT COUNT(DISTINCT visitor_id) c FROM analytics_event WHERE type='visit'")];
  const [[pv]] = [await q("SELECT COUNT(*) c FROM analytics_event WHERE type='visit'")];
  const [[online]] = [await q("SELECT COUNT(DISTINCT visitor_id) c FROM analytics_event WHERE type IN ('visit','heartbeat') AND created_at > NOW() - INTERVAL 90 SECOND")];
  const [[usage]] = [await q("SELECT COUNT(*) c FROM analytics_event WHERE type='usage'")];
  return { visitors: uv.c, visits: pv.c, online: online.c, usage: usage.c };
}

// 记录一次功能使用（供各路由调用）
export async function trackUsage(scenario) {
  try {
    await q("INSERT INTO analytics_event (visitor_id, type, scenario) VALUES ('system', 'usage', ?)", [scenario]);
    const stats = await getStats();
    emit('stats:update', stats);
  } catch { /* 统计失败不影响业务 */ }
}

export function registerAnalyticsRoutes(app) {
  // 访问上报（同一访客30分钟内去重）
  app.post('/api/track/visit', async (req, res) => {
    const { visitorId } = req.body || {};
    if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 40) return res.status(400).json({ error: 'visitorId必填' });
    const [recent] = await q(
      "SELECT id FROM analytics_event WHERE visitor_id=? AND type='visit' AND created_at > NOW() - INTERVAL 30 MINUTE LIMIT 1",
      [visitorId]
    );
    if (!recent) {
      await q("INSERT INTO analytics_event (visitor_id, type) VALUES (?, 'visit')", [visitorId]);
    }
    res.json(await getStats());
  });

  // 心跳（90秒在线窗口，30秒内去重写库）
  app.post('/api/track/heartbeat', async (req, res) => {
    const { visitorId } = req.body || {};
    if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 40) return res.status(400).json({ error: 'visitorId必填' });
    const [recent] = await q(
      "SELECT id FROM analytics_event WHERE visitor_id=? AND type='heartbeat' AND created_at > NOW() - INTERVAL 30 SECOND LIMIT 1",
      [visitorId]
    );
    if (!recent) {
      await q("INSERT INTO analytics_event (visitor_id, type) VALUES (?, 'heartbeat')", [visitorId]);
    }
    res.json(await getStats());
  });

  // 实时统计
  app.get('/api/stats', async (_req, res) => {
    res.json(await getStats());
  });

  // 个人简历（Markdown，可直接编辑 content/profile.md）
  app.get('/api/profile', (_req, res) => {
    try {
      const md = fs.readFileSync(PROFILE_PATH, 'utf8');
      res.json({ markdown: md, updatedAt: fs.statSync(PROFILE_PATH).mtime });
    } catch (e) {
      res.status(404).json({ error: 'profile.md不存在' });
    }
  });

  // 使用埋点中间件：AI功能运行即计数（幂等看行不清不影响业务）
  app.use((req, _res, next) => {
    if (req.method === 'POST') {
      let scenario = null;
      const p = req.path;
      if (p === '/api/ask') scenario = 'ask';
      else if (p === '/api/screening/start') scenario = 'resume';
      else if (p === '/api/ctp/ask') scenario = 'ctp';
      else {
        const m = p.match(/^\/api\/([a-z0-9]+)\/(analyze|precheck)$/);
        if (m) scenario = m[1];
      }
      if (scenario) trackUsage(scenario).catch(() => {});
    }
    next();
  });
}
