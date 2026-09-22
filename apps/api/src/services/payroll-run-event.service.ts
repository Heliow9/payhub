import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { parseJson } from '../core/json.js';

type Db = Pool | PoolConnection;
export type PayrollRunEventLevel = 'INFO' | 'WARN' | 'ERROR';

export interface PayrollRunEventInput {
  companyId: number;
  payrollRunId: number;
  eventType: string;
  stage: string;
  level?: PayrollRunEventLevel;
  message: string;
  metadata?: unknown;
  dedupKey?: string | null;
}

export class PayrollRunEventService {
  constructor(private pool: Pool) {}

  async append(input: PayrollRunEventInput, db: Db = this.pool): Promise<void> {
    await db.execute(
      `INSERT INTO payroll_run_events
        (company_id,payroll_run_id,event_type,stage,level,message,metadata_json,dedup_key,created_at)
       VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE id=id`,
      [
        input.companyId,
        input.payrollRunId,
        input.eventType.slice(0, 80),
        input.stage.slice(0, 50),
        input.level ?? 'INFO',
        input.message.slice(0, 1000),
        input.metadata == null ? null : JSON.stringify(input.metadata),
        input.dedupKey?.slice(0, 120) ?? null,
      ],
    );
  }

  async appendForJob(
    companyId: number,
    jobId: number,
    event: Omit<PayrollRunEventInput, 'companyId' | 'payrollRunId'>,
  ): Promise<void> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT payroll_run_id payrollRunId
         FROM import_jobs
        WHERE id=? AND company_id=? AND payroll_run_id IS NOT NULL
        LIMIT 1`,
      [jobId, companyId],
    );
    const runId = rows[0]?.payrollRunId == null ? null : Number(rows[0].payrollRunId);
    if (!runId) return;
    await this.append({ companyId, payrollRunId: runId, ...event });
  }

  async list(companyId: number, payrollRunId: number, limit = 500): Promise<Record<string, unknown>[]> {
    const safe = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const [allowed] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM payroll_runs WHERE id=? AND company_id=? LIMIT 1`,
      [payrollRunId, companyId],
    );
    if (!allowed[0]) return [];
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id,event_type eventType,stage,level,message,metadata_json metadataJson,created_at createdAt
         FROM payroll_run_events
        WHERE company_id=? AND payroll_run_id=?
        ORDER BY id ASC LIMIT ${safe}`,
      [companyId, payrollRunId],
    );
    return rows.map((row) => ({
      ...row,
      source: 'PAYHUB',
      key: `run-${row.id}`,
      metadata: parseJson(row.metadataJson, null),
      metadataJson: undefined,
    }));
  }
}
