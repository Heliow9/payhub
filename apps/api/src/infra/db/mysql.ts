import mysql, { type Pool } from 'mysql2/promise';
import type { Env } from '../../config/env.js';

export function createMySqlPool(env: Env): Pool {
  return mysql.createPool({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });
}
