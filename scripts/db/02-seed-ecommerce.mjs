// 电商演示数据生成器 —— 确定性随机(可复现)，约4万行，带季节性与大促峰值
import url from 'node:url';
import { getPool } from '../../packages/shared/db.mjs';
import { REGION_SPLIT } from '../../packages/shared/metrics.mjs';

// mulberry32 确定性RNG
let s = 20261026;
const rnd = () => {
  s |= 0; s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const ri = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const CATEGORIES = {
  '手机数码': { brands: ['星驰', '蔚蓝', '极光', '声浪'], price: [199, 6999], models: ['手机', '平板', '蓝牙耳机', '智能手表', '移动电源'] },
  '家用电器': { brands: ['恒丰', '冷韵', '暖阳', '洁灵'], price: [99, 5999], models: ['空调', '冰箱', '洗衣机', '电饭煲', '吸尘器'] },
  '服饰鞋包': { brands: ['棉里', '行走', '织造局', '南风尚'], price: [49, 1299], models: ['T恤', '卫衣', '休闲裤', '运动鞋', '双肩包'] },
  '美妆个护': { brands: ['澄肌', '花时', '素研', '沐野'], price: [29, 899], models: ['精华液', '面霜', '洗发水', '口红', '防晒霜'] },
  '食品生鲜': { brands: ['田禾', '鲜达', '味库', '山选'], price: [9, 399], models: ['坚果', '大米', '牛奶', '牛排', '水果礼盒'] },
  '母婴用品': { brands: ['幼芽', '抱抱熊', '亲柔', '贝护'], price: [19, 1599], models: ['纸尿裤', '婴儿床', '奶瓶', '玩具', '安全座椅'] },
  '家居家装': { brands: ['木言', '素居', '灯河', '织梦'], price: [15, 4999], models: ['台灯', '收纳柜', '四件套', '沙发', '香薰机'] },
  '运动户外': { brands: ['野径', '驰风', '攀云', '湖光'], price: [39, 2999], models: ['瑜伽垫', '帐篷', '登山杖', '骑行头盔', '跑步鞋'] },
  '图书文娱': { brands: ['文津', '阅野', '纸间', '绘本家'], price: [12, 299], models: ['小说', '科普绘本', '考试用书', '有声书卡', '拼图'] },
  '宠物生活': { brands: ['喵屿', '汪营', '毛友', '爪印'], price: [15, 999], models: ['猫粮', '狗粮', '猫爬架', '宠物窝', '自动喂食器'] },
};

const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蔡蒋余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
const GIVENS = ['伟', '芳', '娜', '敏', '静', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀英', '霞', '平', '刚', '桂英', '晨曦', '子墨', '雨桐', '浩然', '欣怡', '梓涵', '志远', '嘉禾', '若彤', '景行'];

const CITY_BY_PROV = {
  '北京': '北京', '天津': '天津', '河北': '石家庄', '山西': '太原', '内蒙古': '呼和浩特',
  '上海': '上海', '江苏': '南京', '浙江': '杭州', '安徽': '合肥', '福建': '福州', '江西': '南昌', '山东': '济南',
  '广东': '广州', '广西': '南宁', '海南': '海口',
  '重庆': '重庆', '四川': '成都', '贵州': '贵阳', '云南': '昆明', '西藏': '拉萨',
  '陕西': '西安', '甘肃': '兰州', '青海': '西宁', '宁夏': '银川', '新疆': '乌鲁木齐',
  '辽宁': '沈阳', '吉林': '长春', '黑龙江': '哈尔滨',
};

const pad = (n, w) => String(n).padStart(w, '0');
function dt(y, m, d, h = 12) {
  return `${y}-${pad(m, 2)}-${pad(d, 2)} ${pad(h, 2)}:${pad(ri(0, 59), 2)}:${pad(ri(0, 59), 2)}`;
}

async function batchInsert(pool, table, cols, rows, size = 400) {
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ?`;
  for (let i = 0; i < rows.length; i += size) {
    await pool.query(sql, [rows.slice(i, i + size)]);
  }
  console.log(`  ${table}: ${rows.length} 行`);
}

export async function seedEcommerce() {
  const pool = getPool();

  // 1. 区域
  const regions = Object.entries(REGION_SPLIT).map(([name, provinces]) => ({
    name, provinces: JSON.stringify(provinces),
    note: name === '华南' ? '华南区口径：广东+广西+海南（含广西；不含港澳台；福建属华东）' : null,
  }));
  await batchInsert(pool, 'region', ['name', 'provinces', 'note'], regions.map(r => [r.name, r.provinces, r.note]));
  const regionIds = {};
  for (const r of await pool.query('SELECT id,name FROM region').then(([x]) => x)) regionIds[r.name] = r.id;

  // 2. 客户 2000
  const allProvs = Object.entries(REGION_SPLIT).flatMap(([rn, ps]) => ps.map(p => ({ p, rn })));
  const customers = [];
  for (let i = 1; i <= 2000; i++) {
    const { p, rn } = pick(allProvs);
    const level = rnd() < 0.06 ? '黑卡' : rnd() < 0.15 ? '金卡' : rnd() < 0.3 ? '银卡' : '普通';
    customers.push([`${pick(SURNAMES)}${pick(GIVENS)}`, p, CITY_BY_PROV[p], regionIds[rn], level, dt(2023 + ri(0, 2), ri(1, 12), ri(1, 28))]);
  }
  await batchInsert(pool, 'customer', ['name', 'province', 'city', 'region_id', 'level', 'registered_at'], customers);

  // 3. 类目 + 商品500
  const catIds = {};
  for (const [name, cfg] of Object.entries(CATEGORIES)) {
    const [r] = await pool.query('INSERT INTO category (name) VALUES (?)', [name]);
    catIds[name] = r.insertId;
    const products = [];
    for (let i = 0; i < 50; i++) {
      const brand = pick(cfg.brands);
      const model = pick(cfg.models);
      const [lo, hi] = cfg.price;
      const price = Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
      products.push([`SKU-C${pad(r.insertId, 2)}-${pad(i + 1, 4)}`, `${brand} ${model} ${pick(['Pro', 'Max', '青春版', '2026款', '旗舰版', ''])}`.trim(), r.insertId, brand, price]);
    }
    await batchInsert(pool, 'product', ['sku', 'name', 'category_id', 'brand', 'unit_price'], products, 50);
  }

  // 4. 订单 15000（2025-10 ~ 2026-10，618/双11峰值），明细，退款
  // 月度权重：2025年10-12月（10月1.15、双11=2.2、12月1.3），2026年1-10月（618=1.6）
  const monthBuckets = [];
  [[2025, 10, [1.15, 2.2, 1.3]], [2026, 1, [0.9, 0.85, 1.0, 0.95, 1.0, 1.6, 1.0, 0.95, 1.0, 1.1]]]
    .forEach(([y, startM, ws]) => ws.forEach((w, i) => monthBuckets.push({ y, m: startM + i, w })));
  const weightSum = monthBuckets.reduce((a, b) => a + b.w, 0);
  const N_ORDERS = 15000;

  const allProducts = (await pool.query('SELECT id,unit_price,category_id FROM product').then(([x]) => x));
  const catRows = Object.entries(catIds);
  // 类目长尾：销量偏斜权重（食品/服饰/美妆高频，宠物/图书低频）
  const catWeight = { '手机数码': 1.2, '家用电器': 0.8, '服饰鞋包': 1.6, '美妆个护': 1.5, '食品生鲜': 1.8, '母婴用品': 1.0, '家居家装': 1.0, '运动户外': 0.7, '图书文娱': 0.8, '宠物生活': 0.6 };
  const weightedCats = catRows.flatMap(([name, id]) => Array(Math.round(catWeight[name] * 10)).fill(id));

  // 爆款偏斜：约8%的商品是爆款(权重20~60)，其余权重1~4 —— 真实电商长尾分布
  const productPoolByCat = new Map();
  for (const p of allProducts) {
    const w = rnd() < 0.08 ? ri(20, 60) : ri(1, 4);
    const list = productPoolByCat.get(p.category_id) ?? [];
    for (let k = 0; k < w; k++) list.push(p);
    productPoolByCat.set(p.category_id, list);
  }

  const orders = []; const items = []; const refunds = [];
  let orderSeq = 100000;
  for (let i = 0; i < N_ORDERS; i++) {
    // 按权重选月
    let acc = rnd() * weightSum; let bucket = monthBuckets[0];
    for (const b of monthBuckets) { acc -= b.w; if (acc <= 0) { bucket = b; break; } }
    const day = bucket.m === 11 ? (rnd() < 0.4 ? ri(10, 13) : ri(1, 28)) : bucket.m === 6 && rnd() < 0.35 ? ri(16, 20) : ri(1, 28);
    const hour = ri(8, 23);
    const custIdx = ri(1, 2000);
    const cust = customers[custIdx - 1];
    const cancelled = rnd() < 0.10;
    const status = cancelled ? 'cancelled' : rnd() < 0.62 ? 'completed' : rnd() < 0.5 ? 'shipped' : 'paid';
    const created = dt(bucket.y, bucket.m, day, hour);
    const paid = cancelled ? null : dt(bucket.y, bucket.m, day, Math.min(23, hour + ri(0, 2)));
    orderSeq++;
    const orderId = i + 1;
    const freight = pick([0, 0, 0, 6, 8, 12]);
    // 1~3件商品
    const nItems = rnd() < 0.55 ? 1 : rnd() < 0.75 ? 2 : 3;
    let total = 0;
    const usedItems = [];
    for (let k = 0; k < nItems; k++) {
      const catId = pick(weightedCats);
      const pool = productPoolByCat.get(catId) ?? allProducts;
      const prod = pick(pool);
      const qty = rnd() < 0.6 ? 1 : rnd() < 0.85 ? 2 : ri(3, 6);
      const disc = rnd() < 0.3 ? 0.9 : 1.0; // 部分订单9折
      const unit = Math.round(prod.unit_price * disc * 100) / 100;
      const subtotal = Math.round(unit * qty * 100) / 100;
      total += subtotal;
      usedItems.push({ prod, qty, unit, subtotal });
    }
    total = Math.round(total * 100) / 100;
    orders.push([`SO${bucket.y}${pad(bucket.m, 2)}${pad(orderSeq, 8)}`, custIdx, cust[3], status, total, freight, created, paid]);
    usedItems.forEach((it, k) => {
      items.push([orderId, it.prod.id, it.qty, it.unit, it.subtotal]);
      // 退款：completed订单约5.5%概率按明细退
      if (status === 'completed' && rnd() < 0.055) {
        const rstat = rnd() < 0.8 ? 'success' : rnd() < 0.6 ? 'pending' : 'rejected';
        refunds.push([orderId, null, it.qty, it.subtotal, pick(['质量问题', '尺寸不符', '七天无理由', '发错货', '与描述不符']), rstat, dt(bucket.y, Math.min(12, bucket.m + ri(0, 1)), ri(1, 28))]);
      }
    });
  }
  await batchInsert(pool, 'orders', ['order_no', 'customer_id', 'region_id', 'status', 'pay_amount', 'freight', 'created_at', 'paid_at'], orders, 500);

  // order_item 的 order_id 直接用自增id（从1连续），refund 的 order_item_id 回填
  await batchInsert(pool, 'order_item', ['order_id', 'product_id', 'quantity', 'unit_price', 'subtotal'], items, 500);
  const itemRows = (await pool.query('SELECT id,order_id FROM order_item').then(([x]) => x));
  const firstItemByOrder = {};
  for (const it of itemRows) if (!(it.order_id in firstItemByOrder)) firstItemByOrder[it.order_id] = it.id;
  const refundRows = refunds.map(r => [r[0], firstItemByOrder[r[0]] ?? r[0], r[2], r[3], r[4], r[5], r[6]]);
  if (refundRows.length) await batchInsert(pool, 'refund', ['order_id', 'order_item_id', 'quantity', 'amount', 'reason', 'status', 'created_at'], refundRows, 500);

  const [[{ c: oc }]] = await pool.query('SELECT COUNT(*) c FROM orders');
  const [[{ c: ic }]] = await pool.query('SELECT COUNT(*) c FROM order_item');
  const [[{ c: rc }]] = await pool.query('SELECT COUNT(*) c FROM refund');
  console.log(`完成：订单${oc} 明细${ic} 退款${rc}`);
}

// 直接执行时自动运行（被 init.mjs import 时不自动跑）
if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  seedEcommerce().then(() => getPool().end()).catch(e => { console.error(e); process.exit(1); });
}
