import type { RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';

loadDotEnv();
const env = loadEnv();
const pool = createMySqlPool(env);

const checks: Array<{ name: string; sql: string; expected: number }> = [
  {
    name: 'active_schedules_without_weekdays',
    expected: 0,
    sql: `SELECT COUNT(*) value FROM group_schedules WHERE enabled=1 AND (weekdays_mask IS NULL OR weekdays_mask=0)`,
  },
  {
    name: 'enqueued_schedule_without_run',
    expected: 0,
    sql: `SELECT COUNT(*) value FROM schedule_executions WHERE status='ENQUEUED' AND payroll_run_id IS NULL`,
  },
  {
    name: 'schedule_run_reference_mismatch',
    expected: 0,
    sql: `SELECT COUNT(*) value
            FROM schedule_executions x
            JOIN payroll_runs r ON r.id=x.payroll_run_id
           WHERE x.payroll_run_id IS NOT NULL
             AND (r.company_id<>x.company_id OR r.group_id<>x.group_id OR r.schedule_execution_id<>x.id)`,
  },
  {
    name: 'scheduled_runs_without_import_job',
    expected: 0,
    sql: `SELECT COUNT(*) value
            FROM payroll_runs r
           WHERE r.source='SCHEDULED'
             AND r.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)
             AND NOT EXISTS (
               SELECT 1 FROM import_jobs j
                WHERE j.company_id=r.company_id AND j.payroll_run_id=r.id AND j.job_type='PAYROLL_IMPORT'
             )`,
  },
  {
    name: 'recent_scheduled_runs_without_timeline',
    expected: 0,
    sql: `SELECT COUNT(*) value
            FROM payroll_runs r
           WHERE r.source='SCHEDULED'
             AND r.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)
             AND NOT EXISTS (
               SELECT 1 FROM payroll_run_events e WHERE e.company_id=r.company_id AND e.payroll_run_id=r.id
             )`,
  },
  {
    name: 'stale_schedule_claims',
    expected: 0,
    sql: `SELECT COUNT(*) value
            FROM schedule_executions
           WHERE status='CLAIMED' AND payroll_run_id IS NULL
             AND claim_lease_until<UTC_TIMESTAMP()`,
  },
];

let failed = false;
try {
  for (const check of checks) {
    const [rows] = await pool.query<RowDataPacket[]>(check.sql);
    const value = Number(rows[0]?.value ?? 0);
    const ok = value === check.expected;
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${check.name}: ${value} (esperado ${check.expected})`);
    if (!ok) failed = true;
  }
} finally {
  await pool.end();
}
if (failed) process.exitCode = 1;
