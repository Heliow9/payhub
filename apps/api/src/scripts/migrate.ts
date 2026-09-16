import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';

loadDotEnv();
const env = loadEnv();

if (!/^[A-Za-z0-9_]+$/.test(env.MYSQL_DATABASE)) {
  throw new Error('MYSQL_DATABASE contém caracteres inválidos.');
}

const admin = await mysql.createConnection({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
});
await admin.query(
  `CREATE DATABASE IF NOT EXISTS \`${env.MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
await admin.end();

const migrations = ['001_core.sql', '002_sage_connector.sql'];
const connection = await mysql.createConnection({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  multipleStatements: true,
});
for (const migration of migrations) {
  const migrationPath = resolve(process.cwd(), `src/infra/db/migrations/${migration}`);
  const sql = await readFile(migrationPath, 'utf8');
  await connection.query(sql);
  console.log(`Migration ${migration} aplicada em ${env.MYSQL_DATABASE}.`);
}
await connection.end();
