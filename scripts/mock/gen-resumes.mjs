// 50份Mock简历生成器 —— 30 PDF + 15 DOCX + 5"扫描件"（PDF+OCR结果JSON）
// 埋点：elite/gap/conflict/vague/bilingual/scan/trap（trap=演示AI误判+人工纠正的案例）
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'mock-data', 'resumes');
const FILES_DIR = path.join(OUT_DIR, 'files');
const FONT = 'C:/Windows/Fonts/simhei.ttf';

let s = 20261026;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蔡蒋余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
const GIVENS = ['伟', '芳', '娜', '敏', '静', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '晨曦', '子墨', '雨桐', '浩然', '欣怡', '梓涵', '志远', '嘉禾', '若彤', '景行'];

const SCHOOLS = {
  top: ['清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学', '中国科学技术大学'],
  good: ['武汉大学', '中山大学', '厦门大学', '东南大学', '华中科技大学', '西安电子科技大学', '华东师范大学'],
  normal: ['南京邮电大学', '杭州电子科技大学', '重庆邮电大学', '天津理工大学', '广东工业大学', '浙江工商大学'],
  college: ['某某职业技术学院', '某某信息工程学院', '某某城市学院'],
};
const CS_MAURS = ['计算机科学与技术', '软件工程', '信息管理', '电子信息工程', '数据科学与大数据技术'];
const OTHER_MAURS = ['市场营销', '工商管理', '电子商务', '国际经济与贸易', '物流管理'];

const IT_COMPANIES = {
  big: ['腾讯', '阿里巴巴', '字节跳动', '美团', '百度', '华为'],
  mid: ['携程', '哔哩哔哩', '小红书', '京东科技', '快手', '网易'],
  small: ['云启科技', '睿智互联', '恒星云创', '极点软件', '方寸网络', '锐码信息'],
};
const IT_TITLES = ['后端开发工程师', 'Java开发工程师', '服务端研发工程师', 'Go开发工程师', '全栈开发工程师'];
const FMCG_COMPANIES = ['宝洁', '联合利华', '玛氏', '农夫山泉', '元气森林', '蒙牛', '怡宝', '百威'];
const SALES_TITLES = ['区域销售代表', '渠道专员', 'KA客户经理', '销售主管', '门店销售顾问', '理货员'];

const IT_SKILLS = ['Java', 'Spring Boot', 'MySQL', 'Redis', 'Kafka', 'Go', 'gRPC', 'Docker', 'Kubernetes', 'Linux', 'RabbitMQ', 'MyBatis', '微服务', '分布式系统'];
const IT_BULLETS = [
  '负责订单中心微服务的设计与开发，支撑日均百万级订单',
  '参与库存系统的分库分表改造，查询性能提升3倍',
  '搭建服务监控告警体系，故障平均发现时间从10分钟降至1分钟',
  '负责支付网关对接与对账系统开发',
  '使用Redis+本地缓存优化热点数据访问，核心接口P99延迟降至80ms',
  '主导营销活动系统的设计，支撑双11大促流量',
];
const SALES_BULLETS = [
  '负责区域商超渠道的开拓与维护，年度完成销售目标120%',
  '管理区域内12家KA客户，季度回款率98%',
  '策划新品地推活动，单场活动转化新客300+',
  '负责门店陈列与理货管理，保障货架执行标准',
  '维护经销商关系，协调物流与售后问题',
];

function ym(y, m) { return `${y}.${String(m).padStart(2, '0')}`; }

// ── 生成单人档案 ─────────────────────────────
function makePersona(i, kind) {
  const name = pick(SURNAMES) + pick(GIVENS);
  const gender = rnd() < 0.55 ? '男' : '女';
  const birth = ri(1979, 2001);
  const phone = `1${pick(['3', '5', '7', '8', '9'])}${String(ri(100000000, 999999999)).slice(0, 9)}`;
  const email = `cand${i}@example.com`;
  const track = kind === 'sales' ? 'sales' : 'it';

  const eduTier = kind === 'elite' ? pick(['top', 'good']) : pick(['good', 'normal', 'normal', 'college', 'top']);
  const school = pick(SCHOOLS[eduTier]);
  const major = track === 'it' ? pick(CS_MAURS) : pick(OTHER_MAURS);
  const degree = eduTier === 'college' ? '大专' : rnd() < (kind === 'elite' ? 0.5 : 0.2) ? '硕士' : '本科';
  const gradYear = 2026 - ri(1, 10);

  const p = { i, name, gender, birth, phone, email, track, degree, school, major, gradYear, kind, jobs: [], skills: [] };

  // 工作经历
  const nJobs = kind === 'elite' ? 3 : track === 'it' ? ri(1, 3) : ri(1, 3);
  let cy = gradYear + (rnd() < 0.3 ? 0 : ri(0, 1)); // 入职起始年
  for (let j = 0; j < nJobs; j++) {
    const dur = ri(1, Math.max(1, 2025 - cy)); // 年
    const startM = ri(1, 12);
    const endY = Math.min(2026, cy + (dur > 3 ? 3 : dur));
    const co = track === 'it'
      ? (kind === 'elite' ? pick([...IT_COMPANIES.big, ...IT_COMPANIES.mid]) : pick([...IT_COMPANIES.small, ...IT_COMPANIES.mid, ...IT_COMPANIES.big]))
      : pick(FMCG_COMPANIES);
    const title = track === 'it' ? pick(IT_TITLES) : pick(SALES_TITLES);
    const bullets = track === 'it'
      ? [pick(IT_BULLETS), pick(IT_BULLETS)].filter((v, idx, a) => a.indexOf(v) === idx)
      : [pick(SALES_BULLETS)];
    p.jobs.push({ company: co, title, start: ym(cy, startM), end: ym(endY, ri(1, 12)), bullets });
    cy = endY + (rnd() < 0.15 ? 1 : 0);
    if (cy > 2025) break;
  }
  // 保证至少一段
  if (!p.jobs.length) p.jobs.push({ company: pick(IT_COMPANIES.small), title: pick(IT_TITLES), start: ym(gradYear + 1, 3), end: ym(Math.min(2026, gradYear + 3), 6), bullets: [pick(IT_BULLETS)] });
  p.skills = track === 'it' ? [pick(IT_SKILLS), pick(IT_SKILLS), pick(IT_SKILLS), pick(IT_SKILLS)].filter((v, i2, a) => a.indexOf(v) === i2) : ['渠道开拓', '客户管理', '谈判', '陈列管理', '经销商维护'].filter(() => rnd() < 0.7);

  // ── 埋点改造 ──
  p.tags = [];
  if (kind === 'gap') {
    // 在最近一段工作前插入8~14个月空窗
    const last = p.jobs[p.jobs.length - 1];
    const [ey, em] = last.start.split('.').map(Number);
    last.start = ym(ey + 1, Math.min(12, em + 2)); // 起始推迟>1年 → 空窗
    p.tags.push('gap');
    p.gapMonths = 8 + ri(0, 6);
  }
  if (kind === 'conflict') {
    // 两段经历时间重叠
    if (p.jobs.length < 2) p.jobs.push({ ...p.jobs[0] });
    const a = p.jobs[0], b = p.jobs[1];
    b.start = a.start; // 完全重叠
    p.tags.push('conflict');
  }
  if (kind === 'vague') {
    p.degreeNote = pick(['（成人教育）', '（结业，未取得学位）', '（进修班）']);
    p.tags.push('vague');
  }
  if (kind === 'trap_time') {
    // 自称3年经验，实际合计约1年
    p.jobs = [
      { company: pick(IT_COMPANIES.small), title: 'Java开发工程师', start: ym(2025, 9), end: ym(2026, 1), bullets: ['参与后台接口开发'] },
      { company: pick(IT_COMPANIES.small), title: '后端开发工程师', start: ym(2026, 3), end: ym(2026, 8), bullets: ['负责内部工具开发'] },
    ];
    p.claimYears = 3; // 简历自述"3年Java开发经验"
    p.tags.push('trap');
  }
  if (kind === 'trap_fmcg') {
    // JD2要求"3年以内快消销售经验"；此人是6年快消门店理货员（职能不符+超年限）
    p.jobs = [{ company: pick(FMCG_COMPANIES), title: '门店理货员', start: ym(2020, 5), end: ym(2026, 7), bullets: ['负责货架陈列与补货', '门店库存盘点'] }];
    p.claimNote = '6年快消行业工作经验';
    p.tags.push('trap');
  }
  if (kind === 'elite') p.tags.push('elite');
  if (kind === 'bilingual') p.tags.push('bilingual');
  if (kind === 'scan') p.tags.push('scan');
  if (kind === 'scan_missing') p.tags.push('scan', 'missing');
  return p;
}

// ── 简历文本渲染 ─────────────────────────────
function renderText(p) {
  const age = 2026 - p.birth;
  const lines = [];
  lines.push(p.name);
  lines.push(`${p.gender} | ${age}岁 | ${p.phone} | ${p.email}`);
  lines.push('—— 教育背景 ——');
  lines.push(`${p.school} · ${p.major} · ${p.degree}${p.degreeNote || ''}（${p.gradYear}年毕业）`);
  lines.push('—— 工作经历 ——');
  for (const j of p.jobs) {
    lines.push(`${j.company} | ${j.title} | ${j.start} - ${j.end}`);
    for (const b of j.bullets) lines.push(`· ${b}`);
  }
  lines.push('—— 技能 ——');
  lines.push(p.skills.join(' / '));
  if (p.claimYears) lines.push(`（自述：${p.claimYears}年开发经验）`);
  if (p.claimNote) lines.push(`（自述：${p.claimNote}）`);
  let text = lines.join('\n');
  if (p.tags.includes('bilingual')) {
    text += '\n\nWORK SUMMARY\n' + (p.jobs[0]?.bullets[0] ?? '') + '\nResponsible for backend service development and optimization; collaborated with cross-functional teams.\nSkills: Java, Spring Boot, MySQL, Distributed Systems.';
  }
  return text;
}

async function makePdf(p, file, scanStyle = false) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.registerFont('cn', FONT);
  doc.font('cn');
  if (scanStyle) { doc.rotate(0).fillColor('#222'); doc.fontSize(10.5); } else { doc.fillColor('#111'); doc.fontSize(11); }
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);
  let y = 50;
  for (const line of renderText(p).split('\n')) {
    if (y > 760) { doc.addPage(); y = 50; }
    doc.text(line, 50, y, { lineGap: scanStyle ? 6 : 3.5 });
    y += (scanStyle ? 22 : 19);
  }
  doc.end();
  await new Promise(res => stream.on('finish', res));
}

async function makeDocx(p, file) {
  const paras = renderText(p).split('\n').map((t, idx) =>
    new Paragraph({ children: [new TextRun({ text: t, bold: idx === 0, size: idx === 0 ? 30 : 21, font: 'Microsoft YaHei' })], spacing: { after: 60 } })
  );
  const d = new Document({ sections: [{ children: paras }] });
  const buf = await Packer.toBuffer(d);
  fs.writeFileSync(file, buf);
}

// ── 主流程 ─────────────────────────────
const PLAN = [];
// kind 分布：29 normal(it 16 / sales 13) + elite3 + gap5 + conflict4 + vague4 + bilingual3 + trap2 + scan5(含1 missing)
for (let i = 0; i < 13; i++) PLAN.push({ kind: 'it' });
for (let i = 0; i < 11; i++) PLAN.push({ kind: 'sales' });
PLAN.push({ kind: 'elite' }, { kind: 'elite' }, { kind: 'elite' });
for (let i = 0; i < 5; i++) PLAN.push({ kind: 'gap' });
for (let i = 0; i < 4; i++) PLAN.push({ kind: 'conflict' });
for (let i = 0; i < 4; i++) PLAN.push({ kind: 'vague' });
for (let i = 0; i < 3; i++) PLAN.push({ kind: 'bilingual' });
PLAN.push({ kind: 'trap_time' }, { kind: 'trap_fmcg' });
PLAN.push({ kind: 'scan' }, { kind: 'scan' }, { kind: 'scan' }, { kind: 'scan' }, { kind: 'scan_missing' });

const index = [];
fs.mkdirSync(FILES_DIR, { recursive: true });

let pdfN = 0, docxN = 0, scanN = 0;
for (let i = 0; i < PLAN.length; i++) {
  const p = makePersona(i + 1, PLAN[i].kind);
  const text = renderText(p);
  let file, format;
  if (p.tags.includes('scan')) {
    scanN++;
    file = `scan_${String(scanN).padStart(2, '0')}_${p.name}.pdf`;
    format = 'scan';
    await makePdf(p, path.join(FILES_DIR, file), true);
  } else if (pdfN < 30) {
    pdfN++;
    file = `resume_${String(pdfN).padStart(2, '0')}_${p.name}.pdf`;
    format = 'pdf';
    await makePdf(p, path.join(FILES_DIR, file));
  } else {
    docxN++;
    file = `resume_${String(docxN).padStart(2, '0')}_${p.name}.docx`;
    format = 'docx';
    await makeDocx(p, path.join(FILES_DIR, file));
  }
  index.push({
    file, format, name: p.name, gender: p.gender, age: 2026 - p.birth,
    phone: p.phone, email: p.email, degree: p.degree + (p.degreeNote || ''), school: p.school,
    track: p.track, tags: p.tags,
    ocrText: p.tags.includes('missing') ? text.split('\n').filter(l => !l.includes(p.phone) && !l.includes('—— 工作经历') && !/公司 \|/.test(l)).join('\n') : text,
  });
  // missing: OCR"漏识别"了工作经历段 → 解析结果缺关键信息
}

fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1));
console.log(`完成：${PLAN.length}份简历（PDF30 / DOCX${docxN} / 扫描件${scanN}），索引 mock-data/resumes/index.json`);
console.log('埋点分布:', JSON.stringify(index.reduce((m, r) => { for (const t of r.tags) m[t] = (m[t] || 0) + 1; return m; }, {})));
