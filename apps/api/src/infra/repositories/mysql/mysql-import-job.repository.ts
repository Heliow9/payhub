import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  AppendJobLogInput,
  CreateImportJobInput,
  ImportJob,
  ImportJobRepository,
  JobLog,
  StoreRawBatchInput,
  UpdateJobProgressInput,
} from '../../../domain/connectors/import-job.repository.js';


interface JobLogRow extends RowDataPacket {
  id: number;
  job_id: number;
  connector_id: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata_json: string | null;
  created_at: Date;
}

function mapLog(row: JobLogRow): JobLog {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata_json) {
    try {
      const parsed = JSON.parse(row.metadata_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    connectorId: Number(row.connector_id),
    level: row.level,
    message: row.message,
    metadata,
    createdAt: new Date(row.created_at),
  };
}

interface ImportJobRow extends RowDataPacket {
  id: number;
  requested_by_user_id: number;
  connector_id: number | null;
  job_type: 'CONNECTION_TEST' | 'SCHEMA_DISCOVERY' | 'PAYROLL_IMPORT';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  scope_json: string | null;
  progress_current: number;
  progress_total: number;
  progress_message: string | null;
  attempt_count: number;
  claimed_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

function parseScope(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapJob(row: ImportJobRow): ImportJob {
  return {
    id: Number(row.id),
    requestedByUserId: Number(row.requested_by_user_id),
    connectorId: row.connector_id === null ? null : Number(row.connector_id),
    jobType: row.job_type,
    status: row.status,
    scope: parseScope(row.scope_json),
    progressCurrent: Number(row.progress_current),
    progressTotal: Number(row.progress_total),
    progressMessage: row.progress_message,
    attemptCount: Number(row.attempt_count),
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function loadJob(connection: Pool | PoolConnection, id: number): Promise<ImportJob | null> {
  const [rows] = await connection.execute<ImportJobRow[]>('SELECT * FROM import_jobs WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? mapJob(rows[0]) : null;
}

export class MySqlImportJobRepository implements ImportJobRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateImportJobInput): Promise<ImportJob> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO import_jobs
        (requested_by_user_id, job_type, status, scope_json, created_at, updated_at)
       VALUES (?, ?, 'QUEUED', ?, ?, ?)`,
      [input.requestedByUserId, input.jobType, input.scope ? JSON.stringify(input.scope) : null, now, now],
    );
    const job = await this.findById(result.insertId);
    if (!job) throw new Error('Job criado não pôde ser carregado.');
    return job;
  }

  async findById(id: number): Promise<ImportJob | null> {
    return loadJob(this.pool, id);
  }

  async list(limit = 100): Promise<ImportJob[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const [rows] = await this.pool.query<ImportJobRow[]>(
      `SELECT * FROM import_jobs ORDER BY id DESC LIMIT ${safeLimit}`,
    );
    return rows.map(mapJob);
  }

  async claimNext(connectorId: number): Promise<ImportJob | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      await connection.execute(
        `UPDATE import_jobs
         SET status = 'FAILED', error_message = 'Job excedeu o limite de retentativas após perda do conector.',
             progress_message = 'Falha após 3 tentativas.', finished_at = ?, updated_at = ?
         WHERE status = 'RUNNING' AND updated_at < ? AND attempt_count >= 3`,
        [new Date(), new Date(), staleBefore],
      );
      await connection.execute(
        `UPDATE import_jobs
         SET status = 'QUEUED', connector_id = NULL, claimed_at = NULL, started_at = NULL,
             progress_message = 'Job reenfileirado após perda do heartbeat/progresso do conector.', updated_at = ?
         WHERE status = 'RUNNING' AND updated_at < ? AND attempt_count < 3`,
        [new Date(), staleBefore],
      );
      const [rows] = await connection.query<ImportJobRow[]>(
        `SELECT * FROM import_jobs
         WHERE status = 'QUEUED' AND (connector_id IS NULL OR connector_id = ?)
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
        [connectorId],
      );
      const row = rows[0];
      if (!row) {
        await connection.commit();
        return null;
      }
      const now = new Date();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE import_jobs
         SET connector_id = ?, status = 'RUNNING', claimed_at = ?, started_at = ?,
             attempt_count = attempt_count + 1, progress_message = 'Job reivindicado pelo conector.', updated_at = ?
         WHERE id = ? AND status = 'QUEUED'`,
        [connectorId, now, now, now, row.id],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return null;
      }
      await connection.commit();
      return loadJob(this.pool, Number(row.id));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProgress(jobId: number, connectorId: number, input: UpdateJobProgressInput): Promise<boolean> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE import_jobs
       SET progress_current = ?, progress_total = ?, progress_message = ?, updated_at = ?
       WHERE id = ? AND connector_id = ? AND status = 'RUNNING'`,
      [input.current, input.total, input.message ?? null, now, jobId, connectorId],
    );
    return result.affectedRows === 1;
  }

  async appendLog(jobId: number, connectorId: number, input: AppendJobLogInput): Promise<void> {
    await this.pool.execute(
      `INSERT INTO connector_job_logs
        (job_id, connector_id, level, message, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [jobId, connectorId, input.level, input.message, input.metadata ? JSON.stringify(input.metadata) : null, new Date()],
    );
  }

  async listLogs(jobId: number, limit = 200): Promise<JobLog[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const [rows] = await this.pool.query<JobLogRow[]>(
      `SELECT * FROM connector_job_logs WHERE job_id = ? ORDER BY id DESC LIMIT ${safeLimit}`,
      [jobId],
    );
    return rows.map(mapLog);
  }

  async storeBatch(jobId: number, connectorId: number, input: StoreRawBatchInput): Promise<void> {
    await this.pool.execute(
      `INSERT INTO connector_raw_batches
        (job_id, connector_id, source_table, batch_number, row_count, source_hash, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         row_count = VALUES(row_count),
         source_hash = VALUES(source_hash),
         payload_json = VALUES(payload_json)`,
      [
        jobId,
        connectorId,
        input.sourceTable,
        input.batchNumber,
        input.rowCount,
        input.sourceHash,
        JSON.stringify(input.rows),
        new Date(),
      ],
    );
  }

  async complete(jobId: number, connectorId: number, message?: string | null): Promise<boolean> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE import_jobs
       SET status = 'COMPLETED', progress_message = ?, finished_at = ?, updated_at = ?
       WHERE id = ? AND connector_id = ? AND status = 'RUNNING'`,
      [message ?? 'Concluído.', now, now, jobId, connectorId],
    );
    return result.affectedRows === 1;
  }

  async fail(jobId: number, connectorId: number, errorMessage: string): Promise<boolean> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE import_jobs
       SET status = 'FAILED', error_message = ?, progress_message = 'Falha no processamento.', finished_at = ?, updated_at = ?
       WHERE id = ? AND connector_id = ? AND status = 'RUNNING'`,
      [errorMessage.slice(0, 1000), now, now, jobId, connectorId],
    );
    return result.affectedRows === 1;
  }
}
