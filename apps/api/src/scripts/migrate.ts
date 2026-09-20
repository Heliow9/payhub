import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';

loadDotEnv();
const env = loadEnv();

if (!/^[A-Za-z0-9_]+$/.test(env.DB_NAME)) {
  throw new Error('DB_NAME contém caracteres inválidos.');
}

const admin = await mysql.createConnection({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
await admin.query(
  `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
await admin.end();

const migrations = ['001_core.sql', '002_sage_connector.sql'];
const connection = await mysql.createConnection({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  multipleStatements: true,
});
for (const migration of migrations) {
  const migrationPath = resolve(process.cwd(), `src/infra/db/migrations/${migration}`);
  const sql = await readFile(migrationPath, 'utf8');
  await connection.query(sql);
  console.log(`Migration ${migration} aplicada em ${env.DB_NAME}.`);
}
await connection.end();
