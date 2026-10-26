// 初始化数据库：建表 + 造数（--reset 先清空重建）
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { getPool } from '../../packages/shared/db.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const reset = process.argv.includes('--reset');
const pool = getPool();

const ALL_TABLES = ['analytics_event', 'session_map', 'approval_log', 'gov_case', 'match_case', 'sql_example', 'sql_query_log',
  'screening_result', 'resume', 'jd', 'biz_case', 'refund', 'order_item', 'orders', 'product', 'category', 'customer', 'region'];

if (reset) {
  console.log('重置模式：清空全部表...');
  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ALL_TABLES) await pool.query(`DROP TABLE IF EXISTS ${t}`);
  await pool.query('SET FOREIGN_KEY_CHECKS=1');
}

console.log('执行 schema...');
const ddl = fs.readFileSync(path.join(__dirname, '01-schema.sql'), 'utf8');
// 按分号切分后，剥离块内的 -- 注释行（避免整块语句被误过滤）
const stmts = ddl
  .split(/;\s*\n/)
  .map(x => x.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim())
  .filter(x => x.length > 0);
for (const stmt of stmts) {
  await pool.query(stmt);
}
console.log('schema 完成');

const { seedEcommerce } = await import('./02-seed-ecommerce.mjs');
console.log('生成电商演示数据...');
await seedEcommerce();

console.log('数据库初始化完成');
await pool.end();
