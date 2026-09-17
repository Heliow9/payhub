import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { isValidCpf, normalizeCpf } from '../core/security.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { ConnectorService } from './connector.service.js';

export interface EmployeeLookupResult {
  sageEmployeeCode: string;
  name: string;
  cpf: string;
  birthDate: string;
  admissionDate?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  status?: string | null;
  raw?: Record<string, unknown>;
}

export class EmployeeService {
  constructor(private pool:Pool, private connector:ConnectorService, private audit:AuditService){}

  async startLookup(actorId:number,cpfInput:string,meta:RequestMeta):Promise<number>{
    const cpf=normalizeCpf(cpfInput);
    if(!isValidCpf(cpf)) throw badRequest('CPF inválido.');
    const [existing]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM employees WHERE cpf=? LIMIT 1`,[cpf]);
    if(existing[0]) throw conflict('Este funcionário já está cadastrado no PayHub.');
    const jobId=await this.connector.createJob({requestedByUserId:actorId,jobType:'EMPLOYEE_LOOKUP_BY_CPF',scope:{companyCode:'1',cpf}});
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_LOOKUP_REQUESTED',targetType:'IMPORT_JOB',targetId:jobId,meta,metadata:{cpfLast4:cpf.slice(-4)}});
    return jobId;
  }

  async lookupResult(jobId:number):Promise<{status:string;employee:EmployeeLookupResult|null;message?:string|null}>{
    const job=await this.connector.getJob(jobId);
    if(job.jobType!=='EMPLOYEE_LOOKUP_BY_CPF') throw badRequest('Job não é uma consulta de funcionário.');
    if(job.status==='FAILED') return {status:'FAILED',employee:null,message:String(job.errorMessage??'Falha ao consultar Sage.')};
    if(job.status!=='COMPLETED') return {status:String(job.status),employee:null,message:String(job.progressMessage??'Consulta em andamento.')};
    const rows=await this.connector.rawRows(jobId,'EmployeeLookup');
    const first=rows.find((r)=>r && typeof r==='object') as EmployeeLookupResult|undefined;
    if(!first?.sageEmployeeCode) return {status:'NOT_FOUND',employee:null,message:'Funcionário não encontrado no Sage.'};
    return {status:'FOUND',employee:{...first,cpf:normalizeCpf(first.cpf)}};
  }

  async createFromLookup(actorId:number,jobId:number,groupId:number,meta:RequestMeta):Promise<number>{
    const result=await this.lookupResult(jobId);
    if(result.status!=='FOUND'||!result.employee) throw badRequest('O funcionário precisa ser localizado no Sage antes do cadastro.');
    const e=result.employee;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(e.birthDate)) throw badRequest('O Sage não retornou uma data de nascimento válida. Cadastro bloqueado.');
    const [groups]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM employee_groups WHERE id=? AND status='ACTIVE' LIMIT 1`,[groupId]);
    if(!groups[0]) throw badRequest('Grupo inválido ou inativo.');
    const conn=await this.pool.getConnection();
    try{
      await conn.beginTransaction();
      const [insert]=await conn.execute<ResultSetHeader>(
        `INSERT INTO employees (company_code,sage_employee_code,cpf,name,birth_date,admission_date,job_title,phone,sage_status,group_id,status,sage_snapshot_json,created_by_user_id,created_at,updated_at)
         VALUES ('1',?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [String(e.sageEmployeeCode),normalizeCpf(e.cpf),String(e.name),e.birthDate,e.admissionDate??null,e.jobTitle??null,e.phone??null,e.status??null,groupId,JSON.stringify(e.raw??e),actorId]
      );
      const id=insert.insertId;
      await conn.execute(`INSERT INTO employee_credentials (employee_id,pin_hash,activated_at,pin_changed_at,failed_attempts,locked_until,last_login_at,updated_at) VALUES (?,NULL,NULL,NULL,0,NULL,NULL,UTC_TIMESTAMP())`,[id]);
      await conn.execute(`INSERT INTO group_membership_history (employee_id,from_group_id,to_group_id,changed_by_user_id,changed_at) VALUES (?,NULL,?,?,UTC_TIMESTAMP())`,[id,groupId,actorId]);
      await conn.commit();
      await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_CREATED',targetType:'EMPLOYEE',targetId:id,meta,metadata:{groupId,sageEmployeeCode:e.sageEmployeeCode}});
      return id;
    }catch(error){await conn.rollback();if((error as {code?:string}).code==='ER_DUP_ENTRY') throw conflict('Funcionário já cadastrado.');throw error;}finally{conn.release();}
  }

  async list(search=''):Promise<Record<string,unknown>[]>{
    const term=`%${search.trim()}%`;
    const [rows]=await this.pool.execute<RowDataPacket[]>(
      `SELECT e.id,e.name,e.cpf,e.sage_employee_code sageEmployeeCode,e.company_code companyCode,e.birth_date birthDate,e.admission_date admissionDate,
              e.job_title jobTitle,e.phone,e.sage_status sageStatus,e.status,e.group_id groupId,g.name groupName,
              CASE WHEN c.pin_hash IS NULL THEN 'PENDING_FIRST_ACCESS' ELSE 'ACTIVE' END accessStatus,c.activated_at activatedAt,c.last_login_at lastLoginAt
         FROM employees e JOIN employee_groups g ON g.id=e.group_id LEFT JOIN employee_credentials c ON c.employee_id=e.id
        WHERE (?='%%' OR e.name LIKE ? OR e.cpf LIKE ? OR e.sage_employee_code LIKE ?)
        ORDER BY e.name ASC LIMIT 500`,[term,term,term,term]);
    return rows;
  }

  async detail(id:number):Promise<Record<string,unknown>>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(
      `SELECT e.*,g.name groupName,c.activated_at activatedAt,c.last_login_at lastLoginAt,CASE WHEN c.pin_hash IS NULL THEN 0 ELSE 1 END hasPin
       FROM employees e JOIN employee_groups g ON g.id=e.group_id LEFT JOIN employee_credentials c ON c.employee_id=e.id WHERE e.id=? LIMIT 1`,[id]);
    const row=rows[0];if(!row)throw notFound('Funcionário não encontrado.');
    return {...row,sageSnapshot:parseJson(row.sage_snapshot_json,null),sage_snapshot_json:undefined};
  }

  async moveGroup(actorId:number,employeeId:number,toGroupId:number,meta:RequestMeta):Promise<void>{
    const [employeeRows]=await this.pool.execute<RowDataPacket[]>(`SELECT group_id groupId FROM employees WHERE id=? LIMIT 1`,[employeeId]);
    const employee=employeeRows[0];if(!employee)throw notFound('Funcionário não encontrado.');
    const [groupRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM employee_groups WHERE id=? AND status='ACTIVE' LIMIT 1`,[toGroupId]);if(!groupRows[0])throw badRequest('Grupo inválido.');
    const from=Number(employee.groupId);if(from===toGroupId)return;
    const conn=await this.pool.getConnection();try{await conn.beginTransaction();await conn.execute(`UPDATE employees SET group_id=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[toGroupId,employeeId]);await conn.execute(`INSERT INTO group_membership_history (employee_id,from_group_id,to_group_id,changed_by_user_id,changed_at) VALUES (?,?,?,?,UTC_TIMESTAMP())`,[employeeId,from,toGroupId,actorId]);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_GROUP_CHANGED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{fromGroupId:from,toGroupId}});
  }

  async setStatus(actorId:number,employeeId:number,status:'ACTIVE'|'DISABLED'|'TERMINATED',meta:RequestMeta):Promise<void>{
    const [result]=await this.pool.execute<ResultSetHeader>(`UPDATE employees SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[status,employeeId]);if(result.affectedRows===0)throw notFound('Funcionário não encontrado.');
    if(status!=='ACTIVE') await this.pool.execute(`UPDATE employee_sessions SET revoked_at=UTC_TIMESTAMP() WHERE employee_id=? AND revoked_at IS NULL`,[employeeId]);
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_STATUS_CHANGED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{status}});
  }
}
