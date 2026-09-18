import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { isValidCpf, maskCpf, normalizeCpf } from '../core/security.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { ConnectorService } from './connector.service.js';
import { StorageService } from './storage.service.js';
import { employeeDeletionBlockReason } from './employee-delete-policy.js';
import { inferSageJobTitle, normalizeEmployeePhone, sageEmployeePatch } from './employee-data.js';
import { buildPayrollPdf } from './pdf.service.js';

export interface EmployeeLookupResult {
  sageEmployeeCode: string;
  name: string;
  cpf: string;
  birthDate: string;
  admissionDate?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  status?: string | null;
  currentSalary?: number | null;
  terminationDate?: string | null;
  terminationType?: string | null;
  noticeStartDate?: string | null;
  noticeDays?: number | null;
  raw?: Record<string, unknown>;
}

const cboAliases=['cbo_atual','cbo2002','cbo','cd_cbo','nr_cbo','codigo_cbo','cbo_funcao','cd_cbo_funcao'];
function sageSnapshotValue(raw:unknown,aliases:string[]):string|null{
  const snapshot=parseJson<Record<string,unknown>>(raw,{});const entries=new Map(Object.entries(snapshot).map(([key,value])=>[key.toLowerCase(),value]));
  for(const alias of aliases){const value=entries.get(alias.toLowerCase());if(value!==undefined&&value!==null&&String(value).trim()!=='')return String(value).trim();}
  return null;
}

export class EmployeeService {
  constructor(private pool:Pool, private connector:ConnectorService, private audit:AuditService, private storage:StorageService){}

  async startLookup(actorId:number,cpfInput:string,meta:RequestMeta):Promise<number>{
    const cpf=normalizeCpf(cpfInput);
    if(!isValidCpf(cpf)) throw badRequest('CPF inválido.');
    const [existing]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM employees WHERE cpf=? LIMIT 1`,[cpf]);
    if(existing[0]) throw conflict('Este funcionário já está cadastrado no PayHub.');
    const jobId=await this.connector.createJob({requestedByUserId:actorId,jobType:'EMPLOYEE_LOOKUP_BY_CPF',scope:{companyCode:'1',cpf}});
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_LOOKUP_REQUESTED',targetType:'IMPORT_JOB',targetId:jobId,meta,metadata:{cpfLast4:cpf.slice(-4)}});
    return jobId;
  }

  async startSync(actorId:number,employeeId:number,meta:RequestMeta):Promise<number>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT cpf,sage_employee_code sageEmployeeCode FROM employees WHERE id=? LIMIT 1`,[employeeId]);
    const row=rows[0];if(!row)throw notFound('Funcionário não encontrado.');
    const cpf=normalizeCpf(String(row.cpf));
    const jobId=await this.connector.createJob({requestedByUserId:actorId,jobType:'EMPLOYEE_LOOKUP_BY_CPF',scope:{companyCode:'1',cpf}});
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_SAGE_SYNC_REQUESTED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{jobId,sageEmployeeCode:String(row.sageEmployeeCode)}});
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
    const jobTitle=(first.jobTitle&&String(first.jobTitle).trim())||inferSageJobTitle(first.raw)||null;
    return {status:'FOUND',employee:{...first,cpf:normalizeCpf(first.cpf),jobTitle}};
  }

  async createFromLookup(actorId:number,jobId:number,groupId:number,phoneInput:string|undefined,meta:RequestMeta):Promise<number>{
    const result=await this.lookupResult(jobId);
    if(result.status!=='FOUND'||!result.employee) throw badRequest('O funcionário precisa ser localizado no Sage antes do cadastro.');
    const e=result.employee;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(e.birthDate)) throw badRequest('O Sage não retornou uma data de nascimento válida. Cadastro bloqueado.');
    let phone='';try{phone=normalizeEmployeePhone(phoneInput??e.phone??'');}catch{throw badRequest('Telefone deve possuir DDD e 10 ou 11 dígitos.');}
    const snapshot={...(e.raw??e),...(phone?{telefone_payhub:phone}:{})};
    const [groups]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM employee_groups WHERE id=? AND status='ACTIVE' LIMIT 1`,[groupId]);
    if(!groups[0]) throw badRequest('Grupo inválido ou inativo.');
    const conn=await this.pool.getConnection();
    try{
      await conn.beginTransaction();
      const [insert]=await conn.execute<ResultSetHeader>(
        `INSERT INTO employees (company_code,sage_employee_code,cpf,name,birth_date,admission_date,job_title,phone,sage_status,group_id,status,sage_snapshot_json,created_by_user_id,created_at,updated_at)
         VALUES ('1',?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [String(e.sageEmployeeCode),normalizeCpf(e.cpf),String(e.name),e.birthDate,e.admissionDate??null,e.jobTitle??null,phone||null,e.status??null,groupId,JSON.stringify(snapshot),actorId]
      );
      const id=insert.insertId;
      await conn.execute(`INSERT INTO employee_credentials (employee_id,pin_hash,activated_at,pin_changed_at,failed_attempts,locked_until,last_login_at,updated_at) VALUES (?,NULL,NULL,NULL,0,NULL,NULL,UTC_TIMESTAMP())`,[id]);
      await conn.execute(`INSERT INTO group_membership_history (employee_id,from_group_id,to_group_id,changed_by_user_id,changed_at) VALUES (?,NULL,?,?,UTC_TIMESTAMP())`,[id,groupId,actorId]);
      await conn.commit();
      await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_CREATED',targetType:'EMPLOYEE',targetId:id,meta,metadata:{groupId,sageEmployeeCode:e.sageEmployeeCode}});
      return id;
    }catch(error){await conn.rollback();if((error as {code?:string}).code==='ER_DUP_ENTRY') throw conflict('Funcionário já cadastrado.');throw error;}finally{conn.release();}
  }

  async applySync(actorId:number,employeeId:number,jobId:number,meta:RequestMeta):Promise<void>{
    const result=await this.lookupResult(jobId);
    if(result.status!=='FOUND'||!result.employee)throw badRequest('A sincronização precisa concluir a consulta no Sage antes de aplicar os dados.');
    const e=result.employee;
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT cpf,sage_employee_code sageEmployeeCode FROM employees WHERE id=? LIMIT 1`,[employeeId]);
    const current=rows[0];if(!current)throw notFound('Funcionário não encontrado.');
    if(normalizeCpf(String(current.cpf))!==normalizeCpf(e.cpf)||String(current.sageEmployeeCode)!==String(e.sageEmployeeCode))throw conflict('O resultado do Sage não corresponde ao funcionário selecionado.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(e.birthDate))throw badRequest('O Sage não retornou uma data de nascimento válida. Sincronização bloqueada.');
    const patch=sageEmployeePatch(e);
    await this.pool.execute(`UPDATE employees SET name=?,birth_date=?,admission_date=?,job_title=?,sage_status=?,sage_snapshot_json=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[patch.name,patch.birthDate,patch.admissionDate,patch.jobTitle,patch.sageStatus,patch.snapshotJson,employeeId]);
    const refreshedPayrolls=await this.refreshUnsignedPayrollDocuments(employeeId);
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_SAGE_SYNC_APPLIED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{jobId,jobTitle:patch.jobTitle,sageStatus:patch.sageStatus,refreshedUnsignedPayrolls:refreshedPayrolls}});
  }

  private async refreshUnsignedPayrollDocuments(employeeId:number):Promise<number>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.id,p.year,p.month,p.payroll_type payrollType,p.payroll_type_label typeLabel,p.gross_amount gross,p.deduction_amount deductions,p.net_amount net,p.raw_reference_json rawReferenceJson,d.original_path originalPath,e.name,e.cpf,e.sage_employee_code sageCode,e.job_title jobTitle,DATE_FORMAT(e.admission_date,'%Y-%m-%d') admissionDate,e.sage_snapshot_json sageSnapshotJson FROM payrolls p JOIN payroll_documents d ON d.payroll_id=p.id JOIN employees e ON e.id=p.employee_id WHERE p.employee_id=? AND p.is_current=1 AND p.status<>'SIGNED'`,[employeeId]);
    let refreshed=0;
    for(const row of rows){
      const [itemRows]=await this.pool.execute<RowDataPacket[]>(`SELECT event_code code,description,reference_value referenceValue,amount,nature FROM payroll_items WHERE payroll_id=? ORDER BY sort_order,id`,[row.id]);
      const items=itemRows.map((item)=>({code:String(item.code),description:String(item.description),reference:item.referenceValue==null?null:String(item.referenceValue),amount:Number(item.amount),nature:String(item.nature)}));
      const rawReference=parseJson<Record<string,unknown>>(row.rawReferenceJson,{});const base=(rawReference.base??{}) as Record<string,unknown>;
      const salaryBase=items.find((item)=>item.code==='1'&&item.nature==='EARNING')?.amount??null;const fgtsBase=base.vl_base_fgts==null?null:Number(base.vl_base_fgts);
      const pdf=buildPayrollPdf({employeeName:String(row.name),cpfMasked:maskCpf(String(row.cpf)),sageCode:String(row.sageCode),competence:`${String(row.month).padStart(2,'0')}/${row.year}`,typeLabel:String(row.typeLabel),jobTitle:row.jobTitle?String(row.jobTitle):null,admissionDate:row.admissionDate?String(row.admissionDate):null,cbo:sageSnapshotValue(row.sageSnapshotJson,cboAliases),gross:row.gross==null?null:Number(row.gross),deductions:row.deductions==null?null:Number(row.deductions),net:row.net==null?null:Number(row.net),salaryBase,inssBase:base.vl_base_inss==null?null:Number(base.vl_base_inss),fgtsBase,fgtsMonth:fgtsBase==null?null:Math.round(fgtsBase*8)/100,irrfBase:base.vl_base_irrf==null?null:Number(base.vl_base_irrf),irrfBracket:0,items});
      const stored=await this.storage.write(String(row.originalPath),pdf);await this.pool.execute(`UPDATE payroll_documents SET original_sha256=?,updated_at=UTC_TIMESTAMP() WHERE payroll_id=?`,[stored.sha256,row.id]);refreshed++;
    }
    return refreshed;
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
    const [signedRows]=await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) value FROM payrolls WHERE employee_id=? AND status='SIGNED'`,[id]);
    return {...row,hasSignedPayroll:Number(signedRows[0]?.value??0)>0,sageSnapshot:parseJson(row.sage_snapshot_json,null),sage_snapshot_json:undefined};
  }

  async moveGroup(actorId:number,employeeId:number,toGroupId:number,meta:RequestMeta):Promise<void>{
    const [employeeRows]=await this.pool.execute<RowDataPacket[]>(`SELECT group_id groupId FROM employees WHERE id=? LIMIT 1`,[employeeId]);
    const employee=employeeRows[0];if(!employee)throw notFound('Funcionário não encontrado.');
    const [groupRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM employee_groups WHERE id=? AND status='ACTIVE' LIMIT 1`,[toGroupId]);if(!groupRows[0])throw badRequest('Grupo inválido.');
    const from=Number(employee.groupId);if(from===toGroupId)return;
    const conn=await this.pool.getConnection();try{await conn.beginTransaction();await conn.execute(`UPDATE employees SET group_id=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[toGroupId,employeeId]);await conn.execute(`INSERT INTO group_membership_history (employee_id,from_group_id,to_group_id,changed_by_user_id,changed_at) VALUES (?,?,?,?,UTC_TIMESTAMP())`,[employeeId,from,toGroupId,actorId]);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_GROUP_CHANGED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{fromGroupId:from,toGroupId}});
  }


  async deleteEmployee(actorId:number,employeeId:number,meta:RequestMeta):Promise<void>{
    const [employeeRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,name,cpf,sage_employee_code sageCode FROM employees WHERE id=? LIMIT 1`,[employeeId]);
    const employee=employeeRows[0];if(!employee)throw notFound('Funcionário não encontrado.');
    const [statusRows]=await this.pool.execute<RowDataPacket[]>(`SELECT status FROM payrolls WHERE employee_id=?`,[employeeId]);
    const block=employeeDeletionBlockReason(statusRows.map((r)=>String(r.status)));
    const [evidenceRows]=await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) value FROM signature_evidence WHERE employee_id=?`,[employeeId]);
    if(block||Number(evidenceRows[0]?.value??0)>0)throw conflict('Funcionário possui holerite assinado e não pode ser excluído.');
    const [requestRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM signature_requests WHERE employee_id=?`,[employeeId]);
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_DELETE_REQUESTED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{name:String(employee.name),cpfLast4:String(employee.cpf).slice(-4),sageEmployeeCode:String(employee.sageCode)}});
    const conn=await this.pool.getConnection();
    try{
      await conn.beginTransaction();
      const [locked]=await conn.execute<RowDataPacket[]>(`SELECT id FROM employees WHERE id=? FOR UPDATE`,[employeeId]);if(!locked[0])throw notFound('Funcionário não encontrado.');
      const [lockedStatuses]=await conn.execute<RowDataPacket[]>(`SELECT status FROM payrolls WHERE employee_id=? FOR UPDATE`,[employeeId]);
      const lockedBlock=employeeDeletionBlockReason(lockedStatuses.map((r)=>String(r.status)));
      const [lockedEvidence]=await conn.execute<RowDataPacket[]>(`SELECT COUNT(*) value FROM signature_evidence WHERE employee_id=?`,[employeeId]);
      if(lockedBlock||Number(lockedEvidence[0]?.value??0)>0)throw conflict('Funcionário possui holerite assinado e não pode ser excluído.');
      await conn.execute(`DELETE se FROM signature_events se JOIN signature_requests sr ON sr.id=se.signature_request_id WHERE sr.employee_id=?`,[employeeId]);
      await conn.execute(`DELETE sl FROM signature_links sl JOIN signature_requests sr ON sr.id=sl.signature_request_id WHERE sr.employee_id=?`,[employeeId]);
      await conn.execute(`DELETE sev FROM signature_evidence sev WHERE sev.employee_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM signature_requests WHERE employee_id=?`,[employeeId]);
      await conn.execute(`DELETE dal FROM document_access_logs dal JOIN payrolls p ON p.id=dal.payroll_id WHERE p.employee_id=?`,[employeeId]);
      await conn.execute(`DELETE pd FROM payroll_documents pd JOIN payrolls p ON p.id=pd.payroll_id WHERE p.employee_id=?`,[employeeId]);
      await conn.execute(`DELETE pi FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id WHERE p.employee_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM payrolls WHERE employee_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM employee_sessions WHERE employee_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM employee_credentials WHERE employee_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM group_membership_history WHERE employee_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM push_subscriptions WHERE principal_type='EMPLOYEE' AND principal_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM push_preferences WHERE principal_type='EMPLOYEE' AND principal_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM notifications WHERE recipient_type='EMPLOYEE' AND recipient_id=?`,[employeeId]);
      await conn.execute(`DELETE FROM employees WHERE id=?`,[employeeId]);
      await conn.commit();
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    await Promise.allSettled([this.storage.removeTree(`payrolls/${employeeId}`),...requestRows.map((r)=>this.storage.removeTree(`signatures/${Number(r.id)}`))]);
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_DELETED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{name:String(employee.name),cpfLast4:String(employee.cpf).slice(-4),sageEmployeeCode:String(employee.sageCode)}});
  }

  async setStatus(actorId:number,employeeId:number,status:'ACTIVE'|'DISABLED'|'TERMINATED',meta:RequestMeta):Promise<void>{
    const [result]=await this.pool.execute<ResultSetHeader>(`UPDATE employees SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[status,employeeId]);if(result.affectedRows===0)throw notFound('Funcionário não encontrado.');
    if(status!=='ACTIVE') await this.pool.execute(`UPDATE employee_sessions SET revoked_at=UTC_TIMESTAMP() WHERE employee_id=? AND revoked_at IS NULL`,[employeeId]);
    await this.audit.record({actorUserId:actorId,action:'EMPLOYEE_STATUS_CHANGED',targetType:'EMPLOYEE',targetId:employeeId,meta,metadata:{status}});
  }
}
