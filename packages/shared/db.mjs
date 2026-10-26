import mysql from 'mysql2/promise';
import 'dotenv/config';

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ai_workbench',
  connectionLimit: 5,
  connectTimeout: 15000,
  decimalNumbers: true,
  charset: 'utf8mb4',
};

let pool;
export function getPool() {
  if (!pool) pool = mysql.createPool(dbConfig);
  return pool;
}

export async function q(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function qOne(sql, params) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}
