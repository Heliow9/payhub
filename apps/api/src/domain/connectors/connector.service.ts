import { timingSafeEqual } from 'node:crypto';
import type { AuditRepository } from '../audit/audit.repository.js';
import { generateOpaqueToken, hashToken } from '../auth/token.js';
import type { User } from '../users/user.repository.js';
import type { Connector, ConnectorRepository } from './connector.repository.js';
import type {
  AppendJobLogInput,
  CreateImportJobInput,
  ImportJob,
  ImportJobRepository,
  StoreRawBatchInput,
  UpdateJobProgressInput,
} from './import-job.repository.js';

export class ConnectorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorValidationError';
  }
}

export class ConnectorAuthError extends Error {
  constructor(message = 'Credenciais do conector inválidas.') {
    super(message);
    this.name = 'ConnectorAuthError';
  }
}

export interface ConnectorRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function hashesEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export class ConnectorService {
  constructor(
    private readonly connectors: ConnectorRepository,
    private readonly jobs: ImportJobRepository,
    private readonly audit: AuditRepository,
  ) {}

  async createConnector(actor: User, name: string, context: ConnectorRequestContext = {}) {
    const normalizedName = name.trim();
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      throw new ConnectorValidationError('Nome do conector inválido.');
    }
    const token = generateOpaqueToken();
    const connector = await this.connectors.create({
      name: normalizedName,
      tokenHash: hashToken(token),
      createdByUserId: actor.id,
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'CONNECTOR_CREATED',
      targetType: 'CONNECTOR',
      targetId: String(connector.id),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      metadata: { name: connector.name },
    });
    return { connector, token };
  }

  listConnectors(): Promise<Connector[]> {
    return this.connectors.list();
  }

  async authenticate(connectorId: number, token: string): Promise<Connector> {
    if (!Number.isInteger(connectorId) || connectorId <= 0 || !token) throw new ConnectorAuthError();
    const connector = await this.connectors.findById(connectorId);
    const suppliedHash = hashToken(token);
    if (!connector || connector.status === 'DISABLED' || !hashesEqual(connector.tokenHash, suppliedHash)) {
      throw new ConnectorAuthError();
    }
    return connector;
  }

  async heartbeat(
    connector: Connector,
    input: { machineName?: string | null; metadata?: Record<string, unknown> | null },
    context: ConnectorRequestContext = {},
  ) {
    const updated = await this.connectors.heartbeat(connector.id, {
      machineName: input.machineName ?? null,
      metadata: input.metadata ?? null,
      ipAddress: context.ipAddress ?? null,
      at: new Date(),
    });
    if (!updated) throw new ConnectorAuthError('Conector desabilitado ou inexistente.');
    return updated;
  }

  async createJob(actor: User, input: Omit<CreateImportJobInput, 'requestedByUserId'>) {
    const job = await this.jobs.create({ ...input, requestedByUserId: actor.id });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'IMPORT_JOB_CREATED',
      targetType: 'IMPORT_JOB',
      targetId: String(job.id),
      metadata: { jobType: job.jobType, scope: job.scope },
    });
    return job;
  }

  listJobs(limit?: number): Promise<ImportJob[]> {
    return this.jobs.list(limit);
  }

  listJobLogs(jobId: number, limit?: number) {
    return this.jobs.listLogs(jobId, limit);
  }

  claimNext(connector: Connector): Promise<ImportJob | null> {
    return this.jobs.claimNext(connector.id);
  }

  async updateProgress(connector: Connector, jobId: number, input: UpdateJobProgressInput) {
    const ok = await this.jobs.updateProgress(jobId, connector.id, input);
    if (!ok) throw new ConnectorValidationError('Job não está em execução neste conector.');
  }

  private async assertOwnedRunningJob(connector: Connector, jobId: number) {
    const job = await this.jobs.findById(jobId);
    if (!job || job.connectorId !== connector.id || job.status !== 'RUNNING') {
      throw new ConnectorValidationError('Job não está em execução neste conector.');
    }
  }

  async appendLog(connector: Connector, jobId: number, input: AppendJobLogInput) {
    await this.assertOwnedRunningJob(connector, jobId);
    return this.jobs.appendLog(jobId, connector.id, input);
  }

  async storeBatch(connector: Connector, jobId: number, input: StoreRawBatchInput) {
    await this.assertOwnedRunningJob(connector, jobId);
    return this.jobs.storeBatch(jobId, connector.id, input);
  }

  async complete(connector: Connector, jobId: number, message?: string | null) {
    const ok = await this.jobs.complete(jobId, connector.id, message);
    if (!ok) throw new ConnectorValidationError('Job não está em execução neste conector.');
  }

  async fail(connector: Connector, jobId: number, errorMessage: string) {
    const ok = await this.jobs.fail(jobId, connector.id, errorMessage);
    if (!ok) throw new ConnectorValidationError('Job não está em execução neste conector.');
  }
}
