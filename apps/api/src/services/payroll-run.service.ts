import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, notFound } from '../core/errors.js';
import { currentCompetency } from '../core/time.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { ConnectorService } from './connector.service.js';

export class PayrollRunService{
  constructor(private pool:Pool,private connector:ConnectorService,private audit:AuditService){}

  async startGroup(actorId:number,groupId:number,meta:RequestMeta,source:'MANUAL'|'SCHEDULED'='MANUAL'):Promise<{runId:number;jobId:number}>{
    const [groups]=await this.pool.execute<RowDataPacket[]>(`SELECT id,payroll_types_json types,status FROM employee_groups WHERE id=? LIMIT 1`,[groupId]);const group=groups[0];if(!group||group.status!=='ACTIVE')throw notFound('Grupo não encontrado ou inativo.');
    const types=JSON.parse(String(group.types)) as number[];const [employees]=await this.pool.execute<RowDataPacket[]>(`SELECT id,sage_employee_code code FROM employees WHERE group_id=? AND status='ACTIVE' ORDER BY id`,[groupId]);if(employees.length===0)throw badRequest('O grupo não possui funcionários ativos.');
    const {year,month}=currentCompetency();const [run]=await this.pool.execute<ResultSetHeader>(`INSERT INTO payroll_runs (group_id,requested_by_user_id,source,year,month,payroll_types_json,employee_count,status,created_at) VALUES (?,?,?,?,?,?,?,'QUEUED',UTC_TIMESTAMP())`,[groupId,source==='SCHEDULED'?null:actorId,source,year,month,JSON.stringify(types),employees.length]);
    const employeeCodes=employees.map((e)=>String(e.code));const jobId=await this.connector.createJob({requestedByUserId:source==='SCHEDULED'?null:actorId,payrollRunId:run.insertId,jobType:'PAYROLL_IMPORT',scope:{companyCode:'1',employeeCodes,year,month,types,fromAdmission:false}});
    await this.audit.record({actorUserId:source==='SCHEDULED'?null:actorId,action:source==='SCHEDULED'?'GROUP_AUTOMATIC_SEARCH':'GROUP_MANUAL_SEARCH',targetType:'PAYROLL_RUN',targetId:run.insertId,meta,metadata:{groupId,jobId,year,month,types,employeeCount:employees.length}});
    return {runId:run.insertId,jobId};
  }

  async startEmployee(actorId:number,employeeId:number,types:number[],meta:RequestMeta):Promise<{runId:number;jobId:number}>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT sage_employee_code code,status FROM employees WHERE id=? LIMIT 1`,[employeeId]);const employee=rows[0];if(!employee||employee.status!=='ACTIVE')throw notFound('Funcionário não encontrado ou inativo.');
    const cleanTypes=[...new Set(types.map(Number))].filter((v)=>[2,3,4,6].includes(v));if(cleanTypes.length===0)throw badRequest('Selecione pelo menos um tipo de folha.');const {year,month}=currentCompetency();
    const [run]=await this.pool.execute<ResultSetHeader>(`INSERT INTO payroll_runs (group_id,requested_by_user_id,source,year,month,payroll_types_json,employee_count,status,created_at) VALUES (NULL,?,'INDIVIDUAL',?,?,?,1,'QUEUED',UTC_TIMESTAMP())`,[actorId,year,month,JSON.stringify(cleanTypes)]);
    const jobId=await this.connector.createJob({requestedByUserId:actorId,payrollRunId:run.insertId,jobType:'PAYROLL_IMPORT',scope:{companyCode:'1',employeeCodes:[String(employee.code)],year,month,types:cleanTypes,fromAdmission:false}});
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_MANUAL_SEARCH',targetType:'PAYROLL_RUN',targetId:run.insertId,meta,metadata:{employeeId,jobId,year,month,types:cleanTypes}});return {runId:run.insertId,jobId};
  }

  async list(limit=100):Promise<Record<string,unknown>[]>{const safe=Math.min(Math.max(limit,1),300);const [rows]=await this.pool.query<RowDataPacket[]>(`SELECT r.*,g.name groupName,u.name requestedByName FROM payroll_runs r LEFT JOIN employee_groups g ON g.id=r.group_id LEFT JOIN users u ON u.id=r.requested_by_user_id ORDER BY r.id DESC LIMIT ${safe}`);return rows;}
}
