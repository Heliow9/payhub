import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';
import { createServices } from '../app.js';
import { brasiliaParts, brDateKey, brTimeKey } from '../core/time.js';

loadDotEnv();const env=loadEnv();const pool=createMySqlPool(env);const services=createServices(pool,env);let stopping=false;

async function normalizePending(){const [rows]=await pool.query<RowDataPacket[]>(`SELECT id FROM import_jobs WHERE job_type='PAYROLL_IMPORT' AND status='COMPLETED' AND normalized_at IS NULL ORDER BY id ASC LIMIT 20`);for(const row of rows){try{const result=await services.payrolls.normalizeCompletedJob(Number(row.id));console.log(`[worker] job ${row.id} normalizado`,result);}catch(error){console.error(`[worker] falha ao normalizar job ${row.id}`,error);await services.notifications.notifyAdmins({category:'IMPORT_FAILED',title:'Falha ao processar holerites',body:`O job #${row.id} falhou durante a normalização. Verifique a Integração Sage.`,url:'/#/integration',dedupKey:`normalize-failed:${row.id}`});}}}

async function scheduleDue(){const p=brasiliaParts();if(p.weekday>5)return;const time=brTimeKey();const date=brDateKey();const [rows]=await pool.execute<RowDataPacket[]>(`SELECT s.id scheduleId,s.group_id groupId FROM group_schedules s JOIN employee_groups g ON g.id=s.group_id WHERE s.enabled=1 AND g.auto_search_enabled=1 AND g.status='ACTIVE' AND TIME_FORMAT(s.run_time,'%H:%i:00')=?`,[time]);for(const row of rows){const [insert]=await pool.execute<ResultSetHeader>(`INSERT IGNORE INTO schedule_executions (schedule_id,group_id,run_date,run_time,payroll_run_id,created_at) VALUES (?,?,?, ?,NULL,UTC_TIMESTAMP())`,[row.scheduleId,row.groupId,date,time]);if(insert.affectedRows===0)continue;try{const started=await services.runs.startGroup(0,Number(row.groupId),{ipAddress:null,userAgent:'payhub-worker'},'SCHEDULED');await pool.execute(`UPDATE schedule_executions SET payroll_run_id=? WHERE id=?`,[started.runId,insert.insertId]);console.log(`[worker] agenda ${row.scheduleId}: run ${started.runId}, job ${started.jobId}`);}catch(error){console.error(`[worker] agenda ${row.scheduleId} falhou`,error);}}}

async function notifyOperationalAlerts(){
  const offline=await services.connector.markOfflineStale(env.CONNECTOR_OFFLINE_SECONDS);
  const today=brDateKey();
  for(const connector of offline)await services.notifications.notifyAdmins({category:'CONNECTOR_OFFLINE',title:'Conector Sage offline',body:`${connector.name} deixou de responder ao PayHub.`,url:'/#/integration',dedupKey:`connector-offline:${connector.id}:${today}`});
  const [failed]=await pool.query<RowDataPacket[]>(`SELECT id,error_message errorMessage FROM import_jobs WHERE status='FAILED' AND finished_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) ORDER BY id DESC LIMIT 20`);
  for(const job of failed)await services.notifications.notifyAdmins({category:'IMPORT_FAILED',title:'Importação com falha',body:`Job #${job.id}: ${String(job.errorMessage??'falha na integração').slice(0,180)}`,url:'/#/integration',dedupKey:`import-failed:${job.id}`});
  const [pendingRows]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) value FROM payrolls WHERE is_current=1 AND status IN ('SIGNATURE_REQUESTED','VIEWED')`);const pending=Number(pendingRows[0]?.value??0);
  if(pending>0)await services.notifications.notifyAdmins({category:'PENDING_SIGNATURES',title:'Assinaturas pendentes',body:`${pending} holerite(s) aguardam assinatura.`,url:'/#/payrolls',dedupKey:`pending-signatures:${today}`});
}

async function cycle(){await notifyOperationalAlerts();await normalizePending();await scheduleDue();}
async function loop(){console.log('PayHub Worker iniciado.');while(!stopping){const started=Date.now();try{await cycle();}catch(e){console.error('[worker] ciclo falhou',e);}const wait=Math.max(1000,env.WORKER_POLL_SECONDS*1000-(Date.now()-started));await new Promise((resolve)=>setTimeout(resolve,wait));}await pool.end();}
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});await loop();
