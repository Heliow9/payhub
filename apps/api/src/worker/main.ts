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

export type WorkerServices = Pick<PayHubServices, 'payrolls' | 'notifications' | 'runs' | 'connector'>;

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
      console.log(`[worker] job ${jobId} normalizado`, result);
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
        console.error(`[worker] falha ao notificar empresa ${companyId} sobre job ${jobId}`, notifyError);
      }
    }
  }
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

async function safeNotify(
  services: Pick<WorkerServices, 'notifications'>,
  companyId: number,
  input: Parameters<WorkerServices['notifications']['notifyAdmins']>[1],
): Promise<void> {
  try { await services.notifications.notifyAdmins(companyId, input); }
  catch (error) { console.error(`[worker] falha ao notificar empresa ${companyId}`, error); }
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
    `SELECT id,company_id companyId,error_message errorMessage
       FROM import_jobs
      WHERE status='FAILED' AND finished_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)
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

export async function workerCycle(pool: Pool, services: WorkerServices, env: Env, now = new Date()): Promise<void> {
  await normalizeCompanyJobs(pool, services);
  await scheduleCompanyDue(pool, services, now);
  await notifyCompanyOperationalAlerts(pool, services, env.CONNECTOR_OFFLINE_SECONDS, now);
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const pool = createMySqlPool(env);
  const services = createServices(pool, env);
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  console.log('PayHub Worker iniciado.');
  try {
    while (!stopping) {
      const started = Date.now();
      try { await workerCycle(pool, services, env); }
      catch (e) { console.error('[worker] ciclo falhou', e); }
      const wait = Math.max(1000, env.WORKER_POLL_SECONDS * 1000 - (Date.now() - started));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) await main();
