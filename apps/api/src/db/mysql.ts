import mysql, { type Pool } from 'mysql2/promise';
import type { Env } from '../config/env.js';

export function createMySqlPool(env: Env): Pool {
  return mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectionLimit: 12,
    waitForConnections: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    namedPlaceholders: false
  });
}
