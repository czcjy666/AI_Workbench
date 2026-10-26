// 通用业务引擎 —— 8个新场景共用的 导入/LLM分析/查询 端点 + CTP交互端点
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import OpenAI from 'openai';
import { q } from '../../packages/shared/db.mjs';
import { emit } from './bus.mjs';
import { SCENARIOS } from '../../packages/shared/scenarios.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MOCK_DIR = path.join(__dirname, '..', '..', 'mock-data');

const FIXTURES = {
  contract: 'biz-contracts.json',
  credit: 'biz-credit.json',
  ugc: 'biz-ugc.json',
  abtest: 'biz-abtest.json',
  equipment: 'biz-equipment.json',
  policy: 'biz-policy.json',
  ticket: 'biz-tickets.json',
};

const llm = new OpenAI({
  baseURL: process.env.LLM_BASE || 'https://token.sensenova.cn/v1',
  apiKey: process.env.LLM_KEY,
  timeout: 300000,
});
const MODEL = process.env.LLM_MODEL || 'sensenova-6.8-flash-lite';

async function callLLMJson(prompt, maxTokens = 3500, onReasoning = null) {
  let cap = maxTokens;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const stream = await llm.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'user', content: prompt + (attempt > 0 ? '\n\n(注意：务必输出完整且合法的单个JSON对象，总长度控制在800字以内，不要截断。)' : '') }],
        temperature: attempt === 0 ? 0.2 : 0,
        max_tokens: cap,
        stream: true,
      });
      let content = '';
      let finishReason = null;
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        // 推理模型的思考过程：实时推给前端展示
        if (delta.reasoning && onReasoning) { try { onReasoning(delta.reasoning); } catch {} }
        if (delta.content) content += delta.content;
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
      // 输出被截断时加倍token上限重试（provider偶发限制）
      if (finishReason === 'length') {
        cap = Math.min(cap * 2, 12000);
        continue;
      }
      let txt = (content || '').trim()
        .replace(/^```(json)?/m, '').replace(/```$/m, '').trim();
      return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    } catch (e) {
      // 429限流：指数退避（15s/30s/45s…）
      if (e?.status === 429 && attempt < 4) {
        await new Promise(r => setTimeout(r, 15000 * (attempt + 1)));
        continue;
      }
      if (attempt === 4) throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// 推理流sink：节流(60ms)聚合 reasoning delta，经SSE推给前端
function makeReasoningSink(scenario, tag = null) {
  let buf = '';
  let timer = null;
  const flush = () => {
    timer = null;
    if (!buf) return;
    emit('reasoning', { scenario, tag, text: buf });
    buf = '';
  };
  return {
    onChunk(text) {
      if (!text) return;
      buf += text;
      if (!timer) timer = setTimeout(flush, 60);
    },
    end() {
      if (timer) { clearTimeout(timer); timer = null; }
      flush();
      emit('reasoning', { scenario, tag, done: true });
    },
  };
}

export function registerBizRoutes(app) {
  // 场景元信息（前端侧边栏用）
  app.get('/api/scenarios', (_req, res) => {
    res.json(Object.entries(SCENARIOS).map(([key, s]) => ({
      key, name: s.name, category: s.category,
    })));
  });

  // 1. 载入fixture
  app.post('/api/:scenario/import', async (req, res) => {
    const cfg = SCENARIOS[req.params.scenario];
    const fixture = FIXTURES[req.params.scenario];
    if (!cfg || !fixture) return res.status(404).json({ error: '未知场景' });
    const items = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, fixture), 'utf8'));
    await q('DELETE FROM biz_case WHERE scenario=?', [req.params.scenario]);
    await q("DELETE FROM approval_log WHERE ref_type='biz_case' AND scenario=?", [req.params.scenario]);
    // 政策场景：policy库统一注入（fixture中用@SAME占位）
    const policyLib = items.find(i => Array.isArray(i.policies))?.policies;
    for (const item of items) {
      if (item.policies === '@SAME') item.policies = policyLib;
      await q(
        'INSERT INTO biz_case (scenario, case_no, title, payload, status) VALUES (?,?,?,?,?)',
        [req.params.scenario, item.caseNo ?? item.id ?? '', cfg.title(item), JSON.stringify(item), 'pending']
      );
    }
    emit('biz:imported', { scenario: req.params.scenario, total: items.length });
    res.json({ total: items.length });
  });

  // 2. 批量LLM分析 → 审批卡
  app.post('/api/:scenario/analyze', async (req, res) => {
    const scenario = req.params.scenario;
    const cfg = SCENARIOS[scenario];
    if (!cfg) return res.status(404).json({ error: '未知场景' });
    const rows = await q("SELECT * FROM biz_case WHERE scenario=? AND status='pending'", [scenario]);
    res.json({ started: true, total: rows.length });
    let done = 0;
    const CONCURRENCY = scenario === 'ugc' || scenario === 'ticket' ? 5 : 3;
    let cursor = 0;
    async function worker() {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const sink = makeReasoningSink(scenario, row.case_no);
        try {
          const card = await callLLMJson(cfg.prompt(payload), 3500, sink.onChunk);
          await q('UPDATE biz_case SET analysis=?, status=? WHERE id=?', [JSON.stringify(card), 'proposing', row.id]);
          await q(
            "INSERT INTO approval_log (scenario, ref_type, ref_id, title, card, status) VALUES (?,?,?,?,?,'pending')",
            [scenario, 'biz_case', row.id, row.title, JSON.stringify({ ...card, _payload: payload })]
          );
        } catch (e) {
          console.error(`[biz:${scenario}]`, row.case_no, e.message);
          await q("UPDATE biz_case SET status='pending' WHERE id=?", [row.id]).catch(() => {});
        } finally {
          sink.end();
        }
        done++;
        emit('biz:progress', { scenario, done, total: rows.length });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    emit('biz:done', { scenario });
  });

  // 3. 查询案例列表
  app.get('/api/:scenario/cases', async (req, res) => {
    const scenario = req.params.scenario;
    if (!SCENARIOS[scenario]) return res.status(404).json({ error: '未知场景' });
    const rows = await q(
      `SELECT b.*, a.id AS approval_id, a.status AS approval_status, a.decided_by, a.decided_at
       FROM biz_case b
       LEFT JOIN approval_log a ON a.ref_type='biz_case' AND a.ref_id=b.id
            AND a.status IN ('pending','approved','rejected')
       WHERE b.scenario=? ORDER BY b.id`,
      [scenario]
    );
    res.json(rows.map(r => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      analysis: typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis,
    })));
  });

  // ── CTP交期应答（交互式例外） ──
  app.post('/api/ctp/ask', async (req, res) => {
    const { question } = req.body || {};
    if (!question?.trim()) return res.status(400).json({ error: 'question必填' });
    const cap = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, 'biz-ctp.json'), 'utf8'));
    const prompt = [
      `你是制造业交期应答（CTP）助手。销售提出交期问题，你基于产能与物料数据给出可承诺方案。只输出JSON。`,
      ``,
      `【产能与物料数据】`,
      `产线：${cap.lines.map(l => `${l.name}（日产能${l.dailyCapacity}件，未来占用：${l.occupied.map(o => `${o.date}已被占${o.qty}件`).join('、') || '无'}）`).join('；')}`,
      `物料库存：${cap.materials.map(m => `${m.name}（可用${m.available}${m.unit}，在途：${m.inbound || '无'}，缺料预警：${m.warning || '无'}）`).join('；')}`,
      `标准生产周期：下单到出货需${cap.leadDays}天（含质检）；紧急插单可压缩至${cap.rushLeadDays}天但需审批。`,
      ``,
      `【销售问题】"${question.trim()}"`,
      `今天日期：2026-10-26。`,
      ``,
      `输出JSON：`,
      `{"answer":"can|conditional|cannot","explanation":"答复说明(自己算数量/天数/物料缺口，给出依据)",`,
      `"plans":[{"plan":"方案名(如正常排产/紧急插单/分批交付)","detail":"具体安排","deadline":"承诺交期","cost":"额外成本或代价","tradeoff":"牺牲(如顺延其他订单)"}],`,
      `"gaps":["物料/产能缺口说明"],"recommendedPlan":"推荐方案名"}`,
      `规则：日期与数量自己推算并展示计算过程；answer=conditional时必须给出至少2个方案供选择；cannot时说明缺什么。`,
    ].join('\n');
    const sink = makeReasoningSink('ctp');
    try {
      const card = await callLLMJson(prompt, 3000, sink.onChunk);
      const ins = await q(
        "INSERT INTO biz_case (scenario, case_no, title, payload, analysis, status) VALUES ('ctp',?,?,?,?,'proposing')",
        [`CTP-${Date.now().toString().slice(-6)}`, question.trim().slice(0, 60), JSON.stringify({ question: question.trim() }), JSON.stringify(card)]
      );
      await q(
        "INSERT INTO approval_log (scenario, ref_type, ref_id, title, card, status) VALUES ('ctp','biz_case',?,?,?,'pending')",
        [ins.insertId, `交期应答 · ${question.trim().slice(0, 40)}`, JSON.stringify({ ...card, question: question.trim() })]
      );
      emit('biz:done', { scenario: 'ctp' });
      res.json({ caseId: ins.insertId, card });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      sink.end();
    }
  });

  app.get('/api/ctp/cases', async (_req, res) => {
    const rows = await q(
      `SELECT b.*, a.id AS approval_id, a.status AS approval_status, a.decided_by, a.decided_at
       FROM biz_case b LEFT JOIN approval_log a ON a.ref_type='biz_case' AND a.ref_id=b.id
       AND a.status IN ('pending','approved','rejected')
       WHERE b.scenario='ctp' ORDER BY b.id DESC LIMIT 20`
    );
    res.json(rows.map(r => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      analysis: typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis,
    })));
  });
}
