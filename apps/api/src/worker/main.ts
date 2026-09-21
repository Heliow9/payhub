import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Env } from '../config/env.js';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';
import { createServices, type PayHubServices } from '../app.js';
import { brasiliaParts, brDateKey, brTimeKey } from '../core/time.js';
import type { UserContext } from '../core/types.js';
import { NormalizationQueueService } from '../services/normalization-queue.service.js';
import { NotificationOutboxService, type OutboxDispatchResult } from '../services/notification-outbox.service.js';
import { WorkerHeartbeatService, type WorkerPhase } from '../services/worker-heartbeat.service.js';
import { startWatchdog } from './watchdog.js';

export type WorkerServices = Pick<PayHubServices, 'payrolls' | 'notifications' | 'runs' | 'connector'>;

type WorkerState = { phase: WorkerPhase; jobId: number | null };
export type WorkerDependencies = {
  pool: Pool;
  services: WorkerServices;
  env: Env;
  queue: NormalizationQueueService;
  outbox: NotificationOutboxService;
  heartbeat: WorkerHeartbeatService;
  instanceId: string;
  state: WorkerState;
};

export type WorkerCycleResult = {
  normalized: { completed: number[]; failed: number[] };
  scheduled: Array<{ companyId: number; groupId: number; scheduleId: number; runId?: number; jobId?: number; failed?: boolean }>;
  pushes: OutboxDispatchResult;
};

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

/**
 * Adaptador legado mantido para testes e ferramentas antigas. O runtime de produção
 * usa processClaimedJobs(), que possui lease e retomada durável.
 */
export async function normalizeCompanyJobs(
  pool: Pick<Pool, 'query'>,
  services: Pick<WorkerServices, 'payrolls' | 'notifications'>,
): Promise<{ completed: number[]; failed: number[] }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,company_id companyId
       FROM import_jobs
      WHERE job_type='PAYROLL_IMPORT' AND status='COMPLETED' AND normalized_at IS NULL
      ORDER BY id ASC LIMIT 20`,
  );
  const completed: number[] = [];
  const failed: number[] = [];
  for (const row of rows) {
    const jobId = Number(row.id);
    const companyId = Number(row.companyId);
    try {
      const result = await services.payrolls.normalizeCompletedJob(jobId);
      completed.push(jobId);
      console.log(`[worker] job ${jobId} normalizado (compatibilidade)`, result);
    } catch (error) {
      failed.push(jobId);
      console.error(`[worker] falha ao normalizar job ${jobId}`, error);
      try {
        await services.notifications.notifyAdmins(companyId, {
          category: 'IMPORT_FAILED',
          title: 'Falha ao processar holerites',
          body: `O job #${jobId} falhou durante a normalização. Verifique a Integração Sage.`,
          url: '/#/integration',
          dedupKey: `normalize-failed:${jobId}`,
        });
      } catch (notifyError) {
        console.error(`[worker] falha ao registrar notificação da empresa ${companyId}`, notifyError);
      }
    }
  }
  return { completed, failed };
}

async function safeNotify(
  services: Pick<WorkerServices, 'notifications'>,
  companyId: number,
  input: Parameters<WorkerServices['notifications']['notifyAdmins']>[1],
): Promise<void> {
  try { await services.notifications.notifyAdmins(companyId, input); }
  catch (error) { console.error(`[worker] falha ao registrar notificação da empresa ${companyId}`, error); }
}

async function heartbeatPhase(deps: WorkerDependencies, phase: WorkerPhase, jobId: number | null, cycle: 'START' | 'FINISH' | null = null): Promise<void> {
  deps.state.phase = phase;
  deps.state.jobId = jobId;
  await deps.heartbeat.update(deps.instanceId, 'RUNNING', phase, jobId, null, cycle);
}

export async function processClaimedJobs(deps: WorkerDependencies): Promise<{ completed: number[]; failed: number[] }> {
  const completed: number[] = [];
  const failed: number[] = [];
  const max = Math.min(Math.max(deps.env.WORKER_BATCH_SIZE, 1), 100);

  for (let index = 0; index < max; index++) {
    await heartbeatPhase(deps, 'CLAIMING', null);
    const claim = await deps.queue.claimNext(deps.instanceId, deps.env.WORKER_NORMALIZATION_LEASE_SECONDS);
    if (!claim) break;

    await heartbeatPhase(deps, 'NORMALIZING', claim.jobId);
    try {
      const result = await deps.services.payrolls.normalizeClaimedJob(
        claim,
        () => deps.queue.renew(claim.jobId, claim.companyId, claim.owner, deps.env.WORKER_NORMALIZATION_LEASE_SECONDS),
      );
      await deps.queue.complete(claim, result);
      completed.push(claim.jobId);
      console.log(`[worker] job ${claim.jobId} normalizado`, result);
      await safeNotify(deps.services, claim.companyId, {
        category: 'IMPORT_COMPLETED',
        title: 'Importação de holerites concluída',
        body: `${result.created} novo(s), ${result.repaired} reparado(s), ${result.unchanged} sem alteração e ${result.skipped} ignorado(s).`,
        url: '/#/payrolls',
        dedupKey: `import-completed:${claim.jobId}`,
      });
    } catch (error) {
      failed.push(claim.jobId);
      console.error(`[worker] falha ao gerar holerites do job ${claim.jobId}`, error);
      let state: 'PENDING' | 'FAILED' = 'PENDING';
      try {
        state = await deps.queue.fail(claim, error, deps.env.WORKER_NORMALIZATION_MAX_ATTEMPTS);
      } catch (queueError) {
        console.error(`[worker] não foi possível liberar/finalizar o claim ${claim.jobId}`, queueError);
      }
      if (state === 'FAILED') {
        await safeNotify(deps.services, claim.companyId, {
          category: 'IMPORT_FAILED',
          title: 'Falha ao gerar holerites',
          body: `O job #${claim.jobId} atingiu o limite de tentativas. ${errorText(error).slice(0, 180)}`,
          url: '/#/integration',
          dedupKey: `normalize-terminal:${claim.jobId}`,
        });
      }
    }
  }

  deps.state.jobId = null;
  return { completed, failed };
}

export async function scheduleCompanyDue(
  pool: Pick<Pool, 'execute'>,
  services: Pick<WorkerServices, 'runs'>,
  now = new Date(),
): Promise<Array<{ companyId: number; groupId: number; scheduleId: number; runId?: number; jobId?: number; failed?: boolean }>> {
  const p = brasiliaParts(now);
  if (p.weekday > 5) return [];
  const time = brTimeKey(now);
  const date = brDateKey(now);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT s.id scheduleId,s.group_id groupId,g.company_id companyId
       FROM group_schedules s
       JOIN employee_groups g ON g.id=s.group_id
      WHERE s.enabled=1 AND g.auto_search_enabled=1 AND g.status='ACTIVE'
        AND TIME_FORMAT(s.run_time,'%H:%i:00')=?`,
    [time],
  );
  const results: Array<{ companyId: number; groupId: number; scheduleId: number; runId?: number; jobId?: number; failed?: boolean }> = [];
  for (const row of rows) {
    const companyId = Number(row.companyId);
    const groupId = Number(row.groupId);
    const scheduleId = Number(row.scheduleId);
    try {
      const [insert] = await pool.execute<ResultSetHeader>(
        `INSERT IGNORE INTO schedule_executions (company_id,schedule_id,group_id,run_date,run_time,payroll_run_id,created_at)
         VALUES (?,?,?,?,?,NULL,UTC_TIMESTAMP())`,
        [companyId, scheduleId, groupId, date, time],
      );
      if (insert.affectedRows === 0) continue;
      const workerContext: UserContext = { kind: 'USER', companyId, userId: 0, role: 'MASTER' };
      const started = await services.runs.startGroup(workerContext, groupId, { ipAddress: null, userAgent: 'payhub-worker' }, 'SCHEDULED');
      await pool.execute(`UPDATE schedule_executions SET payroll_run_id=? WHERE id=? AND company_id=?`, [started.runId, insert.insertId, companyId]);
      results.push({ companyId, groupId, scheduleId, runId: started.runId, jobId: started.jobId });
      console.log(`[worker] empresa ${companyId} agenda ${scheduleId}: run ${started.runId}, job ${started.jobId}`);
    } catch (error) {
      results.push({ companyId, groupId, scheduleId, failed: true });
      console.error(`[worker] empresa ${companyId} agenda ${scheduleId} falhou`, error);
    }
  }
  return results;
}

export async function notifyCompanyOperationalAlerts(
  pool: Pick<Pool, 'query'>,
  services: Pick<WorkerServices, 'connector' | 'notifications'>,
  offlineSeconds: number,
  now = new Date(),
): Promise<void> {
  const today = brDateKey(now);
  const offline = await services.connector.markOfflineStale(offlineSeconds);
  for (const connector of offline) {
    await safeNotify(services, connector.companyId, {
      category: 'CONNECTOR_OFFLINE', title: 'Conector Sage offline',
      body: `${connector.name} deixou de responder ao PayHub.`, url: '/#/integration',
      dedupKey: `connector-offline:${connector.id}:${today}`,
    });
  }

  const [failed] = await pool.query<RowDataPacket[]>(
    `SELECT id,company_id companyId,COALESCE(normalization_error,error_message) errorMessage
       FROM import_jobs
      WHERE (status='FAILED' OR normalization_state='FAILED')
        AND updated_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)
      ORDER BY id DESC LIMIT 50`,
  );
  for (const job of failed) {
    await safeNotify(services, Number(job.companyId), {
      category: 'IMPORT_FAILED', title: 'Importação com falha',
      body: `Job #${job.id}: ${String(job.errorMessage ?? 'falha na integração').slice(0, 180)}`,
      url: '/#/integration', dedupKey: `import-failed:${job.id}`,
    });
  }

  const [pendingRows] = await pool.query<RowDataPacket[]>(
    `SELECT company_id companyId,COUNT(*) value
       FROM payrolls
      WHERE is_current=1 AND status IN ('SIGNATURE_REQUESTED','VIEWED')
      GROUP BY company_id`,
  );
  for (const row of pendingRows) {
    const pending = Number(row.value ?? 0);
    if (pending <= 0) continue;
    await safeNotify(services, Number(row.companyId), {
      category: 'PENDING_SIGNATURES', title: 'Assinaturas pendentes',
      body: `${pending} holerite(s) aguardam assinatura.`, url: '/#/payrolls',
      dedupKey: `pending-signatures:${today}`,
    });
  }
}

async function durableWorkerCycle(deps: WorkerDependencies, now = new Date()): Promise<WorkerCycleResult> {
  await heartbeatPhase(deps, 'CLAIMING', null, 'START');
  const normalized = await processClaimedJobs(deps);

  await heartbeatPhase(deps, 'SCHEDULING', null);
  const scheduled = await scheduleCompanyDue(deps.pool, deps.services, now);

  await heartbeatPhase(deps, 'NOTIFYING', null);
  await notifyCompanyOperationalAlerts(deps.pool, deps.services, deps.env.CONNECTOR_OFFLINE_SECONDS, now);
  const pushes = await deps.outbox.dispatch(deps.instanceId, deps.env.WORKER_BATCH_SIZE);

  await heartbeatPhase(deps, 'IDLE', null, 'FINISH');
  return { normalized, scheduled, pushes };
}

export async function workerCycle(deps: WorkerDependencies, now?: Date): Promise<WorkerCycleResult>;
export async function workerCycle(pool: Pool, services: WorkerServices, env: Env, now?: Date): Promise<WorkerCycleResult>;
export async function workerCycle(
  first: WorkerDependencies | Pool,
  second?: WorkerServices | Date,
  third?: Env,
  fourth?: Date,
): Promise<WorkerCycleResult> {
  const maybeDependencies = first as WorkerDependencies;
  if (
    maybeDependencies.pool && maybeDependencies.services && maybeDependencies.env &&
    maybeDependencies.queue && maybeDependencies.outbox && maybeDependencies.heartbeat &&
    maybeDependencies.instanceId && maybeDependencies.state
  ) {
    return durableWorkerCycle(maybeDependencies, second instanceof Date ? second : new Date());
  }

  const pool = first as Pool;
  const services = second as WorkerServices;
  const env = third!;
  // Compatibilidade para callers antigos: caso usem mocks antigos sem a API nova,
  // preservamos o ciclo anterior em vez de quebrar testes/utilitários.
  if (typeof (services.payrolls as any).normalizeClaimedJob !== 'function') {
    const normalized = await normalizeCompanyJobs(pool, services);
    const scheduled = await scheduleCompanyDue(pool, services, fourth ?? new Date());
    await notifyCompanyOperationalAlerts(pool, services, env.CONNECTOR_OFFLINE_SECONDS, fourth ?? new Date());
    return { normalized, scheduled, pushes: { sent: 0, failed: 0, terminal: 0 } };
  }

  const instanceId = `compat-${hostname()}-${process.pid}`.slice(0, 100);
  const deps: WorkerDependencies = {
    pool,
    services,
    env,
    queue: new NormalizationQueueService(pool),
    outbox: new NotificationOutboxService(pool, services.notifications),
    heartbeat: new WorkerHeartbeatService(pool),
    instanceId,
    state: { phase: 'IDLE', jobId: null },
  };
  return durableWorkerCycle(deps, fourth ?? new Date());
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const pool = createMySqlPool(env);
  const services = createServices(pool, env);
  const instanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 12)}`.slice(0, 100);
  const heartbeat = new WorkerHeartbeatService(pool);
  const state: WorkerState = { phase: 'IDLE', jobId: null };
  const deps: WorkerDependencies = {
    pool,
    services,
    env,
    queue: new NormalizationQueueService(pool),
    outbox: new NotificationOutboxService(pool, services.notifications),
    heartbeat,
    instanceId,
    state,
  };

  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  console.log(`PayHub Worker iniciado (${instanceId}).`);

  try {
    await heartbeat.update(instanceId, 'STARTING', 'IDLE', null, null, null);
    while (!stopping) {
      const started = Date.now();
      const watchdog = startWatchdog({
        timeoutMs: env.WORKER_CYCLE_TIMEOUT_SECONDS * 1000,
        snapshot: () => ({ phase: state.phase, jobId: state.jobId }),
        onTimeout: async () => {
          try { await heartbeat.update(instanceId, 'ERROR', state.phase, state.jobId, 'Watchdog: ciclo excedeu o tempo limite.', null); }
          catch { /* processo será encerrado de qualquer forma */ }
        },
      });
      try {
        await durableWorkerCycle(deps, new Date());
      } catch (error) {
        console.error('[worker] ciclo falhou', error);
        try { await heartbeat.update(instanceId, 'ERROR', state.phase, state.jobId, errorText(error), 'FINISH'); }
        catch (heartbeatError) { console.error('[worker] falha ao registrar heartbeat de erro', heartbeatError); }
      } finally {
        watchdog.clear();
      }
      const wait = Math.max(1000, env.WORKER_POLL_SECONDS * 1000 - (Date.now() - started));
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, wait));
    }
  } finally {
    try { await heartbeat.update(instanceId, 'STOPPING', 'IDLE', null, null, null); } catch {}
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) await main();
