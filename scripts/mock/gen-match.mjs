// 生成20组三单匹配测试数据：12组一致 + 8组埋差异（写入 mock-data/match-cases.json）
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'mock-data', 'match-cases.json');

const SUPPLIERS = ['华辰办公设备', '瑞丰实业', '盛源供应链', '锦程贸易', '天翼数码', '恒达百货'];
const GOODS = [
  { name: 'A4复印纸(箱)', price: 120 },
  { name: '激光打印机', price: 1580 },
  { name: '办公椅', price: 460 },
  { name: '显示器 24寸', price: 720 },
  { name: '键盘鼠标套装', price: 95 },
  { name: '碎纸机', price: 680 },
];

let s = 20261026;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const r2 = (n) => Math.round(n * 100) / 100;

function baseCase(no) {
  const supplier = pick(SUPPLIERS);
  const nItems = rnd() < 0.6 ? 1 : 2;
  const items = [];
  const used = new Set();
  for (let i = 0; i < nItems; i++) {
    let g = pick(GOODS); while (used.has(g.name)) g = pick(GOODS);
    used.add(g.name);
    const qty = ri(2, 20);
    const price = r2(g.price * (0.95 + rnd() * 0.1));
    items.push({ name: g.name, qty, unitPrice: price, taxRate: 0.13 });
  }
  const po = {
    poNo: `PO-2026${String(1000 + no)}`, supplier, date: `2026-0${ri(6, 9)}-1${ri(0, 8)}`,
    items: items.map(i => ({ ...i })),
  };
  const receipt = { receiptNo: `GRN-2026${String(1000 + no)}`, date: po.date.replace(/-1(\d)$/, '-2$1'), items: items.map(i => ({ name: i.name, qty: i.qty })) };
  const invItems = items.map(i => {
    const amount = r2(i.qty * i.unitPrice);
    return { ...i, amount, tax: r2(amount * i.taxRate) };
  });
  const invoice = {
    invoiceNo: `INV-2026${String(1000 + no)}`, date: receipt.date, buyer: '演示科技有限公司',
    items: invItems,
    totalAmount: r2(invItems.reduce((a, b) => a + b.amount, 0)),
    totalTax: r2(invItems.reduce((a, b) => a + b.tax, 0)),
  };
  return { po, receipt, invoice };
}

// 差异类型（对应三单业务知识文档的10类差异菜单）
const DIFFS = [
  {
    type: '调价未同步', apply: (c) => {
      c.po.items[0].unitPrice = r2(c.po.items[0].unitPrice * 1.12); // 发票按新价,PO旧价
      return '供应商已执行新价格，但PO未同步更新调价协议';
    },
  },
  {
    type: '短收', apply: (c) => {
      c.receipt.items[0].qty = Math.max(1, c.receipt.items[0].qty - ri(2, 5));
      return '部分货物尚未到库，发票按订单全量开票';
    },
  },
  {
    type: '重复开票', apply: (c) => { c.invoice.invoiceNo = 'INV-20261001'; c._dupOf = 'INV-20261001已在9月报销入账'; return '该发票号疑似与9月已入账发票重复（防重复付款）'; },
  },
  {
    type: '税额错误', apply: (c) => {
      c.invoice.items[0].taxRate = 0.09;
      const it = c.invoice.items[0];
      it.tax = r2(it.amount * 0.09);
      c.invoice.totalTax = r2(c.invoice.items.reduce((a, b) => a + b.tax, 0));
      return '发票适用税率9%与PO约定13%不符，税额少计';
    },
  },
  {
    type: '单位不一致', apply: (c) => {
      const i0 = c.invoice.items[0];
      i0.name = i0.name.replace('(箱)', '(包)');
      i0.qty = i0.qty * 5; i0.unitPrice = r2(i0.unitPrice / 5);
      i0.amount = r2(i0.qty * i0.unitPrice);
      c.invoice.totalAmount = r2(c.invoice.items.reduce((a, b) => a + b.amount, 0));
      return '发票按"包"开票、PO按"箱"下单（1箱=5包），需换算核对';
    },
  },
  {
    type: '提前开票', apply: (c) => { c.receipt = null; return '发票已到但收货单尚未录入（货在途），三单缺一'; },
  },
  {
    type: '运费未单列', apply: (c) => {
      const freight = 200;
      const i0 = c.invoice.items[0];
      i0.amount = r2(i0.amount + freight);
      c.invoice.totalAmount = r2(c.invoice.totalAmount + freight);
      c.invoice._freightIncluded = freight;
      return '发票金额含200元运费，PO为含运到岸价，费用归属需确认';
    },
  },
  {
    type: '擅自调价', apply: (c) => {
      c.invoice.items[0].unitPrice = r2(c.invoice.items[0].unitPrice * 1.15);
      const it = c.invoice.items[0];
      it.amount = r2(it.qty * it.unitPrice); it.tax = r2(it.amount * it.taxRate);
      c.invoice.totalAmount = r2(c.invoice.items.reduce((a, b) => a + b.amount, 0));
      c.invoice.totalTax = r2(c.invoice.items.reduce((a, b) => a + b.tax, 0));
      return '发票单价高于PO约定15%，无任何调价依据';
    },
  },
];

const cases = [];
for (let i = 1; i <= 20; i++) {
  const c = baseCase(i);
  let diffType = null, diffNote = null;
  if (i > 12) {
    const d = DIFFS[i - 13];
    diffType = d.type;
    diffNote = d.apply(c);
  }
  cases.push({ caseNo: `MC-2026${String(i).padStart(3, '0')}`, diffType, diffNote, po: c.po, receipt: c.receipt, invoice: c.invoice });
}

fs.writeFileSync(OUT, JSON.stringify(cases, null, 1));
console.log(`完成：20组三单（12一致 + 8差异）→ ${OUT}`);
console.log('差异类型:', cases.filter(c => c.diffType).map(c => c.diffType).join('、'));
