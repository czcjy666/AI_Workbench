// 政务预审场景 —— 案例载入 + opencode gov agent 预审 → 人工复核
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { q } from '../../packages/shared/db.mjs';
import { opencode } from './opencode.mjs';
import { emit } from './bus.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', '..', 'mock-data', 'gov-cases.json');

export function registerGovRoutes(app) {
  app.post('/api/gov/cases', async (_req, res) => {
    const cases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    await q('DELETE FROM gov_case');
    await q("DELETE FROM approval_log WHERE ref_type='gov_case'");
    for (const c of cases) {
      await q(
        'INSERT INTO gov_case (matter, applicant, files, status) VALUES (?,?,?,?)',
        [c.matter, c.applicant, JSON.stringify({ caseNo: c.caseNo, businessType: c.businessType, files: c.files }), 'pending']
      );
    }
    emit('gov:imported', { total: cases.length });
    res.json({ total: cases.length });
  });

  app.get('/api/gov/cases', async (_req, res) => {
    const rows = await q('SELECT * FROM gov_case ORDER BY id');
    const aps = await q("SELECT ref_id, id, status, decided_by, decided_at FROM approval_log WHERE ref_type='gov_case' AND status IN ('pending','approved','rejected')");
    const apByRef = new Map(aps.map(a => [a.ref_id, a]));
    res.json(rows.map(r => ({
      ...r,
      files: typeof r.files === 'string' ? JSON.parse(r.files) : r.files,
      report: typeof r.report === 'string' ? JSON.parse(r.report) : r.report,
      approval: apByRef.get(r.id) ?? null,
    })));
  });

  // 拉起gov agent预审单个案例
  app.post('/api/gov/:id/precheck', async (req, res) => {
    const row = await q('SELECT * FROM gov_case WHERE id=?', [req.params.id]);
    const c = row[0];
    if (!c) return res.status(404).json({ error: '案例不存在' });
    await q("UPDATE gov_case SET status='analyzing' WHERE id=?", [c.id]);

    const files = typeof c.files === 'string' ? JSON.parse(c.files) : c.files;
    const session = await opencode.createSession({ title: `政务预审#${c.id}`, agent: 'gov' });
    await q(
      'INSERT INTO session_map (opencode_session_id, scenario, ref_type, ref_id) VALUES (?,?,?,?)',
      [session.id, 'gov', 'gov_case', c.id]
    );
    const prompt = [
      `申请编号：${files.caseNo}`,
      `办理事项：${c.matter}`,
      `申请人：${c.applicant}`,
      `拟经营范围：${files.businessType}`,
      ``,
      `已提交材料（含OCR/窗口提取信息）：`,
      JSON.stringify(files.files, null, 1),
      ``,
      `请按预审规则核对并提交预审报告。caseId=${c.id}，ref_type="gov_case"。`,
    ].join('\n');

    opencode.sendMessage(session.id, { text: prompt, agent: 'gov' }).catch(async e => {
      console.error('[gov] 发送失败:', e.message);
      await q("UPDATE gov_case SET status='pending' WHERE id=?", [c.id]).catch(() => {});
    });
    emit('gov:precheck', { caseId: c.id });
    res.json({ started: true, sessionId: session.id });
  });
}
