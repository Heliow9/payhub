import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, notFound, unauthorized } from '../core/errors.js';
import { randomToken, sha256 } from '../core/security.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';

export type ImportJobType = 'CONNECTION_TEST' | 'SCHEMA_DISCOVERY' | 'PAYROLL_IMPORT' | 'EMPLOYEE_LOOKUP_BY_CPF';

export class ConnectorService {
  constructor(private pool: Pool, private audit: AuditService) {}

  async listConnectors(): Promise<Record<string, unknown>[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id,name,machine_name machineName,status,last_seen_at lastSeenAt,last_ip_address lastIpAddress,metadata_json metadataJson,created_at createdAt,updated_at updatedAt
       FROM connectors ORDER BY id DESC`
    );
    return rows.map((r) => ({ ...r, metadata: parseJson(r.metadataJson, null), metadataJson: undefined }));
  }

  async createConnector(actorId: number, name: string, meta: RequestMeta): Promise<{id:number;token:string}> {
    const clean = name.trim(); if (clean.length < 2) throw badRequest('Nome do conector inválido.');
    const token = randomToken(32);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO connectors (name,token_hash,status,created_by_user_id,created_at,updated_at) VALUES (?,?,'PENDING',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [clean, sha256(token), actorId]
    );
    await this.audit.record({actorUserId:actorId,action:'CONNECTOR_CREATED',targetType:'CONNECTOR',targetId:result.insertId,meta});
    return {id:result.insertId,token};
  }

  async authenticateConnector(connectorId: number, token: string | undefined): Promise<void> {
    if (!connectorId || !token) throw unauthorized('Conector não autenticado.');
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT id,status,token_hash tokenHash FROM connectors WHERE id=? LIMIT 1`,[connectorId]);
    const row=rows[0];
    if (!row || row.status==='DISABLED' || String(row.tokenHash)!==sha256(token)) throw unauthorized('Token do conector inválido.');
  }

  async heartbeat(connectorId:number,machineName:string,metadata:unknown,ip:string|null):Promise<void>{
    await this.pool.execute(`UPDATE connectors SET machine_name=?,status='ONLINE',last_seen_at=UTC_TIMESTAMP(),last_ip_address=?,metadata_json=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,
      [machineName.slice(0,190),ip,JSON.stringify(metadata??{}),connectorId]);
  }

  async markOfflineStale(seconds:number):Promise<void>{
    await this.pool.execute(`UPDATE connectors SET status='OFFLINE',updated_at=UTC_TIMESTAMP() WHERE status='ONLINE' AND last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)`,[seconds]);
  }

  async createJob(input:{requestedByUserId?:number|null;jobType:ImportJobType;scope?:Record<string,unknown>|null;payrollRunId?:number|null}):Promise<number>{
    const [result]=await this.pool.execute<ResultSetHeader>(
      `INSERT INTO import_jobs (requested_by_user_id,connector_id,payroll_run_id,job_type,status,scope_json,progress_current,progress_total,attempt_count,created_at,updated_at)
       VALUES (?,NULL,?,?,'QUEUED',?,0,0,0,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [input.requestedByUserId??null,input.payrollRunId??null,input.jobType,input.scope?JSON.stringify(input.scope):null]
    );
    return result.insertId;
  }

  async getJob(id:number):Promise<Record<string,unknown>>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(
      `SELECT id,requested_by_user_id requestedByUserId,connector_id connectorId,payroll_run_id payrollRunId,job_type jobType,status,scope_json scopeJson,
      progress_current progressCurrent,progress_total progressTotal,progress_message progressMessage,attempt_count attemptCount,claimed_at claimedAt,started_at startedAt,
      finished_at finishedAt,normalized_at normalizedAt,error_message errorMessage,created_at createdAt,updated_at updatedAt FROM import_jobs WHERE id=? LIMIT 1`,[id]);
    if(!rows[0]) throw notFound('Job não encontrado.');
    const r=rows[0]; return {...r,scope:parseJson(r.scopeJson,null),scopeJson:undefined};
  }

  async listJobs(limit=100):Promise<Record<string,unknown>[]>{
    const safe=Math.min(Math.max(limit,1),300);
    const [rows]=await this.pool.query<RowDataPacket[]>(
      `SELECT id,requested_by_user_id requestedByUserId,connector_id connectorId,payroll_run_id payrollRunId,job_type jobType,status,scope_json scopeJson,
      progress_current progressCurrent,progress_total progressTotal,progress_message progressMessage,attempt_count attemptCount,claimed_at claimedAt,started_at startedAt,
      finished_at finishedAt,normalized_at normalizedAt,error_message errorMessage,created_at createdAt,updated_at updatedAt FROM import_jobs ORDER BY id DESC LIMIT ${safe}`);
    return rows.map((r)=>({...r,scope:parseJson(r.scopeJson,null),scopeJson:undefined}));
  }

  async claimNext(connectorId:number):Promise<Record<string,unknown>|null>{
    const conn=await this.pool.getConnection();
    try{
      await conn.beginTransaction();
      const [rows]=await conn.query<RowDataPacket[]>(`SELECT id,payroll_run_id payrollRunId FROM import_jobs WHERE status='QUEUED' ORDER BY id ASC LIMIT 1 FOR UPDATE`);
      const row=rows[0]; if(!row){await conn.rollback();return null;}
      await conn.execute(`UPDATE import_jobs SET status='RUNNING',connector_id=?,claimed_at=UTC_TIMESTAMP(),started_at=COALESCE(started_at,UTC_TIMESTAMP()),attempt_count=attempt_count+1,updated_at=UTC_TIMESTAMP() WHERE id=?`,[connectorId,row.id]);
      if(row.payrollRunId) await conn.execute(`UPDATE payroll_runs SET status='RUNNING',started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=?`,[row.payrollRunId]);
      await conn.commit();
      return this.getJob(Number(row.id));
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }

  private async assertOwnedJob(jobId:number,connectorId:number,conn:PoolConnection|Pool=this.pool):Promise<void>{
    const [rows]=await conn.execute<RowDataPacket[]>(`SELECT id FROM import_jobs WHERE id=? AND connector_id=? AND status='RUNNING' LIMIT 1`,[jobId,connectorId]);
    if(!rows[0]) throw badRequest('Job não está em execução neste conector.');
  }

  async progress(jobId:number,connectorId:number,current:number,total:number,message?:string|null):Promise<void>{
    await this.assertOwnedJob(jobId,connectorId);
    await this.pool.execute(`UPDATE import_jobs SET progress_current=?,progress_total=?,progress_message=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[Math.max(0,current),Math.max(0,total),message?.slice(0,500)??null,jobId]);
  }

  async appendLog(jobId:number,connectorId:number,level:string,message:string,metadata?:unknown):Promise<void>{
    await this.assertOwnedJob(jobId,connectorId);
    const safeLevel=['INFO','WARN','ERROR'].includes(level)?level:'INFO';
    await this.pool.execute(`INSERT INTO connector_job_logs (job_id,connector_id,level,message,metadata_json,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())`,[jobId,connectorId,safeLevel,message.slice(0,1000),metadata?JSON.stringify(metadata):null]);
  }

  async storeBatch(jobId:number,connectorId:number,sourceTable:string,batchNumber:number,rows:unknown[]):Promise<void>{
    await this.assertOwnedJob(jobId,connectorId);
    const payload=JSON.stringify(rows);
    await this.pool.execute(
      `INSERT INTO connector_raw_batches (job_id,connector_id,source_table,batch_number,row_count,source_hash,payload_json,created_at)
       VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE row_count=VALUES(row_count),source_hash=VALUES(source_hash),payload_json=VALUES(payload_json),created_at=UTC_TIMESTAMP()`,
      [jobId,connectorId,sourceTable.slice(0,80),Math.max(0,batchNumber),rows.length,sha256(payload),payload]);
  }

  async complete(jobId:number,connectorId:number,message?:string|null):Promise<void>{
    await this.assertOwnedJob(jobId,connectorId);
    await this.pool.execute(`UPDATE import_jobs SET status='COMPLETED',finished_at=UTC_TIMESTAMP(),progress_message=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[message?.slice(0,500)??null,jobId]);
  }

  async fail(jobId:number,connectorId:number,errorMessage:string):Promise<void>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,payroll_run_id payrollRunId FROM import_jobs WHERE id=? AND connector_id=? LIMIT 1`,[jobId,connectorId]);
    if(!rows[0]) throw badRequest('Job inválido.');
    await this.pool.execute(`UPDATE import_jobs SET status='FAILED',finished_at=UTC_TIMESTAMP(),error_message=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[errorMessage.slice(0,1000),jobId]);
    if(rows[0].payrollRunId) await this.pool.execute(`UPDATE payroll_runs SET status='FAILED',failure_count=employee_count,message=?,finished_at=UTC_TIMESTAMP() WHERE id=?`,[errorMessage.slice(0,500),rows[0].payrollRunId]);
  }

  async listLogs(jobId:number):Promise<Record<string,unknown>[]>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,level,message,metadata_json metadataJson,created_at createdAt FROM connector_job_logs WHERE job_id=? ORDER BY id DESC LIMIT 500`,[jobId]);
    return rows.map((r)=>({...r,metadata:parseJson(r.metadataJson,null),metadataJson:undefined}));
  }

  async rawRows(jobId:number,sourceTable?:string):Promise<unknown[]>{
    const params:Array<number|string>=[jobId];
    let sql=`SELECT payload_json payload FROM connector_raw_batches WHERE job_id=?`;
    if(sourceTable){sql+=` AND source_table=?`;params.push(sourceTable);}
    sql+=` ORDER BY source_table,batch_number`;
    const [rows]=await this.pool.execute<RowDataPacket[]>(sql,params);
    return rows.flatMap((r)=>parseJson<unknown[]>(r.payload,[]));
  }
}
