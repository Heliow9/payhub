export type ImportJobType = 'CONNECTION_TEST' | 'SCHEMA_DISCOVERY' | 'PAYROLL_IMPORT';
export type ImportJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type JobLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface ImportJob {
  id: number;
  requestedByUserId: number;
  connectorId: number | null;
  jobType: ImportJobType;
  status: ImportJobStatus;
  scope: Record<string, unknown> | null;
  progressCurrent: number;
  progressTotal: number;
  progressMessage: string | null;
  attemptCount: number;
  claimedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateImportJobInput {
  requestedByUserId: number;
  jobType: ImportJobType;
  scope?: Record<string, unknown> | null;
}

export interface UpdateJobProgressInput {
  current: number;
  total: number;
  message?: string | null;
}

export interface AppendJobLogInput {
  level: JobLogLevel;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface JobLog {
  id: number;
  jobId: number;
  connectorId: number;
  level: JobLogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface StoreRawBatchInput {
  sourceTable: string;
  batchNumber: number;
  rowCount: number;
  sourceHash: string;
  rows: unknown[];
}

export interface ImportJobRepository {
  create(input: CreateImportJobInput): Promise<ImportJob>;
  findById(id: number): Promise<ImportJob | null>;
  list(limit?: number): Promise<ImportJob[]>;
  claimNext(connectorId: number): Promise<ImportJob | null>;
  updateProgress(jobId: number, connectorId: number, input: UpdateJobProgressInput): Promise<boolean>;
  appendLog(jobId: number, connectorId: number, input: AppendJobLogInput): Promise<void>;
  listLogs(jobId: number, limit?: number): Promise<JobLog[]>;
  storeBatch(jobId: number, connectorId: number, input: StoreRawBatchInput): Promise<void>;
  complete(jobId: number, connectorId: number, message?: string | null): Promise<boolean>;
  fail(jobId: number, connectorId: number, errorMessage: string): Promise<boolean>;
}
