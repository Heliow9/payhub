import type {
  AppendJobLogInput,
  CreateImportJobInput,
  ImportJob,
  ImportJobRepository,
  JobLog,
  StoreRawBatchInput,
  UpdateJobProgressInput,
} from '../../../domain/connectors/import-job.repository.js';

export class MemoryImportJobRepository implements ImportJobRepository {
  private items: ImportJob[] = [];
  private nextId = 1;
  readonly logs: Array<{ jobId: number; connectorId: number; input: AppendJobLogInput; createdAt: Date }> = [];
  readonly batches: Array<{ jobId: number; connectorId: number; input: StoreRawBatchInput }> = [];

  async create(input: CreateImportJobInput): Promise<ImportJob> {
    const now = new Date();
    const job: ImportJob = {
      id: this.nextId++,
      requestedByUserId: input.requestedByUserId,
      connectorId: null,
      jobType: input.jobType,
      status: 'QUEUED',
      scope: input.scope ?? null,
      progressCurrent: 0,
      progressTotal: 0,
      progressMessage: null,
      attemptCount: 0,
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(job);
    return structuredClone(job);
  }

  async findById(id: number): Promise<ImportJob | null> {
    const job = this.items.find((item) => item.id === id);
    return job ? structuredClone(job) : null;
  }

  async list(limit = 100): Promise<ImportJob[]> {
    return [...this.items].sort((a, b) => b.id - a.id).slice(0, limit).map((item) => structuredClone(item));
  }

  async claimNext(connectorId: number): Promise<ImportJob | null> {
    const job = this.items.find((item) => item.status === 'QUEUED' && (item.connectorId === null || item.connectorId === connectorId));
    if (!job) return null;
    const now = new Date();
    job.connectorId = connectorId;
    job.status = 'RUNNING';
    job.claimedAt = now;
    job.startedAt = now;
    job.attemptCount += 1;
    job.progressMessage = 'Job reivindicado pelo conector.';
    job.updatedAt = now;
    return structuredClone(job);
  }

  async updateProgress(jobId: number, connectorId: number, input: UpdateJobProgressInput): Promise<boolean> {
    const job = this.items.find((item) => item.id === jobId && item.connectorId === connectorId && item.status === 'RUNNING');
    if (!job) return false;
    job.progressCurrent = input.current;
    job.progressTotal = input.total;
    job.progressMessage = input.message ?? null;
    job.updatedAt = new Date();
    return true;
  }

  async appendLog(jobId: number, connectorId: number, input: AppendJobLogInput): Promise<void> {
    this.logs.push({ jobId, connectorId, input: structuredClone(input), createdAt: new Date() });
  }

  async listLogs(jobId: number, limit = 200): Promise<JobLog[]> {
    return this.logs
      .filter((log) => log.jobId === jobId)
      .slice(-limit)
      .reverse()
      .map((log, index) => ({
        id: index + 1,
        jobId: log.jobId,
        connectorId: log.connectorId,
        level: log.input.level,
        message: log.input.message,
        metadata: log.input.metadata ?? null,
        createdAt: log.createdAt,
      }));
  }

  async storeBatch(jobId: number, connectorId: number, input: StoreRawBatchInput): Promise<void> {
    const index = this.batches.findIndex((batch) => batch.jobId === jobId && batch.input.sourceTable === input.sourceTable && batch.input.batchNumber === input.batchNumber);
    const value = { jobId, connectorId, input: structuredClone(input) };
    if (index >= 0) this.batches[index] = value;
    else this.batches.push(value);
  }

  async complete(jobId: number, connectorId: number, message?: string | null): Promise<boolean> {
    const job = this.items.find((item) => item.id === jobId && item.connectorId === connectorId && item.status === 'RUNNING');
    if (!job) return false;
    job.status = 'COMPLETED';
    job.progressMessage = message ?? 'Concluído.';
    job.finishedAt = new Date();
    job.updatedAt = job.finishedAt;
    return true;
  }

  async fail(jobId: number, connectorId: number, errorMessage: string): Promise<boolean> {
    const job = this.items.find((item) => item.id === jobId && item.connectorId === connectorId && item.status === 'RUNNING');
    if (!job) return false;
    job.status = 'FAILED';
    job.errorMessage = errorMessage;
    job.progressMessage = 'Falha no processamento.';
    job.finishedAt = new Date();
    job.updatedAt = job.finishedAt;
    return true;
  }
}
