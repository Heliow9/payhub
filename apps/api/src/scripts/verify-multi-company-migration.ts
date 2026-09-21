import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';

export interface MigrationCheck {
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

const VERIFICATION_SQL = `
SELECT 'realenergy_companies' name, COUNT(*) value, 1 expected
  FROM companies WHERE slug='realenergy'
UNION ALL
SELECT 'users_without_company', COUNT(*), 0 FROM users WHERE company_id IS NULL
UNION ALL
SELECT 'sessions_company_mismatch', COUNT(*), 0
  FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.company_id<>u.company_id
UNION ALL
SELECT 'companies_without_one_active_master', COUNT(*), 0
  FROM companies c
  LEFT JOIN company_masters cm ON cm.company_id=c.id
  LEFT JOIN users u ON u.id=cm.user_id AND u.company_id=c.id AND u.role='MASTER' AND u.status='ACTIVE'
 WHERE c.status='ACTIVE' AND u.id IS NULL
UNION ALL
SELECT 'companies_without_exactly_one_active_master', COUNT(*), 0
  FROM (
    SELECT c.id
      FROM companies c
      LEFT JOIN users u ON u.company_id=c.id AND u.role='MASTER' AND u.status='ACTIVE'
     WHERE c.status='ACTIVE'
     GROUP BY c.id
    HAVING COUNT(u.id) <> 1
  ) invalid_master_count
UNION ALL
SELECT 'employees_without_identity', COUNT(*), 0
  FROM employees WHERE company_id IS NULL OR identity_id IS NULL
UNION ALL
SELECT 'employee_identity_cpf_mismatch', COUNT(*), 0
  FROM employees e JOIN employee_identities i ON i.id=e.identity_id WHERE e.cpf<>i.cpf
UNION ALL
SELECT 'employee_credential_pin_mismatch', COUNT(*), 0
  FROM employees e
  JOIN employee_identities i ON i.id=e.identity_id
  JOIN employee_credentials c ON c.employee_id=e.id
 WHERE NOT (c.pin_hash <=> i.pin_hash)
UNION ALL
SELECT 'employee_session_scope_mismatch', COUNT(*), 0
  FROM employee_sessions s JOIN employees e ON e.id=s.employee_id
 WHERE s.company_id<>e.company_id OR s.identity_id<>e.identity_id
UNION ALL
SELECT 'connector_job_company_mismatch', COUNT(*), 0
  FROM import_jobs j JOIN connectors c ON c.id=j.connector_id WHERE j.company_id<>c.company_id
UNION ALL
SELECT 'payroll_employee_company_mismatch', COUNT(*), 0
  FROM payrolls p JOIN employees e ON e.id=p.employee_id WHERE p.company_id<>e.company_id
UNION ALL
SELECT 'documents_without_original_hash', COUNT(*), 0
  FROM payroll_documents WHERE original_sha256 IS NULL OR original_sha256=''
UNION ALL
SELECT 'signed_documents_without_hash', COUNT(*), 0
  FROM payroll_documents WHERE signed_path IS NOT NULL AND (signed_sha256 IS NULL OR signed_sha256='')
UNION ALL
SELECT 'signature_request_orphans', COUNT(*), 0
  FROM signature_requests sr
  LEFT JOIN payrolls p ON p.id=sr.payroll_id
  LEFT JOIN employees e ON e.id=sr.employee_id
 WHERE p.id IS NULL OR e.id IS NULL OR p.employee_id<>e.id
UNION ALL
SELECT 'employee_group_company_mismatch', COUNT(*), 0
  FROM employees e JOIN employee_groups g ON g.id=e.group_id
 WHERE e.company_id<>g.company_id
UNION ALL
SELECT 'payroll_run_group_company_mismatch', COUNT(*), 0
  FROM payroll_runs r JOIN employee_groups g ON g.id=r.group_id
 WHERE r.company_id<>g.company_id
UNION ALL
SELECT 'schedule_execution_company_mismatch', COUNT(*), 0
  FROM schedule_executions x JOIN employee_groups g ON g.id=x.group_id
 WHERE x.company_id<>g.company_id
UNION ALL
SELECT 'connector_log_company_mismatch', COUNT(*), 0
  FROM connector_job_logs l JOIN import_jobs j ON j.id=l.job_id
 WHERE l.company_id<>j.company_id
UNION ALL
SELECT 'connector_batch_company_mismatch', COUNT(*), 0
  FROM connector_raw_batches b JOIN import_jobs j ON j.id=b.job_id
 WHERE b.company_id<>j.company_id
UNION ALL
SELECT 'active_companies_without_settings', COUNT(*), 0
  FROM companies c LEFT JOIN app_settings s ON s.company_id=c.id
 WHERE c.status='ACTIVE' AND s.id IS NULL
UNION ALL
SELECT 'audit_actor_company_mismatch', COUNT(*), 0
  FROM audit_logs a JOIN users u ON u.id=a.actor_user_id
 WHERE a.company_id<>u.company_id
UNION ALL
SELECT 'notification_outbox_company_mismatch', COUNT(*), 0
  FROM notification_outbox o JOIN notifications n ON n.id=o.notification_id
 WHERE o.company_id<>n.company_id
`;

export async function verifyMultiCompanyMigration(pool: Pick<Pool, 'query'>): Promise<MigrationCheck[]> {
  const [rows] = await pool.query<CheckRow[]>(VERIFICATION_SQL);
  return rows.map((row) => {
    const value = Number(row.value);
    const expected = Number(row.expected);
    return { name: String(row.name), value, expected, ok: value === expected };
  });
}

async function main(): Promise<void> {
  loadDotEnv();
  const pool = createMySqlPool(loadEnv());
  try {
    const checks = await verifyMultiCompanyMigration(pool);
    for (const check of checks) {
      console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.value} (esperado ${check.expected})`);
    }
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) await main();
