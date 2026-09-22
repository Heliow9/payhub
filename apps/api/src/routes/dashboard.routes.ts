import { Router } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { requireUser } from '../middleware/auth.js';

export type WorkerHealth = {
  status: 'HEALTHY' | 'STALE' | 'OFFLINE' | 'ERROR';
  phase: 'IDLE' | 'CLAIMING' | 'NORMALIZING' | 'SCHEDULING' | 'NOTIFYING';
  currentJobId: number | null;
  lastHeartbeatAt: Date | string | null;
};

export function workerHealthFromRow(row:RowDataPacket|undefined,pollSeconds:number,now=new Date()):WorkerHealth{
  if(!row)return{status:'OFFLINE',phase:'IDLE',currentJobId:null,lastHeartbeatAt:null};
  const phase=String(row.phase??'IDLE') as WorkerHealth['phase'];
  const rawLast=row.lastHeartbeatAt as string|Date|null|undefined;
  const last=rawLast ? new Date(rawLast instanceof Date?rawLast.getTime():rawLast) : null;
  if(String(row.status)==='ERROR')return{status:'ERROR',phase,currentJobId:row.currentJobId==null?null:Number(row.currentJobId),lastHeartbeatAt:last};
  if(!last||Number.isNaN(last.getTime()))return{status:'OFFLINE',phase,currentJobId:row.currentJobId==null?null:Number(row.currentJobId),lastHeartbeatAt:null};
  const ageSeconds=Math.max(0,(now.getTime()-last.getTime())/1000);
  const healthyWindow=Math.max(10,pollSeconds*2);
  const offlineWindow=Math.max(60,pollSeconds*6);
  const status:WorkerHealth['status']=ageSeconds<=healthyWindow?'HEALTHY':ageSeconds<=offlineWindow?'STALE':'OFFLINE';
  return{status,phase,currentJobId:row.currentJobId==null?null:Number(row.currentJobId),lastHeartbeatAt:last};
}


export function payrollRunDisplayStatus(row:RowDataPacket):string{
  const runStatus=String(row.status??'');
  if(['COMPLETED','PARTIAL','FAILED'].includes(runStatus))return runStatus;
  const jobStatus=String(row.jobStatus??'');
  const normalizationState=String(row.normalizationState??'');
  if(jobStatus==='FAILED')return'COLLECTION_FAILED';
  if(normalizationState==='FAILED')return'GENERATION_FAILED';
  if(normalizationState==='CLAIMED')return'GENERATING';
  if(jobStatus==='COMPLETED'&&(normalizationState==='PENDING'||!normalizationState))return'AWAITING_PROCESSING';
  if(jobStatus==='COMPLETED'&&normalizationState==='COMPLETED')return'FINALIZING';
  if(jobStatus==='RUNNING')return'COLLECTING';
  if(jobStatus==='QUEUED')return'QUEUED';
  return runStatus||jobStatus||'QUEUED';
}

export function dashboardRoutes(pool: Pool, workerPollSeconds = 20) {
  const r = Router();
  r.use(requireUser);

  r.get('/', async (req, res, next) => {
    try {
      const companyId = req.principal!.companyId;
      const q = async (sql: string) => {
        const [rows] = await pool.execute<RowDataPacket[]>(sql, [companyId]);
        return Number(rows[0]?.value ?? 0);
      };

      const [employees, groups, ready, pending, signed, failed] = await Promise.all([
        q(`SELECT COUNT(*) value FROM employees WHERE company_id=? AND status='ACTIVE'`),
        q(`SELECT COUNT(*) value FROM employee_groups WHERE company_id=? AND status='ACTIVE'`),
        q(`SELECT COUNT(*) value FROM payrolls WHERE company_id=? AND is_current=1 AND status='READY'`),
        q(`SELECT COUNT(*) value FROM payrolls WHERE company_id=? AND is_current=1 AND status IN ('SIGNATURE_REQUESTED','VIEWED')`),
        q(`SELECT COUNT(*) value FROM payrolls WHERE company_id=? AND is_current=1 AND status='SIGNED'`),
        q(`SELECT COUNT(*) value FROM import_jobs WHERE company_id=? AND (status='FAILED' OR normalization_state='FAILED') AND updated_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)`),
      ]);

      const [connectors] = await pool.execute<RowDataPacket[]>(
        `SELECT id,name,status,last_seen_at lastSeenAt,machine_name machineName
           FROM connectors
          WHERE company_id=?
          ORDER BY id DESC`,
        [companyId],
      );
      const [runRows] = await pool.execute<RowDataPacket[]>(
        `SELECT r.id,r.source,r.status,r.year,r.month,r.employee_count employeeCount,
                r.success_count successCount,r.failure_count failureCount,r.message,
                r.created_at createdAt,r.started_at startedAt,r.finished_at finishedAt,g.name groupName,
                TIMESTAMPDIFF(SECOND,COALESCE(r.started_at,r.created_at),COALESCE(r.finished_at,UTC_TIMESTAMP())) durationSeconds,
                j.id jobId,j.status jobStatus,j.normalization_state normalizationState,j.normalized_at normalizedAt
           FROM payroll_runs r
           LEFT JOIN employee_groups g ON g.id=r.group_id AND g.company_id=r.company_id
           LEFT JOIN import_jobs j ON j.payroll_run_id=r.id AND j.company_id=r.company_id AND j.job_type='PAYROLL_IMPORT'
          WHERE r.company_id=?
          ORDER BY r.id DESC LIMIT 10`,
        [companyId],
      );
      const runs=runRows.map((row)=>({
        ...row,
        displayStatus:payrollRunDisplayStatus(row),
        jobStatus:undefined,
        normalizationState:undefined,
        normalizedAt:undefined,
      }));
      const [workerRows] = await pool.query<RowDataPacket[]>(
        `SELECT status,phase,current_job_id currentJobId,last_heartbeat_at lastHeartbeatAt
           FROM worker_heartbeats
          WHERE worker_name='payhub-worker'
          LIMIT 1`,
      );
      const workerHealth=workerHealthFromRow(workerRows[0],workerPollSeconds);

      res.json({ metrics: { employees, groups, ready, pending, signed, failed }, connectors, runs, workerHealth });
    } catch (e) { next(e); }
  });

  return r;
}
