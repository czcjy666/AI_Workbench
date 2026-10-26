// 简历初筛场景 —— 载入/解析简历库、批量LLM打分（直连）、盲筛、导出
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import { q, qOne } from '../../packages/shared/db.mjs';
import { emit } from './bus.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const RESUME_DIR = path.join(__dirname, '..', '..', 'mock-data', 'resumes');
const FILES_DIR = path.join(RESUME_DIR, 'files');

const llm = new OpenAI({
  baseURL: process.env.LLM_BASE || 'https://token.sensenova.cn/v1',
  apiKey: process.env.LLM_KEY,
  timeout: 90000,
});
const MODEL = process.env.LLM_MODEL || 'sensenova-6.8-flash-lite';

async function parseFile(file, format, ocrText) {
  if (format === 'scan') return ocrText ?? '';
  const buf = fs.readFileSync(path.join(FILES_DIR, file));
  if (format === 'pdf') {
    const parser = new PDFParse({ data: buf });
    const d = await parser.getText();
    await parser.destroy();
    return d.text;
  }
  if (format === 'docx') {
    const d = await mammoth.extractRawText({ buffer: buf });
    return d.value;
  }
  return '';
}

function anonymize(text, meta) {
  return text
    .split('\n')
    .map(line => {
      if (line.trim() === meta.name) return '候选人';
      if (line.includes('岁') && (line.includes('男') || line.includes('女'))) {
        return line.replace(/[男女]/, '*').replace(/\d+岁/, '**岁');
      }
      return line;
    })
    .join('\n');
}

export function registerResumeRoutes(app) {
  // 一键载入演示简历库
  app.post('/api/resumes/seed', async (_req, res) => {
    const index = JSON.parse(fs.readFileSync(path.join(RESUME_DIR, 'index.json'), 'utf8'));
    const existing = new Set((await q('SELECT file_name FROM resume')).map(r => r.file_name));
    let inserted = 0, failed = 0;
    for (const meta of index) {
      if (existing.has(meta.file)) continue;
      try {
        const text = await parseFile(meta.file, meta.format, meta.ocrText);
        const parseOk = text.trim().length > 20 ? 1 : 0;
        await q(
          'INSERT INTO resume (file_name, file_type, raw_text, anonymized_text, parse_ok, edge_tags) VALUES (?,?,?,?,?,?)',
          [meta.file, meta.format, text, anonymize(text, meta), parseOk, JSON.stringify(meta.tags)]
        );
        inserted++;
      } catch (e) {
        failed++;
        console.error('[resume-seed]', meta.file, e.message);
      }
    }
    emit('resume:seeded', { inserted, failed });
    res.json({ inserted, failed, total: index.length });
  });

  app.get('/api/resumes', async (_req, res) => {
    const rows = await q('SELECT id, file_name, file_type, parse_ok, edge_tags, uploaded_at FROM resume ORDER BY id');
    res.json(rows.map(r => ({ ...r, edge_tags: typeof r.edge_tags === 'string' ? JSON.parse(r.edge_tags) : r.edge_tags })));
  });

  app.get('/api/jds', async (_req, res) => {
    res.json(await q('SELECT id, title, dept, content, hard_req FROM jd ORDER BY id'));
  });

  // 批量AI初筛（网关直连LLM并行）
  app.post('/api/screening/start', async (req, res) => {
    const { jdId, blind = true } = req.body || {};
    const jd = await qOne('SELECT * FROM jd WHERE id=?', [jdId]);
    if (!jd) return res.status(404).json({ error: 'JD不存在' });
    const hardReq = typeof jd.hard_req === 'string' ? JSON.parse(jd.hard_req) : jd.hard_req;

    // 清掉该JD旧的待审结果（幂等重跑）
    await q("UPDATE screening_result sr JOIN approval_log a ON a.ref_type='screening' AND a.ref_id=sr.id SET a.status='expired' WHERE sr.jd_id=? AND sr.status='pending'", [jdId]);
    await q("DELETE FROM screening_result WHERE jd_id=? AND status='pending'", [jdId]);

    const resumes = await q('SELECT * FROM resume');
    res.json({ started: true, total: resumes.length });

    const run = resumes.map((r, i) => ({ r, i }));
    const CONCURRENCY = 5;
    let done = 0;
    let cursor = 0;
    async function worker() {
      while (cursor < run.length) {
        const item = run[cursor++];
        const r = item.r;
        const text = blind ? r.anonymized_text : r.raw_text;
        const prompt = [
          `你是招聘初筛助手，对候选人简历做初筛评估。只输出JSON，不要markdown代码块。`,
          ``,
          `【岗位JD】${jd.title}（${jd.dept}）`,
          jd.content,
          `【硬性条件】${hardReq.join('；')}`,
          ``,
          `【候选人简历${blind ? '（已脱敏：隐去姓名/性别/年龄）' : ''}】`,
          text,
          ``,
          `输出JSON格式：`,
          `{"score":0-100整数,"hardChecks":[{"req":"硬性条件","result":"pass|fail|unclear","evidence":"简历原文依据"}],"matches":[{"point":"匹配点","evidence":"简历原文引用"}],"risks":[{"point":"风险点","evidence":"简历原文引用","question":"建议面试追问的问题"}],"questions":["建议面试问题1","2","3"],"summary":"一句话评价"}`,
          `规则：evidence必须引用简历原文片段；信息缺失或模糊标unclear，禁止猜测；工作年限、时间线要自己核算（不要采信简历自述年限，按经历起止时间计算）；最多3个matches、3个risks、3个questions。`,
        ].join('\n');
        let card = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 2 && !card; attempt++) {
          try {
            const completion = await llm.chat.completions.create({
              model: MODEL,
              messages: [{ role: 'user', content: prompt }],
              temperature: attempt === 0 ? 0.2 : 0,
              max_tokens: 3000,
            });
            let txt = (completion.choices[0].message.content || '').trim();
            txt = txt.replace(/^```(json)?/m, '').replace(/```$/m, '').trim();
            const start = txt.indexOf('{'); const end = txt.lastIndexOf('}');
            card = JSON.parse(txt.slice(start, end + 1));
          } catch (e) {
            lastErr = e;
          }
        }
        if (!card) {
          console.error('[screening]', r.id, lastErr?.message);
        } else {
          const ins = await q(
            'INSERT INTO screening_result (resume_id, jd_id, score, card, blind, status) VALUES (?,?,?,?,?,?)',
            [r.id, jdId, card.score ?? 0, JSON.stringify(card), blind ? 1 : 0, 'pending']
          );
          await q(
            "INSERT INTO approval_log (scenario, ref_type, ref_id, title, card, status) VALUES ('resume','screening',?,?,?,'pending')",
            [ins.insertId, `候选人#${r.id} · ${jd.title} · ${card.score}分`, JSON.stringify({ ...card, resumeId: r.id, blind })]
          );
        }
        done++;
        emit('screening:progress', { done, total: run.length, jdId });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    emit('screening:done', { total: run.length, jdId });
  });

  app.get('/api/screening', async (req, res) => {
    const { jdId } = req.query;
    const rows = await q(
      `SELECT sr.*, r.file_name, r.edge_tags, r.parse_ok,
              a.id AS approval_id, a.status AS approval_status, a.decided_by, a.decided_at
       FROM screening_result sr
       JOIN resume r ON r.id = sr.resume_id
       LEFT JOIN approval_log a ON a.ref_type='screening' AND a.ref_id=sr.id
            AND a.status IN ('pending','approved','rejected')
       ${jdId ? 'WHERE sr.jd_id=?' : ''} ORDER BY sr.score DESC`,
      jdId ? [jdId] : []
    );
    const out = rows.map(r => ({
      ...r,
      card: typeof r.card === 'string' ? JSON.parse(r.card) : r.card,
      edge_tags: typeof r.edge_tags === 'string' ? JSON.parse(r.edge_tags) : r.edge_tags,
      reject_reasons: typeof r.reject_reasons === 'string' ? JSON.parse(r.reject_reasons) : r.reject_reasons,
    }));
    res.json(out);
  });

  // 导出入围名单（CSV，Excel兼容BOM）
  app.get('/api/screening/export', async (req, res) => {
    const { jdId } = req.query;
    const rows = await q(
      `SELECT sr.score, sr.card, r.file_name, r.raw_text
       FROM screening_result sr JOIN resume r ON r.id = sr.resume_id
       WHERE sr.jd_id=? AND sr.status='approved' ORDER BY sr.score DESC`,
      [jdId ?? 0]
    );
    const parseName = (fn) => (fn.match(/_(.+)\.(pdf|docx)$/)?.[1] ?? fn);
    const head = '姓名,得分,一句话评价,文件';
    const lines = rows.map(r => {
      const card = typeof r.card === 'string' ? JSON.parse(r.card) : r.card;
      const sum = (card?.summary ?? '').replace(/["\n,，]/g, ' ');
      return `${parseName(r.file_name)},${r.score},${sum},${r.file_name}`;
    });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="shortlist_jd${jdId}.csv"`);
    res.send('\ufeff' + [head, ...lines].join('\n'));
  });
}
