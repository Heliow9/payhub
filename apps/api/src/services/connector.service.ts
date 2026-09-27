import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { badRequest, notFound, unauthorized } from '../core/errors.js';
import { randomToken, sha256 } from '../core/security.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { StorageService } from './storage.service.js';
import { PayrollRunEventService } from './payroll-run-event.service.js';

const gunzipAsync=promisify(gunzip);

export type ImportJobType = 'CONNECTION_TEST' | 'SCHEMA_DISCOVERY' | 'PAYROLL_IMPORT' | 'EMPLOYEE_LOOKUP_BY_CPF';

export class ConnectorService {
  constructor(private pool: Pool, private audit: AuditService, private storage?: StorageService, private runEvents?: PayrollRunEventService) {}

  private async safeRunEvent(action: () => Promise<void>): Promise<void> {
    if (!this.runEvents) return;
    try {
      await action();
    } catch (error) {
      // Observabilidade nunca pode impedir claim, coleta ou conclusão do job.
      console.error('[connector] falha ao registrar timeline do payroll run', error);
    }
  }

  async listConnectors(companyId: number): Promise<Record<string, unknown>[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(`SELECT id,company_id companyId,name,machine_name machineName,status,last_seen_at lastSeenAt,last_ip_address lastIpAddress,metadata_json metadataJson,created_at createdAt,updated_at updatedAt FROM connectors WHERE company_id=? ORDER BY id DESC`, [companyId]);
    return rows.map((r) => ({ ...r, metadata: parseJson(r.metadataJson, null), metadataJson: undefined }));
  }

  async createConnector(companyId:number,actorId:number,name:string,meta:RequestMeta):Promise<{id:number;token:string}>{const clean=name.trim();if(clean.length<2)throw badRequest('Nome do conector inválido.');const token=randomToken(32);const [result]=await this.pool.execute<ResultSetHeader>(`INSERT INTO connectors (company_id,name,token_hash,status,created_by_user_id,created_at,updated_at) VALUES (?,?,?,'PENDING',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[companyId,clean,sha256(token),actorId]);await this.audit.record({companyId,actorUserId:actorId,action:'CONNECTOR_CREATED',targetType:'CONNECTOR',targetId:result.insertId,meta});return{id:result.insertId,token};}

  async authenticateConnector(connectorId:number,token:string|undefined):Promise<{connectorId:number;companyId:number}>{if(!connectorId||!token)throw unauthorized('Conector não autenticado.');const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,company_id companyId,status,token_hash tokenHash FROM connectors WHERE id=? LIMIT 1`,[connectorId]);const row=rows[0];if(!row||row.status==='DISABLED'||String(row.tokenHash)!==sha256(token))throw unauthorized('Token do conector inválido.');return{connectorId:Number(row.id),companyId:Number(row.companyId)};}

  async heartbeat(connectorId:number,companyId:number,machineName:string,metadata:unknown,ip:string|null):Promise<void>{await this.pool.execute(`UPDATE connectors SET machine_name=?,status='ONLINE',last_seen_at=UTC_TIMESTAMP(),last_ip_address=?,metadata_json=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND company_id=?`,[machineName.slice(0,190),ip,JSON.stringify(metadata??{}),connectorId,companyId]);}

  async markOfflineStale(seconds:number):Promise<Array<{id:number;companyId:number;name:string}>>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,company_id companyId,name FROM connectors WHERE status='ONLINE' AND last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)`,[seconds]);if(rows.length)await this.pool.execute(`UPDATE connectors SET status='OFFLINE',updated_at=UTC_TIMESTAMP() WHERE status='ONLINE' AND last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)`,[seconds]);return rows.map((row)=>({id:Number(row.id),companyId:Number(row.companyId),name:String(row.name)}));}

  async createJob(input:{companyId:number;requestedByUserId?:number|null;jobType:ImportJobType;scope?:Record<string,unknown>|null;payrollRunId?:number|null}):Promise<number>{const [companyRows]=await this.pool.execute<RowDataPacket[]>(`SELECT sage_company_code companyCode FROM companies WHERE id=? AND status='ACTIVE' LIMIT 1`,[input.companyId]);if(!companyRows[0])throw notFound('Empresa não encontrada.');const scope={...(input.scope??{}),payhubCompanyId:input.companyId,companyCode:String(companyRows[0].companyCode)};const [result]=await this.pool.execute<ResultSetHeader>(`INSERT INTO import_jobs (company_id,requested_by_user_id,connector_id,payroll_run_id,job_type,status,scope_json,progress_current,progress_total,attempt_count,created_at,updated_at) VALUES (?,?,NULL,?,?,'QUEUED',?,0,0,0,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[input.companyId,input.requestedByUserId??null,input.payrollRunId??null,input.jobType,JSON.stringify(scope)]);return result.insertId;}

  async getJob(companyId:number,id:number):Promise<Record<string,unknown>>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,company_id companyId,requested_by_user_id requestedByUserId,connector_id connectorId,payroll_run_id payrollRunId,job_type jobType,status,scope_json scopeJson,progress_current progressCurrent,progress_total progressTotal,progress_message progressMessage,attempt_count attemptCount,claimed_at claimedAt,started_at startedAt,finished_at finishedAt,normalized_at normalizedAt,normalization_state normalizationState,normalization_attempt_count normalizationAttemptCount,normalization_error normalizationError,normalization_claimed_at normalizationClaimedAt,normalization_lease_until normalizationLeaseUntil,error_message errorMessage,created_at createdAt,updated_at updatedAt FROM import_jobs WHERE id=? AND company_id=? LIMIT 1`,[id,companyId]);if(!rows[0])throw notFound('Job não encontrado.');const r=rows[0];return{...r,scope:parseJson(r.scopeJson,null),scopeJson:undefined};}
  async listJobs(companyId:number,limit=100):Promise<Record<string,unknown>[]>{const safe=Math.min(Math.max(limit,1),300);const [rows]=await this.pool.query<RowDataPacket[]>(`SELECT id,company_id companyId,requested_by_user_id requestedByUserId,connector_id connectorId,payroll_run_id payrollRunId,job_type jobType,status,scope_json scopeJson,progress_current progressCurrent,progress_total progressTotal,progress_message progressMessage,attempt_count attemptCount,claimed_at claimedAt,started_at startedAt,finished_at finishedAt,normalized_at normalizedAt,normalization_state normalizationState,normalization_attempt_count normalizationAttemptCount,normalization_error normalizationError,normalization_claimed_at normalizationClaimedAt,normalization_lease_until normalizationLeaseUntil,error_message errorMessage,created_at createdAt,updated_at updatedAt FROM import_jobs WHERE company_id=? ORDER BY id DESC LIMIT ${safe}`,[companyId]);return rows.map((r)=>({...r,scope:parseJson(r.scopeJson,null),scopeJson:undefined}));}

  async claimNext(connectorId:number,companyId:number):Promise<Record<string,unknown>|null>{
    const conn=await this.pool.getConnection();
    let claimed:{id:number;payrollRunId:number|null}|null=null;
    try{
      await conn.beginTransaction();
      const [rows]=await conn.query<RowDataPacket[]>(`SELECT id,payroll_run_id payrollRunId FROM import_jobs WHERE status='QUEUED' AND company_id=? ORDER BY id ASC LIMIT 1 FOR UPDATE`,[companyId]);
      const row=rows[0];
      if(!row){await conn.rollback();return null;}
      claimed={id:Number(row.id),payrollRunId:row.payrollRunId==null?null:Number(row.payrollRunId)};
      await conn.execute(`UPDATE import_jobs SET status='RUNNING',connector_id=?,claimed_at=UTC_TIMESTAMP(),started_at=COALESCE(started_at,UTC_TIMESTAMP()),attempt_count=attempt_count+1,updated_at=UTC_TIMESTAMP() WHERE id=? AND company_id=?`,[connectorId,row.id,companyId]);
      if(row.payrollRunId)await conn.execute(`UPDATE payroll_runs SET status='RUNNING',started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=? AND company_id=?`,[row.payrollRunId,companyId]);
      await conn.commit();
    }catch(error){
      await conn.rollback().catch(()=>{});
      throw error;
    }finally{
      conn.release();
    }
    if(!claimed)return null;
    if(claimed.payrollRunId){
      await this.safeRunEvent(()=>this.runEvents!.append({companyId,payrollRunId:claimed!.payrollRunId!,eventType:'CONNECTOR_CLAIMED',stage:'SAGE',dedupKey:`connector-claimed:${claimed!.id}`,message:`Conector Sage assumiu o job #${claimed!.id}.`,metadata:{jobId:claimed!.id,connectorId}}));
    }
    return this.getJob(companyId,claimed.id);
  }

  private async assertOwnedJob(jobId:number,connectorId:number,companyId:number,conn:PoolConnection|Pool=this.pool):Promise<void>{const [rows]=await conn.execute<RowDataPacket[]>(`SELECT id FROM import_jobs WHERE id=? AND connector_id=? AND company_id=? AND status='RUNNING' LIMIT 1`,[jobId,connectorId,companyId]);if(!rows[0])throw badRequest('Job não está em execução neste conector.');}
  async progress(jobId:number,connectorId:number,companyId:number,current:number,total:number,message?:string|null):Promise<void>{await this.assertOwnedJob(jobId,connectorId,companyId);await this.pool.execute(`UPDATE import_jobs SET progress_current=?,progress_total=?,progress_message=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND company_id=?`,[Math.max(0,current),Math.max(0,total),message?.slice(0,500)??null,jobId,companyId]);}
  async appendLog(jobId:number,connectorId:number,companyId:number,level:string,message:string,metadata?:unknown):Promise<void>{await this.assertOwnedJob(jobId,connectorId,companyId);const safeLevel=(['INFO','WARN','ERROR'].includes(level)?level:'INFO') as 'INFO'|'WARN'|'ERROR';await this.pool.execute(`INSERT INTO connector_job_logs (company_id,job_id,connector_id,level,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP())`,[companyId,jobId,connectorId,safeLevel,message.slice(0,1000),metadata?JSON.stringify(metadata):null]);await this.safeRunEvent(()=>this.runEvents!.appendForJob(companyId,jobId,{eventType:'CONNECTOR_LOG',stage:'SAGE',level:safeLevel,message,metadata}));}
  async storeBatch(jobId:number,connectorId:number,companyId:number,sourceTable:string,batchNumber:number,rows:unknown[]):Promise<void>{await this.assertOwnedJob(jobId,connectorId,companyId);const payload=JSON.stringify(rows);await this.pool.execute(`INSERT INTO connector_raw_batches (company_id,job_id,connector_id,source_table,batch_number,row_count,source_hash,payload_json,archived_path,archived_sha256,archived_bytes,archived_at,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE row_count=VALUES(row_count),source_hash=VALUES(source_hash),payload_json=VALUES(payload_json),archived_path=NULL,archived_sha256=NULL,archived_bytes=NULL,archived_at=NULL,created_at=UTC_TIMESTAMP()`,[companyId,jobId,connectorId,sourceTable.slice(0,80),Math.max(0,batchNumber),rows.length,sha256(payload),payload]);}
  async complete(jobId:number,connectorId:number,companyId:number,message?:string|null):Promise<void>{await this.assertOwnedJob(jobId,connectorId,companyId);await this.pool.execute(`UPDATE import_jobs SET status='COMPLETED',finished_at=UTC_TIMESTAMP(),progress_message=?,normalization_state=IF(job_type='PAYROLL_IMPORT','PENDING',normalization_state),normalization_owner=NULL,normalization_lease_until=NULL,normalization_error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=? AND company_id=?`,[message?.slice(0,500)??null,jobId,companyId]);await this.safeRunEvent(()=>this.runEvents!.appendForJob(companyId,jobId,{eventType:'COLLECTION_COMPLETED',stage:'SAGE',dedupKey:`collection-completed:${jobId}`,message:message?.trim()||`Coleta Sage do job #${jobId} concluída.`,metadata:{jobId,connectorId}}));}
  async fail(jobId:number,connectorId:number,companyId:number,errorMessage:string):Promise<void>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,payroll_run_id payrollRunId FROM import_jobs WHERE id=? AND connector_id=? AND company_id=? LIMIT 1`,[jobId,connectorId,companyId]);if(!rows[0])throw badRequest('Job inválido.');await this.pool.execute(`UPDATE import_jobs SET status='FAILED',finished_at=UTC_TIMESTAMP(),error_message=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND company_id=?`,[errorMessage.slice(0,1000),jobId,companyId]);if(rows[0].payrollRunId){await this.pool.execute(`UPDATE payroll_runs SET status='FAILED',failure_count=employee_count,message=?,finished_at=UTC_TIMESTAMP() WHERE id=? AND company_id=?`,[errorMessage.slice(0,500),rows[0].payrollRunId,companyId]);await this.safeRunEvent(()=>this.runEvents!.append({companyId,payrollRunId:Number(rows[0]!.payrollRunId),eventType:'COLLECTION_FAILED',stage:'SAGE',level:'ERROR',dedupKey:`collection-failed:${jobId}`,message:`Falha na coleta Sage: ${errorMessage}`.slice(0,1000),metadata:{jobId,connectorId}}));}}
  async listLogs(companyId:number,jobId:number):Promise<Record<string,unknown>[]>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,level,message,metadata_json metadataJson,created_at createdAt FROM connector_job_logs WHERE job_id=? AND company_id=? ORDER BY id ASC LIMIT 500`,[jobId,companyId]);const connectorLogs=rows.map((r)=>({...r,key:`connector-${r.id}`,source:'CONNECTOR',stage:'SAGE',eventType:'CONNECTOR_LOG',metadata:parseJson(r.metadataJson,null),metadataJson:undefined}));const [jobs]=await this.pool.execute<RowDataPacket[]>(`SELECT payroll_run_id payrollRunId FROM import_jobs WHERE id=? AND company_id=? LIMIT 1`,[jobId,companyId]);const runId=jobs[0]?.payrollRunId==null?null:Number(jobs[0].payrollRunId);const runLogs=runId&&this.runEvents?(await this.runEvents.list(companyId,runId,500)).filter((entry:any)=>entry.eventType!=='CONNECTOR_LOG'):[];const seen=new Set<string>();return [...connectorLogs,...runLogs].sort((a:any,b:any)=>new Date(String(a.createdAt)).getTime()-new Date(String(b.createdAt)).getTime()).filter((entry:any)=>{const key=`${entry.source}:${entry.eventType}:${entry.message}:${entry.createdAt}`;if(seen.has(key))return false;seen.add(key);return true;});}
  async rawRows(companyId:number,jobId:number,sourceTable?:string):Promise<unknown[]>{
    const params:Array<number|string>=[jobId,companyId];let sql=`SELECT payload_json payload,archived_path archivedPath,archived_sha256 archivedSha256 FROM connector_raw_batches WHERE job_id=? AND company_id=?`;if(sourceTable){sql+=` AND source_table=?`;params.push(sourceTable);}sql+=` ORDER BY source_table,batch_number`;const [rows]=await this.pool.execute<RowDataPacket[]>(sql,params);
    const result:unknown[]=[];
    for(const row of rows){
      if(row.payload!=null){result.push(...parseJson<unknown[]>(row.payload,[]));continue;}
      if(!row.archivedPath||!this.storage)continue;
      try{const compressed=await this.storage.read(String(row.archivedPath));if(row.archivedSha256&&sha256(compressed)!==String(row.archivedSha256))throw new Error('Hash do batch arquivado não confere.');const payload=(await gunzipAsync(compressed)).toString('utf8');result.push(...parseJson<unknown[]>(payload,[]));}catch(error){console.error(`[connector] falha ao ler batch arquivado do job ${jobId}`,error);}
    }
    return result;
  }
}
