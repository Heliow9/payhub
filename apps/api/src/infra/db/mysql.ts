import mysql, { type Pool } from 'mysql2/promise';
import type { Env } from '../../config/env.js';

export function createMySqlPool(env: Env): Pool {
  return mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });
}
