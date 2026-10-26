// 三单匹配场景 —— 规则引擎精确匹配 + LLM差异归因 → 处置审批
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import OpenAI from 'openai';
import { q } from '../../packages/shared/db.mjs';
import { emit } from './bus.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', '..', 'mock-data', 'match-cases.json');

const llm = new OpenAI({
  baseURL: process.env.LLM_BASE || 'https://token.sensenova.cn/v1',
  apiKey: process.env.LLM_KEY,
  timeout: 90000,
});
const MODEL = process.env.LLM_MODEL || 'sensenova-6.8-flash-lite';

// ── 规则引擎：逐行比对数量/单价/税率 ──
function ruleMatch(c) {
  const diffs = [];
  const po = c.po, inv = c.invoice, rc = c.receipt;

  if (!rc) diffs.push({ field: '收货单', type: '缺失', detail: '发票已到但收货单未录入，三单缺一' });

  for (const poItem of po.items) {
    const invItem = inv.items.find(i => i.name === poItem.name)
      ?? inv.items.find(i => i.name.replace(/\((箱|包)\)/, '') === poItem.name.replace(/\((箱|包)\)/, ''));
    if (!invItem) { diffs.push({ field: '商品', type: '发票缺项', detail: `${poItem.name} 在发票中不存在` }); continue; }

    // 单位换算（箱/包 1:5）
    const unitNote = invItem.name.includes('(包)') && poItem.name.includes('(箱)') ? '（发票按包、PO按箱，1箱=5包）' : '';
    const invQtyInPoUnit = invItem.name.includes('(包)') && poItem.name.includes('(箱)') ? invItem.qty / 5 : invItem.qty;
    if (invQtyInPoUnit !== poItem.qty) {
      diffs.push({ field: '数量', type: '不一致', detail: `${poItem.name}：PO ${poItem.qty} / 发票 ${invItem.qty}${unitNote}${rc ? ` / 收货 ${(rc.items.find(r => r.name === poItem.name) || {}).qty ?? '—'}` : ''}` });
    } else if (rc) {
      const rcQty = rc.items.find(r => r.name === poItem.name)?.qty;
      if (rcQty !== undefined && rcQty !== poItem.qty) {
        diffs.push({ field: '数量', type: '短收', detail: `${poItem.name}：PO ${poItem.qty} / 收货 ${rcQty}` });
      }
    }
    const priceDiff = Math.abs(invItem.unitPrice - poItem.unitPrice) / poItem.unitPrice;
    if (priceDiff > 0.005) {
      diffs.push({ field: '单价', type: priceDiff > 0.10 ? '擅自调价' : '价格差异', detail: `${poItem.name}：PO ${poItem.unitPrice}元 / 发票 ${invItem.unitPrice}元（差${(priceDiff * 100).toFixed(1)}%）` });
    }
    if (invItem.taxRate !== poItem.taxRate) {
      diffs.push({ field: '税率', type: '不一致', detail: `${poItem.name}：PO ${(poItem.taxRate * 100).toFixed(0)}% / 发票 ${(invItem.taxRate * 100).toFixed(0)}%` });
    }
  }
  return diffs;
}

export function registerMatchRoutes(app) {
  // 导入案例并执行规则匹配
  app.post('/api/match/import', async (_req, res) => {
    const cases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    await q('DELETE FROM match_case');
    await q("DELETE FROM approval_log WHERE ref_type='match_case'");
    let autoPassed = 0, diffCases = 0;
    for (const c of cases) {
      const diffs = ruleMatch(c);
      const status = diffs.length === 0 ? 'auto_passed' : 'pending';
      if (!diffs.length) autoPassed++; else diffCases++;
      await q(
        'INSERT INTO match_case (case_no, po, receipt, invoice, diff, disposition, status) VALUES (?,?,?,?,?,?,?)',
        [c.caseNo, JSON.stringify(c.po), JSON.stringify(c.receipt), JSON.stringify(c.invoice), diffs.length ? JSON.stringify(diffs) : null, diffs.length ? null : 'auto_pass', status]
      );
    }
    emit('match:imported', { total: cases.length, autoPassed, diffCases });
    res.json({ total: cases.length, autoPassed, diffCases });
  });

  app.get('/api/match/cases', async (_req, res) => {
    const rows = await q('SELECT * FROM match_case ORDER BY id');
    const aps = await q("SELECT ref_id, id, status, decided_by, decided_at, reject_reasons FROM approval_log WHERE ref_type='match_case' AND status IN ('pending','approved','rejected')");
    const apByRef = new Map(aps.map(a => [a.ref_id, a]));
    res.json(rows.map(r => ({
      ...r,
      po: typeof r.po === 'string' ? JSON.parse(r.po) : r.po,
      receipt: typeof r.receipt === 'string' ? JSON.parse(r.receipt) : r.receipt,
      invoice: typeof r.invoice === 'string' ? JSON.parse(r.invoice) : r.invoice,
      diff: typeof r.diff === 'string' ? JSON.parse(r.diff) : r.diff,
      analysis: typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis,
      approval: apByRef.get(r.id) ?? null,
    })));
  });

  // LLM差异归因 → 生成处置提案（待人工审批）
  app.post('/api/match/analyze', async (_req, res) => {
    const rows = await q("SELECT * FROM match_case WHERE status='pending' AND diff IS NOT NULL");
    res.json({ started: true, total: rows.length });
    let done = 0;
    for (const row of rows) {
      const diff = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff;
      const po = typeof row.po === 'string' ? JSON.parse(row.po) : row.po;
      const inv = typeof row.invoice === 'string' ? JSON.parse(row.invoice) : row.invoice;
      const rc = typeof row.receipt === 'string' ? JSON.parse(row.receipt) : row.receipt;
      try {
        const completion = await llm.chat.completions.create({
          model: MODEL,
          temperature: 0.2,
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              `你是应付账款三单匹配的差异分析助手。分析以下差异并给出处置建议。只输出JSON。`,
              ``,
              `【采购订单】${JSON.stringify(po)}`,
              `【收货单】${JSON.stringify(rc ?? '未录入')}`,
              `【发票】${JSON.stringify(inv)}`,
              `【规则引擎发现的差异】${JSON.stringify(diff)}`,
              ``,
              `输出：{"cause":"差异原因(一句话)","evidence":"依据(引用具体字段数值)","disposition":"exempt|reject_invoice|hold|adjust","reasoning":"处置理由"}`,
              `处置选项：exempt=容差内或可解释差异,审批后按发票金额入账；reject_invoice=发票有误,退回供应商换开；hold=信息不全(如缺收货单),暂挂等待补录；adjust=需补PO或账务调整后重匹。`,
            ].join('\n'),
          }],
        });
        let txt = (completion.choices[0].message.content || '').trim().replace(/^```(json)?/m, '').replace(/```$/m, '').trim();
        const card = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
        await q('UPDATE match_case SET analysis=?, status=? WHERE id=?', [JSON.stringify(card), 'proposing', row.id]);
        await q(
          "INSERT INTO approval_log (scenario, ref_type, ref_id, title, card, status) VALUES ('match','match_case',?,?,?,'pending')",
          [row.id, `${row.case_no} · ${diff[0]?.type ?? '差异'}处置`, JSON.stringify({ ...card, diff, caseNo: row.case_no })]
        );
      } catch (e) {
        console.error('[match-analyze]', row.case_no, e.message);
      }
      done++;
      emit('match:progress', { done, total: rows.length });
    }
    emit('match:done', {});
  });
}
