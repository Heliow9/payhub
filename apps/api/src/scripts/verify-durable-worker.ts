import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';

export interface DurableWorkerCheck {
  name: string;
  value: number;
  expected: number;
  ok: boolean;
}

interface CheckRow extends RowDataPacket {
  name: string;
  value: number | string;
  expected: number | string;
}

export function durableWorkerVerificationSql(workerPollSeconds = 20): string {
  const staleSeconds = Math.max(60, Math.trunc(workerPollSeconds) * 6);
  return `
SELECT 'payroll_jobs_without_normalization_state' name, COUNT(*) value, 0 expected
  FROM import_jobs
 WHERE job_type='PAYROLL_IMPORT' AND status='COMPLETED' AND normalized_at IS NULL
   AND (normalization_state IS NULL OR normalization_state='COMPLETED')
UNION ALL
SELECT 'normalized_jobs_not_completed', COUNT(*), 0
  FROM import_jobs
 WHERE job_type='PAYROLL_IMPORT' AND normalized_at IS NOT NULL
   AND (normalization_state IS NULL OR normalization_state<>'COMPLETED')
UNION ALL
SELECT 'claimed_jobs_without_lease', COUNT(*), 0
  FROM import_jobs
 WHERE normalization_state='CLAIMED'
   AND (normalization_owner IS NULL OR normalization_owner='' OR normalization_lease_until IS NULL)
UNION ALL
SELECT 'completed_runs_with_unfinished_job', COUNT(*), 0
  FROM payroll_runs r
  JOIN import_jobs j ON j.payroll_run_id=r.id AND j.company_id=r.company_id AND j.job_type='PAYROLL_IMPORT'
 WHERE r.status IN ('COMPLETED','PARTIAL')
   AND NOT (j.status='COMPLETED' AND j.normalization_state='COMPLETED' AND j.normalized_at IS NOT NULL)
UNION ALL
SELECT 'running_runs_with_terminal_job', COUNT(*), 0
  FROM payroll_runs r
  JOIN import_jobs j ON j.payroll_run_id=r.id AND j.company_id=r.company_id AND j.job_type='PAYROLL_IMPORT'
 WHERE r.status='RUNNING'
   AND (j.status='FAILED' OR j.normalization_state IN ('COMPLETED','FAILED'))
UNION ALL
SELECT 'current_usable_payrolls_without_document', COUNT(*), 0
  FROM payrolls p
  LEFT JOIN payroll_documents d ON d.payroll_id=p.id
 WHERE p.is_current=1 AND p.status IN ('READY','SIGNATURE_REQUESTED','VIEWED','SIGNED')
   AND (d.payroll_id IS NULL OR d.original_path IS NULL OR d.original_path='' OR d.original_sha256 IS NULL OR d.original_sha256='')
UNION ALL
SELECT 'signed_payrolls_without_signed_hash', COUNT(*), 0
  FROM payrolls p
  LEFT JOIN payroll_documents d ON d.payroll_id=p.id
 WHERE p.is_current=1 AND p.status='SIGNED'
   AND (d.payroll_id IS NULL OR d.signed_path IS NULL OR d.signed_path='' OR d.signed_sha256 IS NULL OR d.signed_sha256='')
UNION ALL
SELECT 'notification_outbox_company_mismatch', COUNT(*), 0
  FROM notification_outbox o
  JOIN notifications n ON n.id=o.notification_id
 WHERE o.company_id<>n.company_id
UNION ALL
SELECT 'notification_outbox_orphans', COUNT(*), 0
  FROM notification_outbox o
  LEFT JOIN notifications n ON n.id=o.notification_id
 WHERE n.id IS NULL
UNION ALL
SELECT 'worker_heartbeat_missing_or_stale',
       IF(COUNT(*)=0,1,SUM(TIMESTAMPDIFF(SECOND,last_heartbeat_at,UTC_TIMESTAMP())>${staleSeconds})), 0
  FROM worker_heartbeats
 WHERE worker_name='payhub-worker'`;
}

export async function verifyDurableWorker(pool: Pick<Pool, 'query'>, workerPollSeconds = 20): Promise<DurableWorkerCheck[]> {
  const [rows] = await pool.query<CheckRow[]>(durableWorkerVerificationSql(workerPollSeconds));
  return rows.map((row) => {
    const value = Number(row.value);
    const expected = Number(row.expected);
    return { name: String(row.name), value, expected, ok: value === expected };
  });
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const pool = createMySqlPool(env);
  try {
    const checks = await verifyDurableWorker(pool, env.WORKER_POLL_SECONDS);
    let failed = false;
    for (const check of checks) {
      const marker = check.ok ? 'OK' : 'FALHA';
      console.log(`${marker.padEnd(5)} ${check.name}: ${check.value} (esperado ${check.expected})`);
      if (!check.ok) failed = true;
    }
    if (failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) await main();
