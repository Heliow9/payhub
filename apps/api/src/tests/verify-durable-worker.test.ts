import { describe, expect, it } from 'vitest';
import { durableWorkerVerificationSql, verifyDurableWorker } from '../scripts/verify-durable-worker.js';

describe('verifyDurableWorker', () => {
  it('marca invariantes inválidos como falha', async () => {
    const pool = { query: async () => [[{ name:'payroll_jobs_without_normalization_state',value:1,expected:0 },{ name:'worker_heartbeat_missing_or_stale',value:0,expected:0 }]] };
    expect(await verifyDurableWorker(pool as never)).toEqual([
      { name:'payroll_jobs_without_normalization_state',value:1,expected:0,ok:false },
      { name:'worker_heartbeat_missing_or_stale',value:0,expected:0,ok:true },
    ]);
  });
  it('verifica leases, runs, outbox, documentos e heartbeat', () => {
    const sql=durableWorkerVerificationSql(20);
    for(const token of ['payroll_jobs_without_normalization_state','normalized_jobs_not_completed','claimed_jobs_without_lease','completed_runs_with_unfinished_job','running_runs_with_terminal_job','notification_outbox_company_mismatch','notification_outbox_orphans','current_usable_payrolls_without_document','signed_payrolls_without_signed_hash','worker_heartbeat_missing_or_stale'])expect(sql).toContain(token);
    expect(sql).toContain('>120');
  });
});
