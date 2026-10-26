// MCP业务工具服务器 —— opencode 的 agent 通过这些工具与业务系统交互
// 核心设计：submit_proposal 阻塞等待人工裁决 = "AI提案、人类裁决"的接合点
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import 'dotenv/config';
import { getPool, q, qOne } from '../../packages/shared/db.mjs';
import { SCHEMA_DIGEST, METRICS_DICT } from '../../packages/shared/metrics.mjs';

const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 审批等待上限30分钟（演示场景人要慢慢审）
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = new McpServer({ name: 'workbench-business', version: '0.1.0' });

// ── 工具1：获取表结构 + 指标口径字典 + 已确认问答（反馈飞轮的few-shot来源）
server.tool(
  'get_schema',
  '获取电商演示库的表结构、指标口径字典（销量/GMV/客单价/华南区等口径定义）和已人工确认的问答示例。生成SQL前必须先调用。',
  {},
  async () => {
    const examples = await q(
      'SELECT question, sql_text, interpretation FROM sql_example WHERE enabled=1 ORDER BY id DESC LIMIT 5'
    );
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          schema: SCHEMA_DIGEST,
          metrics_dict: METRICS_DICT,
          confirmed_examples: examples,
        }, null, 1),
      }],
    };
  }
);

// ── 工具2：提交提案并阻塞等待人工裁决（全场景通用的审批接合点）
server.tool(
  'submit_proposal',
  '提交AI提案等待人工审批。会阻塞直到人在工作台界面上做出裁决（通过/驳回）。card字段说明：ask场景={sql, interpretation(一句人话解释), chart:{type:bar|line|pie, x, y}}；gov场景=预审报告。返回verdict: approved/rejected/timeout，rejected时附reject_reasons。',
  {
    scenario: z.enum(['ask', 'resume', 'match', 'gov']).describe('场景'),
    ref_type: z.string().describe('关联业务类型，如 sql_query/gov_case/match_case'),
    ref_id: z.number().describe('关联业务ID'),
    title: z.string().describe('审批卡标题'),
    card: z.record(z.any()).describe('提案卡片内容(JSON)'),
  },
  async ({ scenario, ref_type, ref_id, title, card }) => {
    // 同一业务单已有pending提案则作废旧条（agent改写重提的场景）
    await q(
      "UPDATE approval_log SET status='expired' WHERE ref_type=? AND ref_id=? AND status='pending'",
      [ref_type, ref_id]
    );
    const ins = await q(
      'INSERT INTO approval_log (scenario, ref_type, ref_id, title, card, status) VALUES (?,?,?,?,?,"pending")',
      [scenario, ref_type, ref_id, title, JSON.stringify(card)]
    );
    const approvalId = ins.insertId;

    // ask场景：同步更新查询日志为proposing
    if (scenario === 'ask' && ref_type === 'sql_query') {
      await q(
        "UPDATE sql_query_log SET sql_text=?, interpretation=?, status='proposing', chart=? WHERE id=? AND status IN ('drafting','proposing','rejected')",
        [card.sql ?? '', card.interpretation ?? '', card.chart ? JSON.stringify(card.chart) : null, ref_id]
      );
    }
    if (scenario === 'gov' && ref_type === 'gov_case') {
      await q("UPDATE gov_case SET report=?, status='proposing' WHERE id=?", [JSON.stringify(card), ref_id]);
    }

    // 轮询等待人工裁决
    const t0 = Date.now();
    while (Date.now() - t0 < APPROVAL_TIMEOUT_MS) {
      await sleep(1500);
      const row = await qOne('SELECT status, reject_reasons, decided_by FROM approval_log WHERE id=?', [approvalId]);
      if (row && row.status !== 'pending' && row.status !== 'expired') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              approval_id: approvalId,
              verdict: row.status,
              reject_reasons: row.reject_reasons,
              decided_by: row.decided_by,
            }),
          }],
        };
      }
    }
    await q("UPDATE approval_log SET status='expired' WHERE id=? AND status='pending'", [approvalId]);
    return {
      content: [{ type: 'text', text: JSON.stringify({ approval_id: approvalId, verdict: 'timeout' }) }],
      isError: false,
    };
  }
);

// ── 工具3：执行已审批的SQL（仅问数场景，强校验）
server.tool(
  'run_sql',
  '执行已通过人工审批的SELECT查询。approval_id必须是submit_proposal返回的审批ID，且该提案已被approved；SQL必须与审批卡中的SQL一致。执行成功会把问答沉淀进示例库（反馈飞轮）。',
  {
    approval_id: z.number().describe('审批ID'),
    sql: z.string().describe('与审批卡完全一致的SQL'),
  },
  async ({ approval_id, sql }) => {
    const ap = await qOne('SELECT * FROM approval_log WHERE id=?', [approval_id]);
    if (!ap) return { content: [{ type: 'text', text: '审批记录不存在' }], isError: true };
    if (ap.status !== 'approved') {
      return { content: [{ type: 'text', text: `该提案状态为${ap.status}，只有approved的SQL才能执行` }], isError: true };
    }
    const card = typeof ap.card === 'string' ? JSON.parse(ap.card) : ap.card;
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/;$/, '');
    if (norm(card.sql) !== norm(sql)) {
      return { content: [{ type: 'text', text: 'SQL与审批卡不一致，禁止执行。如需修改请重新提交审批。' }], isError: true };
    }
    // SQL安全：仅SELECT/WITH，单语句，LIMIT封顶
    let safe = norm(sql);
    if (!/^(select|with)\s/i.test(safe)) return { content: [{ type: 'text', text: '仅允许SELECT/WITH查询' }], isError: true };
    if (/\binto\s+(outfile|dumpfile)\b/i.test(safe)) return { content: [{ type: 'text', text: '禁止导出语句' }], isError: true };
    safe = safe.replace(/limit\s+(\d+)/gi, (m, n) => `LIMIT ${Math.min(Number(n), 1000)}`);
    if (!/limit\s+\d+/i.test(safe)) safe += ' LIMIT 500';

    const t0 = Date.now();
    try {
      const [rows] = await getPool().query({ sql: safe, timeout: 10000 });
      const duration = Date.now() - t0;
      const logId = ap.ref_id;
      await q(
        "UPDATE sql_query_log SET status='executed', duration_ms=?, rows_returned=?, chart=?, updated_at=NOW() WHERE id=?",
        [duration, rows.length, JSON.stringify({ spec: card.chart ?? null, columns: rows.length ? Object.keys(rows[0]) : [], rows: rows.slice(0, 100), total: rows.length }), logId]
      );
      // 反馈飞轮：审批通过的问答对自动沉淀为示例
      const log = await qOne('SELECT question FROM sql_query_log WHERE id=?', [logId]);
      if (log?.question) {
        await q(
          'INSERT INTO sql_example (question, sql_text, interpretation, source) VALUES (?,?,?,?)',
          [log.question, card.sql, card.interpretation ?? '', 'agent']
        );
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            columns: rows.length ? Object.keys(rows[0]) : [],
            rows: rows.slice(0, 200),
            total: rows.length,
            duration_ms: duration,
            note: rows.length > 200 ? '仅返回前200行' : null,
          }, null, 1),
        }],
      };
    } catch (e) {
      await q("UPDATE sql_query_log SET status='failed' WHERE id=?", [ap.ref_id]);
      return { content: [{ type: 'text', text: `执行失败: ${e.message}` }], isError: true };
    }
  }
);

// ── 工具4：读取提案裁决详情（agent在收到approved后可核对）
server.tool(
  'get_approval',
  '按ID查询审批记录的当前状态与内容。',
  { approval_id: z.number() },
  async ({ approval_id }) => {
    const row = await qOne('SELECT id, scenario, status, title, card, reject_reasons, decided_by, decided_at FROM approval_log WHERE id=?', [approval_id]);
    return { content: [{ type: 'text', text: JSON.stringify(row) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp-tools] 业务工具服务器已启动 (stdio)');
