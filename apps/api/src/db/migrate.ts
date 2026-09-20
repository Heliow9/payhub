import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from './mysql.js';

type MigrationKeyColumn = 'id' | 'name';
type MigrationRunStatus = 'RUNNING' | 'APPLIED' | 'FAILED';

export function detectMigrationKeyColumn(columns: Array<{ Field: string }>): MigrationKeyColumn {
  if (columns.some((column) => column.Field === 'id')) return 'id';
  if (columns.some((column) => column.Field === 'name')) return 'name';
  throw new Error('schema_migrations não possui uma coluna de identificação compatível (id ou name).');
}

export function incompleteMigrationMessage(file: string, status: MigrationRunStatus): string {
  return `A migration ${file} possui execução ${status}. Não execute novamente automaticamente: restaure o backup ou faça uma recuperação manual validada antes de liberar uma nova tentativa.`;
}

export function splitStatements(sql: string): string[] {
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

async function prepareMigrationTables(pool: Pool): Promise<MigrationKeyColumn> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(190) NOT NULL,
    applied_at DATETIME NOT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [columns] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM schema_migrations');
  const keyColumn = detectMigrationKeyColumn(columns.map((row) => ({ Field: String(row.Field) })));
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migration_runs (
    migration_id VARCHAR(190) NOT NULL,
    status ENUM('RUNNING','APPLIED','FAILED') NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    error_message TEXT NULL,
    PRIMARY KEY (migration_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  return keyColumn;
}

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  const [[lockRow]] = await pool.query<RowDataPacket[]>(`SELECT GET_LOCK('payhub_schema_migrations', 30) acquired`);
  if (Number(lockRow?.acquired) !== 1) throw new Error('Não foi possível obter o lock exclusivo de migrations.');
  try {
    const keyColumn = await prepareMigrationTables(pool);
    const files = (await fs.readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const file of files) {
      const [appliedRows] = await pool.execute<RowDataPacket[]>(
        `SELECT \`${keyColumn}\` FROM schema_migrations WHERE \`${keyColumn}\`=? LIMIT 1`,
        [file],
      );
      if (appliedRows.length) { console.log(`skip ${file}`); continue; }

      const [runRows] = await pool.execute<RowDataPacket[]>(
        'SELECT status FROM schema_migration_runs WHERE migration_id=? LIMIT 1',
        [file],
      );
      if (runRows[0]) throw new Error(incompleteMigrationMessage(file, String(runRows[0].status) as MigrationRunStatus));

      await pool.execute(
        `INSERT INTO schema_migration_runs (migration_id,status,started_at,finished_at,error_message)
         VALUES (?,'RUNNING',UTC_TIMESTAMP(),NULL,NULL)`,
        [file],
      );
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const statement of splitStatements(sql)) await connection.query(statement);
        await connection.execute(
          `INSERT INTO schema_migrations (\`${keyColumn}\`, applied_at) VALUES (?, UTC_TIMESTAMP())`,
          [file],
        );
        await connection.execute(
          `UPDATE schema_migration_runs SET status='APPLIED',finished_at=UTC_TIMESTAMP(),error_message=NULL WHERE migration_id=?`,
          [file],
        );
        await connection.commit();
        console.log(`applied ${file}`);
      } catch (error) {
        await connection.rollback();
        await pool.execute(
          `UPDATE schema_migration_runs SET status='FAILED',finished_at=UTC_TIMESTAMP(),error_message=? WHERE migration_id=?`,
          [error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000), file],
        );
        throw error;
      } finally {
        connection.release();
      }
    }
  } finally {
    await pool.query(`SELECT RELEASE_LOCK('payhub_schema_migrations')`);
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const pool = createMySqlPool(loadEnv());
  const here = path.dirname(fileURLToPath(import.meta.url));
  try {
    await runMigrations(pool, path.join(here, 'migrations'));
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) await main();
