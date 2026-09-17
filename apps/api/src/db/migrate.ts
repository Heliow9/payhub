import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from './mysql.js';

loadDotEnv();
const env = loadEnv();
const pool = createMySqlPool(env);

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');

function splitStatements(sql: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  for (const ch of sql) {
    current += ch;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote) { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === ';') {
      const statement = current.slice(0, -1).trim();
      if (statement) result.push(statement);
      current = '';
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(190) NOT NULL,
    applied_at DATETIME NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const files = (await fs.readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const [rows] = await pool.execute<any[]>('SELECT id FROM schema_migrations WHERE id=? LIMIT 1', [file]);
    if (rows.length) { console.log(`skip ${file}`); continue; }
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const statement of splitStatements(sql)) await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (id, applied_at) VALUES (?, UTC_TIMESTAMP())', [file]);
      await connection.commit();
      console.log(`applied ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
} finally {
  await pool.end();
}
