// AI协同工作台网关 —— 前端(5173) ←→ 业务/审批/审计 ←→ opencode(4096)
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, qOne, getPool } from '../../packages/shared/db.mjs';
import { opencode } from './opencode.mjs';
import { emit, sseHandler, startOpencodePump } from './bus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '../web/dist');
const PORT = Number(process.env.GATEWAY_PORT || 8787);
const HOST = process.env.GATEWAY_HOST || '127.0.0.1';
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const app = express();
app.use(cors({ origin: CORS_ORIGIN ? CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '20mb' }));

// ── 健康检查
app.get('/api/health', async (_req, res) => {
  const out = { gateway: true, opencode: false, db: false };
  try { out.opencode = (await opencode.health()).healthy === true; } catch {}
  try { await q('SELECT 1'); out.db = true; } catch {}
  res.json(out);
});

// ── 真实访问统计（必须最先注册，usage埋点中间件才能覆盖后续所有业务路由）
import { registerAnalyticsRoutes } from './analytics.mjs';
registerAnalyticsRoutes(app);

// ── 智能问数：提问 → 创建查询日志 → 拉起opencode会话
app.post('/api/ask', async (req, res) => {
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: 'question必填' });

  const ins = await q(
    "INSERT INTO sql_query_log (question, status) VALUES (?, 'drafting')",
    [question.trim()]
  );
  const queryId = ins.insertId;

  const session = await opencode.createSession({ title: `问数#${queryId}`, agent: 'ask' });
  await q(
    'INSERT INTO session_map (opencode_session_id, scenario, ref_type, ref_id) VALUES (?,?,?,?)',
    [session.id, 'ask', 'sql_query', queryId]
  );

  const prompt = [
    `业务问题：${question.trim()}`,
    '',
    `本次查询的queryId=${queryId}，提交审批时使用 ref_type="sql_query", ref_id=${queryId}。`,
    '今天日期：2026-10-26（"上个月"指2026年9月，"今年"指2026年）。请按流程执行。',
  ].join('\n');

  opencode.sendMessage(session.id, { text: prompt, agent: 'ask' }).catch(e => {
    console.error('[ask] 消息发送失败:', e.message);
    q("UPDATE sql_query_log SET status='failed' WHERE id=?", [queryId]).catch(() => {});
  });

  emit('query:update', { queryId, status: 'drafting' });
  res.json({ queryId, sessionId: session.id });
});

// 问数历史 / 详情
app.get('/api/queries', async (_req, res) => {
  const rows = await q('SELECT id, question, sql_text, interpretation, status, rows_returned, duration_ms, chart, reject_reasons, created_at FROM sql_query_log ORDER BY id DESC LIMIT 50');
  res.json(rows.map(parseJsonCols(['chart', 'reject_reasons'])));
});

app.get('/api/queries/:id', async (req, res) => {
  const row = await qOne('SELECT * FROM sql_query_log WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not found' });
  const ap = await q("SELECT * FROM approval_log WHERE ref_type='sql_query' AND ref_id=? ORDER BY id DESC LIMIT 1", [req.params.id]);
  const sm = await qOne("SELECT opencode_session_id FROM session_map WHERE ref_type='sql_query' AND ref_id=? ORDER BY id DESC LIMIT 1", [req.params.id]);
  let messages = null;
  if (sm) {
    try {
      const msgs = await opencode.listMessages(sm.opencode_session_id);
      messages = (msgs || []).map(m => ({
        id: m.info?.id, role: m.info?.role,
        parts: (m.parts || []).map(p => p.type === 'text' ? { type: 'text', text: p.text } : { type: p.type, tool: p.tool ?? p.state?.tool, state: p.state?.status ?? p.state }),
      }));
    } catch {}
  }
  res.json({ ...parseJsonCols(['chart', 'reject_reasons'])(row), approval: ap[0] ? parseJsonCols(['card', 'reject_reasons'])(ap[0]) : null, messages });
});

// ── 审批：列表 + 裁决
app.get('/api/approvals', async (req, res) => {
  const { status, scenario } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('status=?'); params.push(status); }
  if (scenario) { where.push('scenario=?'); params.push(scenario); }
  const rows = await q(
    `SELECT * FROM approval_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 100`,
    params
  );
  res.json(rows.map(parseJsonCols(['card', 'reject_reasons'])));
});

app.post('/api/approvals/:id/decide', async (req, res) => {
  const { verdict, reasons = [], decidedBy = '演示用户' } = req.body || {};
  if (!['approved', 'rejected'].includes(verdict)) return res.status(400).json({ error: 'verdict须为approved/rejected' });
  const ap = await qOne('SELECT * FROM approval_log WHERE id=?', [req.params.id]);
  if (!ap) return res.status(404).json({ error: '审批不存在' });
  if (ap.status !== 'pending') return res.status(409).json({ error: `当前状态${ap.status}，不可重复裁决` });

  await q(
    'UPDATE approval_log SET status=?, reject_reasons=?, decided_by=?, decided_at=NOW() WHERE id=?',
    [verdict, verdict === 'rejected' ? JSON.stringify(reasons) : null, decidedBy, ap.id]
  );

  // 各业务表的联动状态
  if (ap.ref_type === 'sql_query') {
    await q('UPDATE sql_query_log SET status=?, reject_reasons=? WHERE id=?',
      [verdict === 'approved' ? 'approved' : 'rejected', verdict === 'rejected' ? JSON.stringify(reasons) : null, ap.ref_id]);
  } else if (ap.ref_type === 'gov_case') {
    await q('UPDATE gov_case SET status=? WHERE id=?', [verdict === 'approved' ? 'approved' : 'rejected', ap.ref_id]);
  } else if (ap.ref_type === 'match_case') {
    const card = typeof ap.card === 'string' ? JSON.parse(ap.card) : ap.card;
    await q('UPDATE match_case SET status=?, disposition=? WHERE id=?',
      [verdict === 'approved' ? 'approved' : 'rejected', verdict === 'approved' ? (card.disposition ?? null) : null, ap.ref_id]);
  } else if (ap.ref_type === 'screening') {
    await q('UPDATE screening_result SET status=?, decided_by=?, decided_at=NOW(), reject_reasons=? WHERE id=?',
      [verdict === 'approved' ? 'approved' : 'rejected', decidedBy, verdict === 'rejected' ? JSON.stringify(reasons) : null, ap.ref_id]);
  } else if (ap.ref_type === 'biz_case') {
    const card = typeof ap.card === 'string' ? JSON.parse(ap.card) : ap.card;
    const disp = card.disposition ?? card.recommendedPlan ?? card.suggestedAction ?? card.recommendation ?? card.verdict ?? null;
    await q('UPDATE biz_case SET status=?, disposition=? WHERE id=?',
      [verdict === 'approved' ? 'approved' : 'rejected', verdict === 'approved' ? disp : null, ap.ref_id]);
  }

  emit('approval:decided', { approvalId: ap.id, scenario: ap.scenario, refType: ap.ref_type, refId: ap.ref_id, verdict, reasons });
  emit('query:update', ap.ref_type === 'sql_query' ? { queryId: ap.ref_id } : {});
  res.json({ ok: true });
});

// ── 审计页
app.get('/api/audit', async (req, res) => {
  const rows = await q(
    `SELECT a.*, u.name AS decidee_name FROM approval_log a
     LEFT JOIN (SELECT '演示用户' name) u ON 1=1
     ORDER BY a.id DESC LIMIT 200`
  );
  res.json(rows.map(parseJsonCols(['card', 'reject_reasons'])));
});

// ── 指标口径字典（前端侧栏）
import { METRICS_DICT, SCHEMA_DIGEST } from '../../packages/shared/metrics.mjs';
app.get('/api/metrics', (_req, res) => {
  res.json({ metrics: METRICS_DICT, schema: SCHEMA_DIGEST });
});

// ── SSE
app.get('/api/events', (req, res) => sseHandler(res));

// ── 简历初筛场景
import { registerResumeRoutes } from './resume.mjs';
registerResumeRoutes(app);

// ── 三单匹配场景
import { registerMatchRoutes } from './match.mjs';
registerMatchRoutes(app);

// ── 政务预审场景
import { registerGovRoutes } from './gov.mjs';
registerGovRoutes(app);

// ── 通用业务引擎（8个新场景）+ CTP
import { registerBizRoutes } from './biz.mjs';
registerBizRoutes(app);

function parseJsonCols(cols) {
  return (row) => {
    const out = { ...row };
    for (const c of cols) {
      if (out[c] && typeof out[c] === 'string') {
        try { out[c] = JSON.parse(out[c]); } catch { /* 保留原值 */ }
      }
    }
    return out;
  };
}

// ── 静态前端（生产同源托管 apps/web/dist；本地 dev 时 dist 不存在则跳过）
app.use(express.static(DIST));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(DIST, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[gateway] http://${HOST}:${PORT}`);
  startOpencodePump();
  getPool().query('SELECT 1').then(() => console.log('[gateway] db ok')).catch(e => console.error('[gateway] db FAIL:', e.message));
});
