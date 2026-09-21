import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type NormalizationClaim = {
  jobId: number;
  companyId: number;
  payrollRunId: number | null;
  owner: string;
  attempt: number;
};

export type NormalizationResult = {
  created: number;
  repaired: number;
  unchanged: number;
  skipped: number;
};

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

export class NormalizationQueueService {
  constructor(private pool: Pool) {}

  async claimNext(owner: string, leaseSeconds: number): Promise<NormalizationClaim | null> {
    for (let tries = 0; tries < 8; tries++) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT id,company_id companyId,payroll_run_id payrollRunId,normalization_attempt_count attempts
           FROM import_jobs
          WHERE job_type='PAYROLL_IMPORT'
            AND status='COMPLETED'
            AND normalized_at IS NULL
            AND (
              normalization_state='PENDING'
              OR normalization_state IS NULL
              OR (normalization_state='CLAIMED' AND normalization_lease_until<UTC_TIMESTAMP())
            )
          ORDER BY id ASC
          LIMIT 1`,
      );
      const row = rows[0];
      if (!row) return null;

      const [result] = await this.pool.execute<ResultSetHeader>(
        `UPDATE import_jobs
            SET normalization_state='CLAIMED',
                normalization_owner=?,
                normalization_claimed_at=UTC_TIMESTAMP(),
                normalization_lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),
                normalization_attempt_count=normalization_attempt_count+1,
                normalization_error=NULL,
                updated_at=UTC_TIMESTAMP()
          WHERE id=? AND company_id=? AND status='COMPLETED' AND normalized_at IS NULL
            AND (
              normalization_state='PENDING'
              OR normalization_state IS NULL
              OR (normalization_state='CLAIMED' AND normalization_lease_until<UTC_TIMESTAMP())
            )`,
        [owner, Math.max(30, leaseSeconds), row.id, row.companyId],
      );
      if (result.affectedRows === 1) {
        return {
          jobId: Number(row.id),
          companyId: Number(row.companyId),
          payrollRunId: row.payrollRunId == null ? null : Number(row.payrollRunId),
          owner,
          attempt: Number(row.attempts ?? 0) + 1,
        };
      }
    }
    return null;
  }

  async renew(jobId: number, companyId: number, owner: string, leaseSeconds: number): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE import_jobs
          SET normalization_lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),updated_at=UTC_TIMESTAMP()
        WHERE id=? AND company_id=? AND normalization_owner=? AND normalization_state='CLAIMED' AND normalized_at IS NULL`,
      [Math.max(30, leaseSeconds), jobId, companyId, owner],
    );
    if (result.affectedRows !== 1) throw new Error(`Lease de normalização perdido para o job #${jobId}.`);
  }

  async complete(claim: NormalizationClaim, result: NormalizationResult): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE import_jobs
            SET normalization_state='COMPLETED',
                normalized_at=UTC_TIMESTAMP(),
                normalization_owner=NULL,
                normalization_lease_until=NULL,
                normalization_error=NULL,
                updated_at=UTC_TIMESTAMP()
          WHERE id=? AND company_id=? AND normalization_owner=? AND normalization_state='CLAIMED' AND normalized_at IS NULL`,
        [claim.jobId, claim.companyId, claim.owner],
      );
      if (jobUpdate.affectedRows !== 1) throw new Error(`Não foi possível concluir o claim do job #${claim.jobId}.`);

      if (claim.payrollRunId) {
        const success = result.created + result.repaired + result.unchanged;
        const status = result.skipped > 0 ? 'PARTIAL' : 'COMPLETED';
        const message = `${result.created} novo(s), ${result.repaired} reparado(s), ${result.unchanged} sem alteração, ${result.skipped} ignorado(s).`;
        await conn.execute(
          `UPDATE payroll_runs
              SET status=?,success_count=?,failure_count=?,message=?,finished_at=UTC_TIMESTAMP()
            WHERE id=? AND company_id=? AND status IN ('QUEUED','RUNNING')`,
          [status, success, result.skipped, message.slice(0, 500), claim.payrollRunId, claim.companyId],
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async fail(claim: NormalizationClaim, error: unknown, maxAttempts: number): Promise<'PENDING' | 'FAILED'> {
    const terminal = claim.attempt >= Math.max(1, maxAttempts);
    const state: 'PENDING' | 'FAILED' = terminal ? 'FAILED' : 'PENDING';
    const message = errorText(error);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [jobUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE import_jobs
            SET normalization_state=?,normalization_owner=NULL,normalization_lease_until=NULL,
                normalization_error=?,updated_at=UTC_TIMESTAMP()
          WHERE id=? AND company_id=? AND normalization_owner=? AND normalization_state='CLAIMED'`,
        [state, message, claim.jobId, claim.companyId, claim.owner],
      );
      if (jobUpdate.affectedRows !== 1) throw new Error(`Não foi possível registrar a falha do job #${claim.jobId}.`);

      if (terminal && claim.payrollRunId) {
        const [counts] = await conn.execute<RowDataPacket[]>(
          `SELECT COUNT(*) value
             FROM payrolls
            WHERE company_id=? AND payroll_run_id=? AND is_current=1
              AND status IN ('READY','SIGNATURE_REQUESTED','VIEWED','SIGNED')`,
          [claim.companyId, claim.payrollRunId],
        );
        const success = Number(counts[0]?.value ?? 0);
        const runStatus = success > 0 ? 'PARTIAL' : 'FAILED';
        await conn.execute(
          `UPDATE payroll_runs
              SET status=?,success_count=?,failure_count=GREATEST(employee_count-?,0),message=?,finished_at=UTC_TIMESTAMP()
            WHERE id=? AND company_id=? AND status IN ('QUEUED','RUNNING')`,
          [runStatus, success, success, `Falha ao gerar holerite: ${message}`.slice(0, 500), claim.payrollRunId, claim.companyId],
        );
      }
      await conn.commit();
      return state;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}
